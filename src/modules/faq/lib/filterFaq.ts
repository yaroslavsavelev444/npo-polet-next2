// import type { FaqTopicViewModel } from '../types'
// import { buildSearchIndex } from './searchIndex'

// export function filterTopics(
//   topics: FaqTopicViewModel[],
//   search: string
// ): FaqTopicViewModel[] {
//   if (!search.trim()) return topics

//   const lowerSearch = search.toLowerCase()
//   const index = buildSearchIndex(topics)

//   const matchedTopicIds = new Set<string>()
//   const matchedQuestionIds = new Map<string, Set<string>>() // topicId -> Set<questionId>

//   for (const [, entries] of index.entries()) {
//     for (const entry of entries) {
//       if (entry.text.toLowerCase().includes(lowerSearch)) {
//         matchedTopicIds.add(entry.topicId)
//         if (entry.questionId) {
//           if (!matchedQuestionIds.has(entry.topicId)) {
//             matchedQuestionIds.set(entry.topicId, new Set())
//           }
//           matchedQuestionIds.get(entry.topicId)!.add(entry.questionId)
//         }
//       }
//     }
//   }

//   // Если тема совпала целиком — показываем все вопросы
//   return topics
//     .filter(topic => matchedTopicIds.has(topic.id))
//     .map(topic => {
//       const matchedQuestions = matchedQuestionIds.get(topic.id)
//       if (!matchedQuestions) return topic // тема совпала полностью, все вопросы
//       return {
//         ...topic,
//         questions: topic.questions.filter(q => matchedQuestions.has(q.id!)),
//       }
//     })
// }