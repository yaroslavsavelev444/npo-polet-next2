// import { FaqClient } from '@/modules/faq/components/FaqClient'
// import { faqPageJsonLd } from '@/modules/faq/lib/shema'
// import { faqTopicsService } from '@/payload/services/faq-topics.service'
// import type { Metadata } from 'next'

// export const revalidate = 3600 // ISR каждый час

// export async function generateMetadata(): Promise<Metadata> {
//   return {
//     title: 'Часто задаваемые вопросы – Полет',
//     description:
//       'Ответы на часто задаваемые вопросы о продукции, доставке, оплате и работе компании Полет.',
//     openGraph: {
//       title: 'FAQ – Полет',
//       description:
//         'Ответы на часто задаваемые вопросы о продукции, доставке, оплате и работе компании Полет.',
//       type: 'website',
//       url: '/faq',
//     },
//   }
// }

// export default async function FaqPage() {
//   let topics = []
//   try {
//     topics = await faqTopicsService.getPublicFaq()
//   } catch (error) {
//     console.error('Failed to fetch FAQ:', error)
//     // Показываем ошибку, но страница остаётся доступной
//   }

//   return (
//     <>
//       <script
//         type="application/ld+json"
//         dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd(topics)) }}
//       />
//       <div className="container mx-auto px-4 py-10 max-w-4xl">
//         <h1 className="text-h2 font-bold mb-6">Часто задаваемые вопросы</h1>
//         <FaqClient topics={topics} />
//       </div>
//     </>
//   )
// }