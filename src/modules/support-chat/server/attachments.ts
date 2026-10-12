import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import sharp from "sharp";
import { ATTACHMENT_MAX_BYTES } from "../lib/constants.ts";
import type { SupportAttachmentDTO } from "../lib/events.ts";
import {
	aad,
	decryptBytes,
	encryptBytes,
	encryptText,
	generateDataKey,
	unwrapDataKey,
} from "./crypto.ts";
import { drizzleOf, num, queryOne } from "./db.ts";
import { SupportError } from "./errors.ts";
import { toAttachmentDTO } from "./messages.db.ts";
import { attachmentsDir } from "./storage-path.ts";

export { attachmentsDir };

import type { SupportActor } from "./permissions.ts";

/**
 * Вложения чата: приём, проверка, перекодирование, шифрование, выдача.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРИЁМ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Тип — по сигнатуре содержимого, а не по имени и не по Content-Type
 *     клиента. Офисные файлы с макросами (vbaProject.bin) отклоняются.
 *  2. Изображение декодируется и кодируется заново sharp с потолком
 *     пикселей: «бомба» на 100 000 × 100 000 отсекается до декодирования,
 *     EXIF с геометками не переживает перекодирования, а повреждённый файл
 *     отклоняется. Библиотека image-size (у неё открытая уязвимость, см.
 *     pnpm audit) в этом пути не участвует вовсе.
 *  3. Оригинал и превью шифруются собственным ключом вложения и пишутся под
 *     случайным именем; исходное имя файла — тоже шифртекстом в базе.
 *
 * Файл недоступен никому, пока не прикреплён к сообщению, кроме загрузившего
 * (см. access коллекции support-attachments и canReadAttachment ниже).
 */

const MAX_IMAGE_SIDE = 2560;
const THUMBNAIL_SIDE = 480;
/** Потолок декодирования: ~40 Мп с запасом покрывают любую камеру телефона. */
const MAX_INPUT_PIXELS = 40_000_000;
/** Сколько неотправленных файлов может висеть у одного человека. */
export const MAX_PENDING_UPLOADS = 20;

type DetectedType =
	| {
			kind: "image";
			mime: "image/jpeg" | "image/png" | "image/webp";
			ext: string;
	  }
	| { kind: "document"; mime: string; ext: string };

const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
	return bytes.every((byte, i) => buffer[offset + i] === byte);
}

/** Тип по содержимому. null — не из белого списка. */
export function detectFileType(buffer: Buffer): DetectedType | null {
	if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
		return { kind: "image", mime: "image/jpeg", ext: "jpg" };
	}
	if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return { kind: "image", mime: "image/png", ext: "png" };
	}
	if (
		buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
		buffer.subarray(8, 12).toString("latin1") === "WEBP"
	) {
		return { kind: "image", mime: "image/webp", ext: "webp" };
	}
	if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
		return { kind: "document", mime: "application/pdf", ext: "pdf" };
	}
	// OOXML — ZIP-контейнер; что внутри, видно по именам частей в оглавлении.
	if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
		if (!buffer.includes("[Content_Types].xml")) return null;
		// Макросы — исполняемое содержимое; принимать его от покупателя нельзя.
		if (buffer.includes("vbaProject.bin")) return null;
		if (buffer.includes("word/document.xml"))
			return { kind: "document", mime: DOCX, ext: "docx" };
		if (buffer.includes("xl/workbook.xml"))
			return { kind: "document", mime: XLSX, ext: "xlsx" };
	}
	return null;
}

/**
 * Имя файла для показа: без пути, без управляющих символов, разумной длины и
 * с расширением настоящего типа (а не тем, что пришло).
 */
export function sanitizeFilename(original: string, ext: string): string {
	const base = original
		.split(/[\\/]/)
		.pop()
		?.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
		.replace(/\.[^.]*$/, "")
		.trim()
		.slice(0, 100);
	return `${base || "файл"}.${ext}`;
}

function filePath(
	storageKey: string,
	variant: "original" | "thumbnail",
): string {
	// storageKey — наш UUID, а не ввод пользователя; проверка — страховка от
	// подмены строки в базе.
	if (!/^[0-9a-f-]{36}$/.test(storageKey)) {
		throw new SupportError("not_found", "Файл не найден");
	}
	return path.join(
		attachmentsDir(),
		variant === "thumbnail" ? `${storageKey}.thumb` : storageKey,
	);
}

/** Запись через временный файл: читатель никогда не увидит половину. */
async function writeAtomic(target: string, data: Buffer): Promise<void> {
	const temp = `${target}.${process.pid}.tmp`;
	await writeFile(temp, data, { mode: 0o600 });
	await rename(temp, target);
}

interface ProcessedFile {
	mime: string;
	data: Buffer;
	thumbnail: Buffer | null;
	width: number | null;
	height: number | null;
}

async function processImage(
	buffer: Buffer,
	mime: DetectedType["mime"],
): Promise<ProcessedFile> {
	try {
		const pipeline = sharp(buffer, {
			limitInputPixels: MAX_INPUT_PIXELS,
			failOn: "error",
		})
			.rotate()
			.resize({
				width: MAX_IMAGE_SIDE,
				height: MAX_IMAGE_SIDE,
				fit: "inside",
				withoutEnlargement: true,
			});
		const encoded =
			mime === "image/png"
				? pipeline.png({ compressionLevel: 9 })
				: mime === "image/webp"
					? pipeline.webp({ quality: 85 })
					: pipeline.jpeg({ quality: 85, mozjpeg: true });
		const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
		const thumbnail = await sharp(data)
			.resize({
				width: THUMBNAIL_SIDE,
				height: THUMBNAIL_SIDE,
				fit: "inside",
				withoutEnlargement: true,
			})
			.webp({ quality: 75 })
			.toBuffer();
		return { mime, data, thumbnail, width: info.width, height: info.height };
	} catch {
		throw new SupportError("invalid", "Не удалось прочитать изображение");
	}
}

