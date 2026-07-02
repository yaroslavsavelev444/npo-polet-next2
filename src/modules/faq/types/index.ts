import type { FaqTopic } from '@/payload-types'

export type FaqQuestionViewModel = NonNullable<FaqTopic['questions']>[number] & {
  plainTextAnswer: string
}

export type FaqTopicViewModel = FaqTopic & {
  questions: FaqQuestionViewModel[]
}

export interface FaqFilterOptions {
  search: string
}