// import type { FaqTopicViewModel } from '../types'

// interface IndexEntry {
//   topicId: string
//   questionId: string
//   text: string
// }

// export function buildSearchIndex(topics: FaqTopicViewModel[]): Map<string, IndexEntry[]> {
//   const index = new Map<string, IndexEntry[]>()

//   for (const topic of topics) {
//     // Тема
//     const topicText = [topic.title, topic.description].filter(Boolean).join(' ')
//     index.set(topic.id, [{ topicId: topic.id, questionId: '', text: topicText }])

//     // Вопросы
//     for (const question of topic.questions) {
//       const questionText = [question.question, question.plainTextAnswer].filter(Boolean).join(' ')
//       index.set(question.id!, [
//         ...(index.get(topic.id) ?? []),
//         { topicId: topic.id, questionId: question.id!, text: questionText },
//       ])
//     }
//   }

//   return index
// }