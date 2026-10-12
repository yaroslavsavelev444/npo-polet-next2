/**
 * Русский стеммер — алгоритм Snowball (Porter для русского языка), тот же,
 * что у словаря `russian` в Postgres.
 *
 * Зачем свой, а не to_tsvector в базе: подбор заготовок идёт по тексту
 * сообщения покупателя, а переписка конфиденциальна (support-chat/server/
 * crypto.ts). Отправлять расшифрованный текст в Postgres даже параметром
 * запроса значит оставлять его в журнале запросов, pg_stat_statements и
 * перед глазами у того, кто читает базу «вживую». Стемминг в процессе
 * приложения текст наружу не выпускает.
 *
 * Алгоритм: https://snowballstem.org/algorithms/russian/stemmer.html
 *  • RV — часть слова после первой гласной; все окончания ищутся в RV.
 *  • R2 — для словообразовательного «-ост(ь)».
 *  • Окончания группы 1 (помечены ниже) снимаются, только если перед ними
 *    «а» или «я»; сама буква остаётся.
 */

const VOWELS = "аеиоуыэюя";

const isVowel = (char: string) => VOWELS.includes(char);

/** Начало RV и R2 (индексы в слове). */
function regions(word: string): { rv: number; r2: number } {
	let rv = word.length;
	for (let i = 0; i < word.length; i++) {
		if (isVowel(word[i])) {
			rv = i + 1;
			break;
		}
	}
	// R1: после первой не-гласной, следующей за гласной; R2 — то же внутри R1.
	const after = (from: number) => {
		for (let i = from + 1; i < word.length; i++) {
			if (!isVowel(word[i]) && isVowel(word[i - 1])) return i + 1;
		}
		return word.length;
	};
	const r1 = after(0);
	const r2 = after(r1);
	return { rv, r2 };
}

/**
 * Снять самое длинное окончание из списка, если оно целиком в RV.
 * `group1` — окончания, требующие «а»/«я» перед собой.
 */
function removeEnding(
	word: string,
	rv: number,
	group1: readonly string[],
	group2: readonly string[],
): string | null {
	const candidates = [
		...group1.map((ending) => ({ ending, guarded: true })),
		...group2.map((ending) => ({ ending, guarded: false })),
	].sort((a, b) => b.ending.length - a.ending.length);

	for (const { ending, guarded } of candidates) {
		if (!word.endsWith(ending)) continue;
		const start = word.length - ending.length;
		if (start < rv) continue;
		if (guarded) {
			const before = word[start - 1];
			if (start - 1 < rv || (before !== "а" && before !== "я")) continue;
		}
		return word.slice(0, start);
	}
	return null;
}

const PERFECTIVE_GERUND_1 = ["в", "вши", "вшись"] as const;
const PERFECTIVE_GERUND_2 = [
	"ив",
	"ивши",
	"ившись",
	"ыв",
	"ывши",
	"ывшись",
] as const;

const ADJECTIVE = [
	"ее",
	"ие",
	"ые",
	"ое",
	"ими",
	"ыми",
	"ей",
	"ий",
	"ый",
	"ой",
	"ем",
	"им",
	"ым",
	"ом",
	"его",
	"ого",
	"ему",
	"ому",
	"их",
	"ых",
	"ую",
	"юю",
	"ая",
	"яя",
	"ою",
	"ею",
] as const;

const PARTICIPLE_1 = ["ем", "нн", "вш", "ющ", "щ"] as const;
const PARTICIPLE_2 = ["ивш", "ывш", "ующ"] as const;

const REFLEXIVE = ["ся", "сь"] as const;

const VERB_1 = [
	"ла",
	"на",
	"ете",
	"йте",
	"ли",
	"й",
	"л",
	"ем",
	"н",
	"ло",
	"но",
	"ет",
	"ют",
	"ны",
	"ть",
	"ешь",
	"нно",
] as const;
const VERB_2 = [
	"ила",
	"ыла",
	"ена",
	"ейте",
	"уйте",
	"ите",
	"или",
	"ыли",
	"ей",
	"уй",
	"ил",
	"ыл",
	"им",
	"ым",
	"ен",
	"ило",
	"ыло",
	"ено",
	"ят",
	"ует",
	"уют",
	"ит",
	"ыт",
	"ены",
	"ить",
	"ыть",
	"ишь",
	"ую",
	"ю",
] as const;

const NOUN = [
	"а",
	"ев",
	"ов",
	"ие",
	"ье",
	"е",
	"иями",
	"ями",
	"ами",
	"еи",
	"ии",
	"и",
	"ией",
	"ей",
	"ой",
	"ий",
	"й",
	"иям",
	"ям",
	"ием",
	"ем",
	"ам",
	"ом",
	"о",
	"у",
	"ах",
	"иях",
	"ях",
	"ы",
	"ь",
	"ию",
	"ью",
	"ю",
	"ия",
	"ья",
	"я",
] as const;

