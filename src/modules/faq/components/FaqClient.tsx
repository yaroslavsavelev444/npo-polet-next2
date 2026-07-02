// 'use client'

// import { useState, useMemo } from 'react'
// import { FaqSearch } from './FaqSearch'
// import { FaqTopic } from './FaqTopic'
// import { FaqEmpty } from './FaqEmpty'
// import type { FaqTopicData } from '../types'
// import { filterTopics } from '../lib/filterFaq'

// interface Props {
//   topics: FaqTopicData[]
// }

// export function FaqClient({ topics }: Props) {
//   const [search, setSearch] = useState('')
//   const filtered = useMemo(() => filterTopics(topics, search), [topics, search])

//   if (!topics.length) {
//     return <FaqEmpty message="Раздел FAQ пока не заполнен" />
//   }

//   return (
//     <div>
//       <FaqSearch value={search} onChange={setSearch} />
//       {filtered.length === 0 ? (
//         <FaqEmpty message="По вашему запросу ничего не найдено" />
//       ) : (
//         <div className="space-y-4">
//           {filtered.map((topic) => (
//             <FaqTopic key={topic.id} topic={topic} />
//           ))}
//         </div>
//       )}
//     </div>
//   )
// }