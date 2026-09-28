// Payload для модуля — лениво и одним местом.
//
// Статический импорт getPayload затащил бы payload.config в граф каждого,
// кто импортирует capture.ts, — включая хук afterError, который сам в этом
// конфиге и объявлен. Ленивый импорт разрывает цикл, а модули без ввода-вывода
// (политика, нормализация, белый список) остаются проверяемыми голым Node.
export async function getPayloadForObservability() {
	const { getPayloadInstance } = await import(
		"../../payload/services/getPayload.ts"
	);
	return getPayloadInstance();
}