const SUPERLATIVE = ["ейш", "ейше"] as const;
const DERIVATIONAL = ["ост", "ость"] as const;

/** ADJECTIVAL = ADJECTIVE, перед которым может стоять PARTICIPLE. */
function removeAdjectival(word: string, rv: number): string | null {
	const base = removeEnding(word, rv, [], ADJECTIVE);
	if (base === null) return null;
	return removeEnding(base, rv, PARTICIPLE_1, PARTICIPLE_2) ?? base;
}

export function stemRu(input: string): string {
	let word = input.toLowerCase().replace(/ё/g, "е");
	if (!/^[а-я]+$/.test(word)) return word;
	const { rv, r2 } = regions(word);
	if (rv >= word.length) return word;

	// Шаг 1.
	const gerund = removeEnding(
		word,
		rv,
		PERFECTIVE_GERUND_1,
		PERFECTIVE_GERUND_2,
	);
	if (gerund !== null) {
		word = gerund;
	} else {
		word = removeEnding(word, rv, [], REFLEXIVE) ?? word;
		word =
			removeAdjectival(word, rv) ??
			removeEnding(word, rv, VERB_1, VERB_2) ??
			removeEnding(word, rv, [], NOUN) ??
			word;
	}

	// Шаг 2.
	if (word.endsWith("и") && word.length - 1 >= rv) word = word.slice(0, -1);

	// Шаг 3: словообразовательное окончание — только в R2.
	const derivational = removeEnding(word, r2, [], DERIVATIONAL);
	if (derivational !== null) word = derivational;

	// Шаг 4.
	if (word.endsWith("нн") && word.length - 2 >= rv) {
		word = word.slice(0, -1);
	} else {
		const superlative = removeEnding(word, rv, [], SUPERLATIVE);
		if (superlative !== null) {
			word = superlative.endsWith("нн")
				? superlative.slice(0, -1)
				: superlative;
		} else if (word.endsWith("ь") && word.length - 1 >= rv) {
			word = word.slice(0, -1);
		}
	}
	return word;
}

/**
 * Служебные слова — без них фраза-триггер «есть ли сертификат» совпадает с
 * «сертификаты есть?» и с «а сертификат у вас имеется». Список — частотное
 * ядро стоп-слов Snowball для русского.
 */
const STOP_WORDS = new Set([
	"и",
	"в",
	"во",
	"не",
	"что",
	"он",
	"на",
	"я",
	"с",
	"со",
	"как",
	"а",
	"то",
	"все",
	"она",
	"так",
	"его",
	"но",
	"да",
	"ты",
	"к",
	"у",
	"же",
	"вы",
	"за",
	"бы",
	"по",
	"только",
	"ее",
	"мне",
	"было",
	"вот",
	"от",
	"меня",
	"еще",
	"нет",
	"о",
	"из",
	"ему",
	"теперь",
	"когда",
	"даже",
	"ну",
	"вдруг",
	"ли",
	"если",
	"уже",
	"или",
	"ни",
	"быть",
	"был",
	"него",
	"до",
	"вас",
	"нибудь",
	"опять",
	"уж",
	"вам",
	"ведь",
	"там",
	"потом",
	"себя",
	"ничего",
	"ей",
	"может",
	"они",
	"тут",
	"где",
	"есть",
	"надо",
	"ней",
	"для",
	"мы",
	"тебя",
	"их",
	"чем",
	"была",
	"сам",
	"чтоб",
	"без",
	"будто",
	"чего",
	"раз",
	"тоже",
	"себе",
	"под",
	"будет",
	"ж",
	"тогда",
	"кто",
	"этот",
	"того",
	"потому",
	"этого",
	"какой",
	"совсем",
	"ним",
	"здесь",
	"этом",
	"один",
	"почти",
	"мой",
	"тем",
	"чтобы",
	"нее",
	"сейчас",
	"были",
	"куда",
	"зачем",
	"всех",
	"никогда",
	"можно",
	"при",
	"наконец",
	"два",
	"об",
	"другой",
	"хоть",
	"после",
	"над",
	"больше",
	"тот",
	"через",
	"эти",
	"нас",
	"про",
	"всего",
	"них",
	"какая",
	"много",
	"разве",
	"три",
	"эту",
	"моя",
	"впрочем",
	"хорошо",
	"свою",
	"этой",
	"перед",
	"иногда",
	"лучше",
	"чуть",
	"том",
	"нельзя",
	"такой",
	"им",
	"более",
	"всегда",
	"конечно",
	"всю",
	"между",
	"здравствуйте",
	"добрый",
	"день",
	"пожалуйста",
	"подскажите",
	"скажите",
	"спасибо",
]);

/**
 * Основы значимых слов текста: нормализация как в поиске сайта (регистр,
 * ё→е, пунктуация), служебные слова выброшены.
 */
export function stemTerms(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/ё/g, "е")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.split(" ")
		.filter((term) => term.length > 0 && !STOP_WORDS.has(term))
		.map(stemRu);
}
