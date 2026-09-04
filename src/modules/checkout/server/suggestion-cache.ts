/**
 * LRU-кэш подсказок адреса с TTL.
 *
 * Существует ради дневной квоты провайдера подсказок: она общая на весь
 * аккаунт, а префиксы запросов у покупателей повторяются («москва», «санкт-»,
 * «ул ленина»). Кэш живёт в памяти процесса — распределённым он быть не
 * обязан (промах стоит один сетевой запрос), а поход в Redis добавил бы
 * round-trip к операции, которая должна отвечать за десятки миллисекунд.
 *
 * Вынесен отдельным модулем без зависимостей от Next.js, чтобы вытеснение и
 * протухание проверялись юнит-тестом, а не наблюдением за продом.
 *
 * Поля объявлены явно, а не через parameter properties конструктора: проект
 * запускает TypeScript через `node --experimental-strip-types`, а он умеет
 * только вырезать типы и на parameter properties падает.
 */
interface CacheEntry<T> {
	expiresAt: number;
	value: T;
}

export class SuggestionCache<T> {
	private readonly entries = new Map<string, CacheEntry<T>>();
	private readonly maxEntries: number;
	private readonly ttlMs: number;
	/** Источник времени — подменяется в тестах. */
	private readonly now: () => number;

	constructor(maxEntries: number, ttlMs: number, now: () => number = Date.now) {
		this.maxEntries = maxEntries;
		this.ttlMs = ttlMs;
		this.now = now;
	}

	get(key: string): T | null {
		const entry = this.entries.get(key);
		if (!entry) return null;

		if (entry.expiresAt <= this.now()) {
			this.entries.delete(key);
			return null;
		}

		// Map хранит порядок вставки: перестановка в конец делает вытеснение
		// действительно LRU, а не «первый записанный».
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	set(key: string, value: T): void {
		// Обновление существующего ключа не должно вытеснять чужую запись.
		this.entries.delete(key);
		if (this.entries.size >= this.maxEntries) {
			const oldest = this.entries.keys().next();
			if (!oldest.done) this.entries.delete(oldest.value);
		}
		this.entries.set(key, { expiresAt: this.now() + this.ttlMs, value });
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
