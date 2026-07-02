// // services/faq-topics.service.ts
// import { unstable_cache } from 'next/cache'
// import { getPayloadInstance } from './getPayload'
// import { env } from '@/env'
// import type { FaqTopic } from '@/payload-types'
// import type { Where } from 'payload'

// export interface GetFaqTopicsOptions {
//   isActive?: boolean
//   title?: string
//   order_gte?: number
//   order_lte?: number
//   sort?: string
//   limit?: number
//   page?: number
//   depth?: number
// }

// function buildFaqTopicsWhere(options: GetFaqTopicsOptions): Where {
//   const where: Where = {}
//   const conditions: any[] = []

//   if (options.isActive !== undefined) {
//     conditions.push({ isActive: { equals: options.isActive } })
//   }
//   if (options.title) {
//     conditions.push({ title: { contains: options.title } })
//   }
//   if (options.order_gte !== undefined) {
//     conditions.push({ order: { greater_than_equal: options.order_gte } })
//   }
//   if (options.order_lte !== undefined) {
//     conditions.push({ order: { less_than_equal: options.order_lte } })
//   }

//   if (conditions.length > 0) {
//     where.and = conditions
//   }
//   return where
// }

// function getFaqTopicsCacheKey(options?: GetFaqTopicsOptions): string {
//   const { isActive, title, order_gte, order_lte, sort, limit, page, depth } = options || {}
//   return `faqtopics-active-${isActive ?? 'any'}-title-${title || 'any'}-ogte-${order_gte ?? 'any'}-olte-${order_lte ?? 'any'}-sort-${sort || 'order'}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`
// }

// async function fetchFaqTopics(options: GetFaqTopicsOptions = {}) {
//   const payload = await getPayloadInstance()
//   const where = buildFaqTopicsWhere(options)
//   const result = await payload.find({
//     collection: 'faq-topics',
//     where,
//     sort: options.sort || 'order',
//     limit: options.limit || 100,
//     page: options.page || 1,
//     depth: options.depth ?? 1,
//   })
//   return {
//     docs: result.docs as unknown as FaqTopic[],
//     totalDocs: result.totalDocs,
//   }
// }

// export const getCachedFaqTopics = (options?: GetFaqTopicsOptions) => {
//   const fetchFn = () => fetchFaqTopics(options)
//   if (env.NODE_ENV === 'development') {
//     return fetchFn()
//   }
//   return unstable_cache(
//     fetchFn,
//     [getFaqTopicsCacheKey(options)],
//     { tags: ['faq-topics'], revalidate: false }
//   )()
// }

// async function fetchFaqTopicById(id: string): Promise<FaqTopic | null> {
//   const payload = await getPayloadInstance()
//   const result = await payload.find({
//     collection: 'faq-topics',
//     where: { id: { equals: id } },
//     limit: 1,
//     depth: 1,
//   })
//   return (result.docs[0] || null) as unknown as FaqTopic | null
// }

// export const getCachedFaqTopicById = (id: string) => {
//   const fetchFn = () => fetchFaqTopicById(id)
//   if (env.NODE_ENV === 'development') {
//     return fetchFn()
//   }
//   return unstable_cache(
//     fetchFn,
//     [`faq-topic-${id}`],
//     { tags: ['faq-topics'], revalidate: false }
//   )()
// }

// export const faqTopicsService = {
//   /**
//    * Получить все активные темы с активными вопросами (для публичной страницы).
//    * Вопросы внутри темы сортируются по order.
//    */
//   async getPublicFaq(): Promise<FaqTopic[]> {
//     const payload = await getPayloadInstance()
//     const { docs } = await payload.find({
//       collection: 'faq-topics',
//       where: {
//         isActive: { equals: true },
//       },
//       sort: 'order',
//       depth: 1, // вопросы внутри
//     })

//     // Фильтруем активные вопросы внутри и сортируем по order
//     return docs.map(topic => ({
//       ...topic,
//       questions: (topic.questions ?? [])
//         .filter(q => q.isActive)
//         .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
//     }))
//   },

//   /**
//    * Получить все темы (включая неактивные) — для админ-панели или сервисных нужд.
//    */
//   async getAllTopics(): Promise<FaqTopic[]> {
//     const payload = await getPayloadInstance()
//     const { docs } = await payload.find({
//       collection: 'faq-topics',
//       sort: 'order',
//       depth: 1,
//     })
//     return docs
//   },

//   /**
//    * Получить тему по slug (только если активна).
//    */
//   async getFaqBySlug(slug: string): Promise<FaqTopic | null> {
//     const payload = await getPayloadInstance()
//     const { docs } = await payload.find({
//       collection: 'faq-topics',
//       where: {
//         and: [
//           { slug: { equals: slug } },
//           { isActive: { equals: true } },
//         ],
//       },
//       depth: 1,
//     })
//     return docs[0] ?? null
//   },

//   /**
//    * Получить список всех активных тем (лёгкий, без вопросов) — для меню/виджетов.
//    */
//   async getActiveTopics(): Promise<Pick<FaqTopic, 'id' | 'title' | 'slug'>[]> {
//     const payload = await getPayloadInstance()
//     const { docs } = await payload.find({
//       collection: 'faq-topics',
//       where: {
//         isActive: { equals: true },
//       },
//       sort: 'order',
//       select: ['id', 'title', 'slug'],
//     })
//     return docs
//   },
// }
