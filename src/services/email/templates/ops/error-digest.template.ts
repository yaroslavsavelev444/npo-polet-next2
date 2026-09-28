import type { Severity } from "../../../observability/types.ts";
import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

/**
 * Суточная сводка по ошибкам — сигнал «я жив».
 *
 * Письмо об ошибке приходит, когда процесс успел её поймать. OOM-kill,
 * зависший контейнер или сломанная почта не порождают ничего — поэтому
 * сводка приходит каждый день, в том числе при нуле ошибок, и её
 * ОТСУТСТВИЕ само по себе тревога.
 *
 * Состав — те же очищенные поля, что в письмах об ошибках (сообщение из
 * журнала хранится уже очищенным), плюс счётчики.
 */

export interface ErrorDigestGroup {
	fingerprint: string;
	severity: Severity;
	errorName: string;
	message: string;
	module?: string | null;
	count: number;
	lastAt: string;
}

export interface ErrorDigestEmailData {
	environment: string;
	from: string;
	to: string;
	totals: Record<Severity, number>;
	groupsTotal: number;
	topGroups: ErrorDigestGroup[];
	/** Упавшие задачи по очередям; `null` — Redis недоступен. */
	failedJobs: Record<string, number> | null;
	retentionDays: number;
	purged: number;
	adminUrl: string;
}

const SEVERITY_LABEL: Record<Severity, string> = {
	fatal: "падение",
	error: "ошибка",
	warning: "предупреждение",
};

function render(data: ErrorDigestEmailData): RenderedEmail {
	const total = data.totals.fatal + data.totals.error + data.totals.warning;
	const failedTotal = data.failedJobs
		? Object.values(data.failedJobs).reduce((sum, n) => sum + n, 0)
		: 0;
	const healthy =
		data.totals.fatal === 0 && data.totals.error === 0 && failedTotal === 0;

	const summaryRows: [string, string][] = [
		["Период", `${formatDate(data.from)} — ${formatDate(data.to)} МСК`],
		["Стенд", data.environment],
		["Падений", String(data.totals.fatal)],
		["Ошибок", String(data.totals.error)],
		["Предупреждений", String(data.totals.warning)],
		["Разных ошибок", String(data.groupsTotal)],
		[
			"Упавшие фоновые задачи",
			data.failedJobs === null
				? "неизвестно — Redis недоступен"
				: failedTotal === 0
					? "нет"
					: Object.entries(data.failedJobs)
							.filter(([, n]) => n > 0)
							.map(([queue, n]) => `${queue}: ${n}`)
							.join(", "),
		],
	];

	const groupLine = (group: ErrorDigestGroup) =>
		`×${group.count} · ${SEVERITY_LABEL[group.severity]} · ${group.errorName}: ${group.message}${
			group.module ? ` · ${group.module}` : ""
		}`;

	const groupsHtml = data.topGroups
		.map(
			(group) => `<li style="margin:0 0 8px;">
        <strong>×${group.count}</strong> · ${escapeHtml(SEVERITY_LABEL[group.severity])} ·
        <strong>${escapeHtml(group.errorName)}</strong>: ${escapeHtml(group.message)}
        ${group.module ? `<span style="color:#71717A;">· ${escapeHtml(group.module)}</span>` : ""}
        <br/><span style="color:#71717A;font-size:12px;">последний раз ${escapeHtml(formatDate(group.lastAt))}, отпечаток ${escapeHtml(group.fingerprint)}</span>
      </li>`,
		)
		.join("");

	const title = healthy
		? "Сутки без ошибок"
		: `За сутки: ${total} ${total === 1 ? "событие" : "событий"} в журнале ошибок`;

	const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:18px;color:#18181B;">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#71717A;font-size:13px;">Ежедневная сводка мониторинга. Если она однажды не пришла — сайт или его почта не работают.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
      ${summaryRows.map(([label, value]) => renderRow(escapeHtml(label), escapeHtml(value))).join("")}
    </table>
    ${
			data.topGroups.length > 0
				? `<p style="margin:20px 0 8px;color:#71717A;font-size:13px;">Самые частые</p>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5;">${groupsHtml}</ul>`
				: ""
		}
    ${renderButton("Открыть журнал ошибок", data.adminUrl)}
    <p style="margin:16px 0 0;color:#71717A;font-size:12px;">
      Журнал хранит записи ${data.retentionDays} дней${data.purged > 0 ? `; сегодня удалено устаревших: ${data.purged}` : ""}.
    </p>
  `;

	return {
		subject: `[npo-polet/${data.environment}] Сводка ошибок: ${
			healthy
				? "всё в порядке"
				: `падений ${data.totals.fatal}, ошибок ${data.totals.error}`
		}${failedTotal > 0 ? `, упавших задач ${failedTotal}` : ""}`,
		html: renderEmailLayout({ previewText: title, bodyHtml }),
		text: [
			title,
			"",
			...summaryRows.map(([label, value]) => `${label}: ${value}`),
			...(data.topGroups.length > 0
				? ["", "Самые частые:", ...data.topGroups.map(groupLine)]
				: []),
			"",
			`Журнал ошибок: ${data.adminUrl}`,
		].join("\n"),
	};
}

export const errorDigestEmailTemplate: EmailTemplate<ErrorDigestEmailData> = {
	id: "error-digest",
	render,
};
