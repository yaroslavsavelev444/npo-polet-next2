"use client";

/**
 * Сигналы менеджеру о новом сообщении, когда он смотрит не сюда: короткий
 * звук, системное уведомление браузера и счётчик в заголовке вкладки.
 *
 * Текст сообщения в системное уведомление НЕ попадает: оно остаётся в
 * центре уведомлений ОС и видно на экране блокировки, а переписка
 * конфиденциальна. Только имя покупателя — остальное в консоли.
 */

let audio: AudioContext | null = null;
let baseTitle: string | null = null;

/** Двухтональный сигнал WebAudio — без файла-ассета и без лишнего запроса. */
function beep(): void {
	try {
		audio ??= new AudioContext();
		const now = audio.currentTime;
		for (const [offset, frequency] of [
			[0, 880],
			[0.14, 1320],
		] as const) {
			const oscillator = audio.createOscillator();
			const gain = audio.createGain();
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.0001, now + offset);
			gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);
			oscillator.connect(gain).connect(audio.destination);
			oscillator.start(now + offset);
			oscillator.stop(now + offset + 0.13);
		}
	} catch {
		// Браузер не дал звук без жеста пользователя — уведомление и счётчик
		// во вкладке всё равно сработают.
	}
}

export function notificationsSupported(): boolean {
	return typeof window !== "undefined" && "Notification" in window;
}

/** Разрешение — только по кнопке: запрос при загрузке браузеры наказывают. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!notificationsSupported()) return "denied";
	return Notification.requestPermission();
}

export function notifyNewMessage(
	customerName: string,
	conversationId: number,
): void {
	beep();
	if (!notificationsSupported() || Notification.permission !== "granted")
		return;
	try {
		const notification = new Notification("Новое сообщение в чате", {
			body: customerName,
			tag: `support-${conversationId}`,
		});
		notification.onclick = () => {
			window.focus();
			const url = new URL(window.location.href);
			url.searchParams.set("c", String(conversationId));
			window.location.assign(url);
		};
	} catch {
		// Safari без разрешения бросает — сигнал звуком уже был.
	}
}

export function setTitleBadge(count: number): void {
	if (typeof document === "undefined") return;
	baseTitle ??= document.title.replace(/^\(\d+\)\s*/, "");
	document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
}
