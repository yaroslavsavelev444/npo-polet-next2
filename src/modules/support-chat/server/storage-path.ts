import path from "node:path";

/**
 * Каталог зашифрованных вложений. Отдельным модулем, без sharp и без
 * Payload: путь нужен и шлюзу (уборка файлов-сирот), и приложению (загрузка
 * и выдача).
 */
export function attachmentsDir(): string {
	return (
		process.env.SUPPORT_ATTACHMENTS_DIR ||
		path.resolve(process.cwd(), "media", "support-attachments")
	);
}
