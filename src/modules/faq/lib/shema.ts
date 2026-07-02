// import type { FaqTopicData } from '../types'

// export function faqPageJsonLd(topics: FaqTopicData[]) {
//   const mainEntity = topics.flatMap(topic =>
//     (topic.questions ?? []).map(q => ({
//       '@type': 'Question' as const,
//       name: q.question,
//       acceptedAnswer: {
//         '@type': 'Answer' as const,
//         text: typeof q.answer === 'string' ? q.answer : extractPlainText(q.answer),
//       },
//     }))
//   )

//   return {
//     '@context': 'https://schema.org',
//     '@type': 'FAQPage',
//     mainEntity,
//   }
// }

// // Простая функция для извлечения текста из Lexical JSON (можно улучшить)
// function extractPlainText(node: any): string {
//   if (typeof node === 'string') return node
//   if (Array.isArray(node)) return node.map(extractPlainText).join(' ')
//   if (node?.text) return node.text
//   if (node?.children) return extractPlainText(node.children)
//   return ''
// }