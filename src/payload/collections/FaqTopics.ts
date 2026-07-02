// import type { CollectionConfig } from 'payload'

// export const FaqTopics: CollectionConfig = {
//   slug: 'faq-topics',
//   labels: {
//     singular: 'FAQ Тема',
//     plural: 'FAQ Темы',
//   },
//   admin: {
//     useAsTitle: 'title',
//     defaultColumns: ['title', 'order', 'isActive', 'updatedAt'],
//     group: 'Контент',
//   },
//   access: {
//     read: () => true, // публичное чтение
//     create: ({ req: { user } }) => Boolean(user),
//     update: ({ req: { user } }) => Boolean(user),
//     delete: ({ req: { user } }) => Boolean(user),
//   },
//   timestamps: true,
//   defaultSort: 'order',
//   fields: [
//     {
//       name: 'title',
//       type: 'text',
//       required: true,
//       localized: false,
//       index: true,
//     },
//     {
//       name: 'slug',
//       type: 'text',
//       required: true,
//       unique: true,
//       admin: {
//         position: 'sidebar',
//         readOnly: true,
//       },
//       hooks: {
//         beforeValidate: [
//           ({ value, data }) => {
//             if (!value && data?.title) {
//               // простая транслитерация (можно подключить библиотеку)
//               return data.title
//                 .toLowerCase()
//                 .replace(/[^a-zа-я0-9]+/g, '-')
//                 .replace(/(^-|-$)/g, '')
//             }
//             return value
//           },
//         ],
//       },
//     },
//     {
//       name: 'description',
//       type: 'textarea',
//       localized: false,
//     },
//     {
//       name: 'order',
//       type: 'number',
//       required: true,
//       defaultValue: 0,
//       index: true,
//       admin: {
//         description: 'Порядок отображения (по возрастанию)',
//       },
//     },
//     {
//       name: 'isActive',
//       type: 'checkbox',
//       defaultValue: true,
//       admin: {
//         description: 'Показывать на сайте',
//       },
//     },
//     {
//       name: 'questions',
//       type: 'array',
//       required: false,
//       minRows: 0,
//       maxRows: 100,
//       labels: {
//         singular: 'Вопрос',
//         plural: 'Вопросы',
//       },
//       fields: [
//         {
//           name: 'question',
//           type: 'text',
//           required: true,
//         },
//         {
//           name: 'answer',
//           type: 'richText',
//           required: true,
//           editor: {
//             // используем Lexical из коробки
//           },
//         },
//         {
//           name: 'order',
//           type: 'number',
//           required: true,
//           defaultValue: 0,
//           admin: {
//             description: 'Порядок внутри темы',
//           },
//         },
//         {
//           name: 'isActive',
//           type: 'checkbox',
//           defaultValue: true,
//         },
//       ],
//       admin: {
//         description: 'Список вопросов и ответов',
//       },
//     },
//   ],
// }