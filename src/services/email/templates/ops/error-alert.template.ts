import type { SafeAlert, Severity } from "../../../observability/types.ts";
import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

/**
 * Письмо дежурному о серверной ошибке.
 *
 * Данные — только `SafeAlert`: шаблон физически не получает ни адреса, ни
 * телефона, ни идентификатора покупателя (см. observability/safe-payload.ts).
 * Полная запись открывается по ссылке «Открыть запись» — в админке, только
 * суперадминистратору.
 *
 * Тема — не «Ошибка на сайте»: по списку писем решают, срочно ли это. В
 * теме уровень, класс ошибки, модуль и число повторов. Словами, а не
 * эмодзи: почтовые клиенты обходятся с ними в теме по-разному.
 */

const SEVERITY_LABEL: Record<Severity, string> = {
	fatal: "ПАДЕНИЕ",
	error: "ОШИБКА",
	warning: "ПРЕДУПРЕЖДЕНИЕ",
};

const SEVERITY_COLOR: Record<Severity, string> = {
	fatal: "#B91C1C",
	error: "#DC2626",
	warning: "#B45309",
};

const SOURCE_LABEL: Record<SafeAlert["source"], string> = {
	http: "HTTP-запрос",
	action: "Server Action",
	render: "рендер страницы",
	payload: "API / админка Payload",
	job: "фоновая задача",
	process: "процесс",
};

const TRIGGER_LABEL: Record<SafeAlert["stats"]["trigger"], string> = {
	new: "новая ошибка",
	"cooldown-expired": "сводка за период",
	burst: "резкий рост частоты",
};

const PRE_STYLE =
	"margin:8px 0 0;padding:12px 14px;background:#F4F4F5;border-radius:8px;" +
	"font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;" +
	"white-space:pre-wrap;word-break:break-all;color:#18181B;";

export function errorAlertSubject(alert: SafeAlert): string {
	const parts = [
		`[npo-polet/${alert.environment}]`,
		SEVERITY_LABEL[alert.severity],
		`${alert.errorName}${alert.code ? ` (${alert.code})` : ""}`,
	];
	if (alert.module) parts.push(`· ${alert.module}`);
	if (alert.stats.occurrences > 1) parts.push(`· ×${alert.stats.occurrences}`);

	const subject = parts.join(" ");
	return subject.length > 200 ? `${subject.slice(0, 199)}…` : subject;
}

/** Факты о случае. Пустые строки в таблицу не попадают. */
function facts(alert: SafeAlert): [string, string][] {
	const rows: [string, string][] = [
		["Когда", `${formatDate(alert.at)} МСК`],
		["Где", `${alert.processName} · ${SOURCE_LABEL[alert.source]}`],
		["Стенд", alert.environment],
	];

	if (alert.module) rows.push(["Модуль", alert.module]);

	if (alert.http) {
		const request = [alert.http.method, alert.http.route]
			.filter(Boolean)
			.join(" ");
		if (request) rows.push(["Запрос", request]);
		if (alert.http.status) rows.push(["Код ответа", String(alert.http.status)]);
	}

	if (alert.job) {
		const job = [alert.job.queue, alert.job.name].filter(Boolean).join(" → ");
		if (job) rows.push(["Задача", job]);
		if (alert.job.attempt) rows.push(["Попытка", alert.job.attempt]);
	}

	if (alert.userRef) rows.push(["Пользователь", alert.userRef]);
	rows.push(["Узел", alert.hostname]);

	return rows;
}

function occurrences(alert: SafeAlert): [string, string][] {
	const { stats } = alert;
	const rows: [string, string][] = [
		["Повод", TRIGGER_LABEL[stats.trigger]],
		["Повторений", String(stats.occurrences)],
	];

	if (stats.occurrences > 1) {
		rows.push(["Впервые", `${formatDate(stats.firstSeen)} МСК`]);
		rows.push(["Последний раз", `${formatDate(stats.lastSeen)} МСК`]);
	}
	if (stats.suppressed > 0) {
		rows.push(["Скрыто с прошлого письма", String(stats.suppressed)]);
	}
	rows.push(["Письмо по этой ошибке", `№ ${stats.sendCount}`]);

	return rows;
}

