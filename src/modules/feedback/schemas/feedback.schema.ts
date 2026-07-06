import { z } from "zod";

export const feedbackFormSchema = z.object({
  type: z.enum(["bug", "improvement", "feature", "other"], {
    error: "Выберите тип обращения",
  }),
  title: z
    .string()
    .min(5, "Минимум 5 символов")
    .max(100, "Максимум 100 символов"),
  description: z.string().min(10, "Минимум 10 символов"),
  email: z.string().email("Некорректный email").optional().or(z.literal("")),
});

export type FeedbackFormData = z.infer<typeof feedbackFormSchema>;
