// import type { FaqTopic } from '@/payload-types'
// import type { FaqTopicViewModel, FaqQuestionViewModel } from '../types'
// import { extractPlainText } from '../lib/extractPlainText'

// export function mapFaqTopics(topics: FaqTopic[]): FaqTopicViewModel[] {
//   return topics.map(topic => {
//     const questions: FaqQuestionViewModel[] = (topic.questions ?? [])
//       .filter(q => q.isActive && q.answer)
//       .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
//       .map(q => ({
//         ...q,
//         plainTextAnswer: extractPlainText(q.answer),
//       }))

//     return {
//       ...topic,
//       questions,
//     }
//   })
// }