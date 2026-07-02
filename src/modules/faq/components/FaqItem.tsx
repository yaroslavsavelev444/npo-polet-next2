// 'use client'

// import { Accordion } from '@once-ui-system/core'
// import type { FaqQuestionData } from '../types'

// interface Props {
//   question: FaqQuestionData
// }

// export function FaqItem({ question }: Props) {
//   const { question: title, answer } = question

//   return (
//     <Accordion title={title} aria-label={title}>
//       <div className="prose max-w-none">
//         {typeof answer === 'string' ? (
//           <p>{answer}</p>
//         ) : (
//           <RichTextRenderer content={answer} />
//         )}
//       </div>
//     </Accordion>
//   )
// }