export interface UploadInput {
	actor: SupportActor;
	filename: string;
	data: Buffer;
}

/** Принять файл: проверить, перекодировать, зашифровать, сохранить. */
export async function storeAttachment(
	payload: Payload,
	input: UploadInput,
): Promise<SupportAttachmentDTO> {
	if (input.data.length === 0) throw new SupportError("invalid", "Пустой файл");
	if (input.data.length > ATTACHMENT_MAX_BYTES) {
		throw new SupportError("invalid", "Файл больше 10 МБ");
	}

	const detected = detectFileType(input.data);
	if (!detected) {
		throw new SupportError(
			"invalid",
			"Можно прикрепить фото (JPEG, PNG, WebP), PDF, документ Word или таблицу Excel",
		);
	}

	const db = drizzleOf(payload);
	const owner =
		input.actor.kind === "customer"
			? sql`uploaded_by_user_id = ${input.actor.userId}`
			: sql`uploaded_by_admin_id = ${input.actor.adminId}`;
	const pending = await queryOne(
		db,
		sql`SELECT count(*)::int AS n FROM support_attachments
			WHERE message_id IS NULL AND ${owner}`,
	);
	if (num(pending?.n) >= MAX_PENDING_UPLOADS) {
		throw new SupportError(
			"rate_limited",
			"Слишком много неотправленных файлов",
		);
	}

	const processed: ProcessedFile =
		detected.kind === "image"
			? await processImage(input.data, detected.mime)
			: {
					mime: detected.mime,
					data: input.data,
					thumbnail: null,
					width: null,
					height: null,
				};

	const storageKey = randomUUID();
	const { key, wrapped } = generateDataKey();
	const name = sanitizeFilename(input.filename, detected.ext);

	await mkdir(attachmentsDir(), { recursive: true, mode: 0o700 });
	const originalPath = filePath(storageKey, "original");
	const thumbnailPath = filePath(storageKey, "thumbnail");
	await writeAtomic(
		originalPath,
		encryptBytes(
			key,
			processed.data,
			aad.attachmentFile(storageKey, "original"),
		),
	);
	if (processed.thumbnail) {
		await writeAtomic(
			thumbnailPath,
			encryptBytes(
				key,
				processed.thumbnail,
				aad.attachmentFile(storageKey, "thumbnail"),
			),
		);
	}

	try {
		const row = await queryOne(
			db,
			sql`INSERT INTO support_attachments (
					uploaded_by_user_id, uploaded_by_admin_id, mime_type, filesize, width, height,
					has_thumbnail, storage_key, encrypted_name, encryption_key
				) VALUES (
					${input.actor.kind === "customer" ? input.actor.userId : null},
					${input.actor.kind === "staff" ? input.actor.adminId : null},
					${processed.mime}, ${processed.data.length}, ${processed.width}, ${processed.height},
					${processed.thumbnail !== null}, ${storageKey},
					${encryptText(key, name, aad.attachmentName(storageKey))}, ${wrapped}
				)
				RETURNING *`,
		);
		if (!row) throw new Error("Вложение не сохранилось");
		return toAttachmentDTO(row);
	} catch (error) {
		// Запись в базу не удалась — файлы без записи никому не нужны.
		await Promise.allSettled([unlink(originalPath), unlink(thumbnailPath)]);
		throw error;
	}
}

/**
 * Право прочитать файл: персонал — любой; покупатель — загруженный им или
 * открытый ему (visible_to_user_id). Те же правила, что в access коллекции.
 */
function canReadAttachment(
	actor: SupportActor,
	row: { uploaded_by_user_id: unknown; visible_to_user_id: unknown },
): boolean {
	if (actor.kind === "staff") return true;
	return (
		Number(row.uploaded_by_user_id) === actor.userId ||
		Number(row.visible_to_user_id) === actor.userId
	);
}

export interface AttachmentContent {
	data: Buffer;
	mimeType: string;
	filename: string;
}

export async function readAttachment(
	payload: Payload,
	actor: SupportActor,
	attachmentId: number,
	variant: "original" | "thumbnail",
): Promise<AttachmentContent> {
	const row = await queryOne(
		drizzleOf(payload),
		sql`SELECT * FROM support_attachments WHERE id = ${attachmentId}`,
	);
	// «Нет такого» и «чужой» неразличимы: перебор id ничего не сообщает.
	if (!row || !canReadAttachment(actor, row as never)) {
		throw new SupportError("not_found", "Файл не найден");
	}
	if (variant === "thumbnail" && row.has_thumbnail !== true) {
		throw new SupportError("not_found", "У файла нет превью");
	}

	const storageKey = String(row.storage_key);
	let sealed: Buffer;
	try {
		sealed = await readFile(filePath(storageKey, variant));
	} catch {
		throw new SupportError("not_found", "Файл не найден");
	}
	const key = unwrapDataKey(String(row.encryption_key));
	const dto = toAttachmentDTO(row);
	return {
		data: decryptBytes(key, sealed, aad.attachmentFile(storageKey, variant)),
		mimeType: variant === "thumbnail" ? "image/webp" : String(row.mime_type),
		filename: dto.filename,
	};
}

/** Удалить файлы вложения с диска (уборка неотправленных, удаление аккаунта). */
export async function deleteAttachmentFiles(storageKey: string): Promise<void> {
	await Promise.allSettled([
		unlink(filePath(storageKey, "original")),
		unlink(filePath(storageKey, "thumbnail")),
	]);
}
