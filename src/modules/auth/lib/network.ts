/**
 * Признаки «та же сеть» и «тот же браузер» — чистые функции без зависимостей.
 *
 * Отдельный модуль, а не часть trustedDevice.db.ts, по одной причине: это
 * единственная часть механизма доверенных устройств, которую можно и нужно
 * проверять таблицей значений, без базы, cookie и Payload. Ровно так же
 * вынесены предикаты баннеров (modules/banners/conditions.ts) — и по тому же
 * соображению.
 */

// ─── Подсеть ────────────────────────────────────────────────────────────────

/**
 * Префикс сети, по которому сравниваются два входа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ /24 И /64, А НЕ ПОЛНЫЙ АДРЕС
 * ────────────────────────────────────────────────────────────────────────────
 * Сравнивать адреса целиком нельзя: у домашнего провайдера адрес меняется при
 * каждой переподключке, и доверенное устройство перестало бы работать у
 * большинства покупателей уже на второй день. Сравнивать по стране или
 * провайдеру — нечем: базы GeoIP/ASN в проекте нет, и заводить её ради одного
 * признака несоразмерно.
 *
 * Поэтому берётся ровно то, что названо в требовании, — ПОДСЕТЬ:
 *
 *   IPv4 → /24. Классическая граница подсети; один и тот же пул провайдера
 *          обычно остаётся в её пределах, а переезд в другую сеть (другой
 *          офис, мобильный интернет вместо Wi-Fi) её меняет.
 *
 *   IPv6 → /64. Это подсеть В ТОЧНОМ СМЫСЛЕ протокола: младшие 64 бита —
 *          идентификатор интерфейса, и именно он перебирается расширениями
 *          приватности (RFC 4941) несколько раз в сутки. Сравнение по /64
 *          переживает эту ротацию, сравнение по полному адресу — нет.
 *
 * Более широкий /48 здесь сознательно НЕ выбран: у провайдеров, которые
 * меняют делегированный префикс, вместе с /64 меняется и /48, то есть
 * послабление ничего не даёт, а поверхность для чужой сети расширяет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ `null` — ЭТО «НЕ СОВПАДАЕТ»
 * ────────────────────────────────────────────────────────────────────────────
 * Неразобранный или неизвестный адрес (`unknown` из getRequestMeta при
 * отсутствии X-Real-IP) даёт `null`, и sameNetwork считает такую пару
 * несовпадающей. То есть при потере сведений о сети вход идёт через OTP —
 * отказ закрытый, как и весь остальной auth-флоу.
 */
export function networkPrefix(ip: string): string | null {
	const value = ip?.trim().toLowerCase();
	if (!value || value === "unknown") return null;

	// IPv4-mapped IPv6 (`::ffff:192.0.2.1`) и IPv4 с портом — приводим к IPv4:
	// иначе один и тот же клиент за разными слоями прокси выглядел бы как две
	// разные сети.
	const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
	const candidate = mapped ? mapped[1] : value;

	if (isIpv4(candidate)) {
		const octets = candidate.split(".");
		return `v4:${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
	}

	const groups = expandIpv6(candidate);
	if (!groups) return null;

	return `v6:${groups.slice(0, 4).join(":")}::/64`;
}

/** Обе стороны известны и лежат в одной подсети. */
export function sameNetwork(a: string, b: string): boolean {
	const left = networkPrefix(a);
	const right = networkPrefix(b);
	if (left === null || right === null) return false;
	return left === right;
}

function isIpv4(value: string): boolean {
	const octets = value.split(".");
	if (octets.length !== 4) return false;
	return octets.every((octet) => {
		if (!/^\d{1,3}$/.test(octet)) return false;
		const n = Number(octet);
		return n >= 0 && n <= 255;
	});
}

/**
 * Разворачивает IPv6 в восемь групп без ведущих нулей.
 *
 * Свой разбор, а не `node:net`: сравнивать нужно НОРМАЛИЗОВАННЫЕ группы, а
 * `net.isIPv6` отвечает только «да/нет». Без нормализации `2001:db8::1` и
 * `2001:0db8:0000:0000:0000:0000:0000:0001` — один и тот же адрес — дали бы
 * разные префиксы, и доверие терялось бы при смене формата записи прокси.
 */
function expandIpv6(value: string): string[] | null {
	// Зона (`fe80::1%eth0`) к адресации отношения не имеет.
	const address = value.split("%")[0];
	if (!address.includes(":")) return null;

	const halves = address.split("::");
	if (halves.length > 2) return null;

	const parse = (part: string): string[] | null => {
		if (part === "") return [];
		const groups = part.split(":");
		for (const group of groups) {
			if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
		}
		return groups;
	};

	const head = parse(halves[0]);
	const tail = halves.length === 2 ? parse(halves[1]) : [];
	if (head === null || tail === null) return null;

	let groups: string[];
	if (halves.length === 2) {
		const missing = 8 - head.length - tail.length;
		if (missing < 1) return null;
		groups = [...head, ...Array(missing).fill("0"), ...tail];
	} else {
		groups = head;
	}

	if (groups.length !== 8) return null;

	// Ведущие нули убираем: `0db8` и `db8` — одна и та же группа.
	return groups.map((group) => group.replace(/^0+(?=.)/, ""));
}

// ─── Браузер ────────────────────────────────────────────────────────────────

/**
 * Семейство браузера из User-Agent.
 *
 * Сравнивать User-Agent целиком нельзя: Chrome обновляется каждые несколько
 * недель, и строка меняется вместе с номером версии — доверие слетало бы
 * после каждого обновления браузера. Семейство при обновлении не меняется, а
 * при смене браузера меняется, то есть отвечает ровно на нужный вопрос.
 *
 * Порядок проверок важен и не случаен: Edge, Opera и Яндекс.Браузер содержат
 * в своём User-Agent подстроку `Chrome`, а Chrome — подстроку `Safari`.
 * Поэтому производные проверяются раньше исходного.
 */
export function browserFamily(userAgent: string): string {
	const ua = userAgent ?? "";
	if (/YaBrowser\//.test(ua)) return "Yandex";
	if (/Edg(?:e|A|iOS)?\//.test(ua)) return "Edge";
	if (/OPR\/|Opera[ /]/.test(ua)) return "Opera";
	if (/Firefox\/|FxiOS\//.test(ua)) return "Firefox";
	if (/Chrome\/|CriOS\//.test(ua)) return "Chrome";
	if (/Safari\//.test(ua)) return "Safari";
	return "Other";
}

/**
 * Отпечаток устройства: тип устройства плюс семейство браузера.
 *
 * Это НЕ средство идентификации пользователя и не «фингерпринтинг» в
 * маркетинговом смысле: ни экрана, ни шрифтов, ни canvas здесь нет, а сами
 * данные — те же, что и так лежат в `sessions.userAgent`. Задача одна —
 * заметить, что предъявленная cookie доверия пришла из ДРУГОГО браузера, чем
 * тот, которому её выдали. Такой случай трактуется как «новое устройство», то
 * есть требует OTP.
 *
 * @param deviceLabel результат parseDeviceLabel — тип устройства.
 */
export function deviceFingerprint(
	deviceLabel: string,
	userAgent: string,
): string {
	return `${deviceLabel}|${browserFamily(userAgent)}`;
}