/**
 * Состояние самой системы оповещения. Мелко и в конце, но обязательно:
 * исчерпанный лимит и работа без Redis меняют смысл всего письма.
 */
function selfNotices(alert: SafeAlert): string[] {
	const { stats } = alert;
	const notices: string[] = [];

	if (stats.budgetSuppressed > 0) {
		notices.push(
			`С прошлого письма часовой лимит подавил ещё ${stats.budgetSuppressed} уведомлений по другим ошибкам.`,
		);
	}
	if (stats.budgetExhausted) {
		notices.push(
			"Часовой лимит писем исчерпан этим сообщением. До конца часа письма не придут — ошибки при этом продолжают записываться в журнал.",
		);
	}
	if (stats.degraded) {
		notices.push(
			"Redis был недоступен: счётчики посчитаны только по одному процессу, настоящее число повторов может быть больше.",
		);
	}

	return notices;
}

function table(rows: [string, string][]): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
      ${rows.map(([label, value]) => renderRow(escapeHtml(label), escapeHtml(value))).join("")}
    </table>`;
}

function pre(title: string, lines: string[]): string {
	return `<p style="margin:20px 0 0;color:#71717A;font-size:13px;">${escapeHtml(title)}</p>
    <div style="${PRE_STYLE}">${escapeHtml(lines.join("\n"))}</div>`;
}

function render(alert: SafeAlert): RenderedEmail {
	const notices = selfNotices(alert);
	const reference = [
		`errorId     ${alert.errorId}`,
		`fingerprint ${alert.fingerprint}`,
	];

	const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:18px;color:${SEVERITY_COLOR[alert.severity]};">Сбой в работе сайта</h1>
    <p style="margin:0;font-size:15px;color:#18181B;"><strong>${escapeHtml(alert.errorName)}</strong>: ${escapeHtml(alert.message)}</p>
    ${table(facts(alert))}
    ${table(occurrences(alert))}
    ${alert.causes.length > 0 ? pre("Причина", alert.causes) : ""}
    ${alert.frames.length > 0 ? pre("Стек вызовов", alert.frames) : ""}
    ${alert.adminUrl ? renderButton("Открыть запись", alert.adminUrl) : ""}
    <p style="margin:20px 0 0;color:#71717A;font-size:12px;line-height:1.5;">
      Письмо намеренно неполное: исходный текст ошибки, пользователь, IP и
      данные запроса остаются на сервере — в карточке записи журнала ошибок.
    </p>
    <div style="${PRE_STYLE}">${escapeHtml(reference.join("\n"))}</div>
    ${
			notices.length > 0
				? `<ul style="margin:16px 0 0;padding-left:18px;color:#71717A;font-size:12px;line-height:1.5;">${notices
						.map((notice) => `<li>${escapeHtml(notice)}</li>`)
						.join("")}</ul>`
				: ""
		}
  `;

	const where = alert.module ?? SOURCE_LABEL[alert.source];

	return {
		subject: errorAlertSubject(alert),
		html: renderEmailLayout({
			previewText: `${alert.message} — ${where}`,
			bodyHtml,
		}),
		text: [
			`Сбой в работе сайта`,
			`${alert.errorName}: ${alert.message}`,
			"",
			...facts(alert).map(([label, value]) => `${label}: ${value}`),
			"",
			...occurrences(alert).map(([label, value]) => `${label}: ${value}`),
			...(alert.causes.length > 0 ? ["", "Причина:", ...alert.causes] : []),
			...(alert.frames.length > 0
				? ["", "Стек вызовов:", ...alert.frames]
				: []),
			"",
			...(alert.adminUrl ? [`Открыть запись: ${alert.adminUrl}`] : []),
			...reference,
			...(notices.length > 0 ? ["", ...notices] : []),
		].join("\n"),
	};
}

export const errorAlertEmailTemplate: EmailTemplate<SafeAlert> = {
	id: "error-alert",
	render,
};
