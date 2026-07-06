"use server";

import { z } from "zod";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { createFeedback } from "@/payload/services/feedbacks.service";
import { feedbackFormSchema } from "../schemas/feedback.schema";

export async function submitFeedback(formData: unknown) {
  const parsed = feedbackFormSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, message: "Ошибка валидации данных" };
  }

  const { type, title, description, email: formEmail } = parsed.data;
  const user = await getCurrentUser();

  const payloadData = {
    type,
    title,
    description,
    email: user?.email ?? formEmail ?? "",
    user: user?.id ?? undefined, // связь с пользователем, если есть
  };

  try {
    await createFeedback(payloadData);
    return { success: true };
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "Не удалось отправить обратную связь",
    };
  }
}
