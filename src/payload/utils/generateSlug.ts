import type { FieldHook } from 'payload'
import { slugify } from 'transliteration'

export const generateSlug: FieldHook = ({ value, data, originalDoc }) => {
  // Если slug уже задан вручную — не трогаем
  if (value) return value

  // Берём название из текущих данных (data) или из уже сохранённого документа
  const source = data?.name || data?.title || originalDoc?.name
  if (!source) return value

  // Генерируем slug: транслитерация, нижний регистр, дефисы
  return slugify(source, {
    lowercase: true,
    separator: '-',
    // strict: true,      // удаляет спецсимволы
  })
}