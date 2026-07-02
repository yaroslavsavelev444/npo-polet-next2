// 'use client'

// import { Accordion } from '@once-ui-system/core'
// import { FaqItem } from './FaqItem'
// import type { FaqTopicData } from '../types'

// interface Props {
//   topic: FaqTopicData
// }

// export function FaqTopic({ topic }: Props) {
//   const header = (
//     <div>
//       <h2 className="text-h4 font-semibold">{topic.title}</h2>
//       {topic.description && (
//         <p className="text-neutral-600 text-body-sm mt-1">{topic.description}</p>
//       )}
//     </div>
//   )

//   return (
//     <Accordion title={header} aria-label={topic.title}>
//       <div className="ml-4">
//         {topic.questions && topic.questions.length > 0 ? (
//           topic.questions.map((q) => <FaqItem key={q.id} question={q} />)
//         ) : (
//           <p className="text-neutral-500 italic">В этой теме пока нет вопросов.</p>
//         )}
//       </div>
//     </Accordion>
//   )
// }