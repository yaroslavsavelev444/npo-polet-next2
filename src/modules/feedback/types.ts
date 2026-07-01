export type FeedbackType = 'bug' | 'improvement' | 'feature' | 'other';

export interface FeedbackFormData {
  type: FeedbackType;
  title: string;
  description: string;
  email?: string;
}