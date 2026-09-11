/**
 * Примитивы страницы контактов.
 *
 * DrawnRule здесь больше не объявляется: приём понадобился третьей странице
 * (товару), и по правилу, записанному в шапке app/(frontend)/contacts.css,
 * переехал в общий слой — shared/components/motion/DrawnRule.tsx вместе со
 * стилями .rule-draw в home.css. Реэкспорт оставлен, чтобы разметка контактов
 * продолжала брать примитивы из одного места.
 */
export { DrawnRule } from "@/shared/components/motion/DrawnRule";
