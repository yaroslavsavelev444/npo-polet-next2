'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { feedbackFormSchema, FeedbackFormData } from '../schemas/feedback.schema';
import { submitFeedback } from '../actions/submit-feedback';
import { Input } from '@/UI';
import { Button } from '@/UI';
import { Block } from '@/UI';
import { Typography } from '@/UI';
import { useState } from 'react';

interface FeedbackFormProps {
  userEmail?: string;
  onSuccess?: () => void;
}

export function FeedbackForm({ userEmail, onSuccess }: FeedbackFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: {
      type: 'bug',
      email: userEmail ?? '',
    },
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const onSubmit = async (data: FeedbackFormData) => {
    setSubmitError(null);
    const result = await submitFeedback(data);
    if (result.success) {
      setSubmitSuccess(true);
      onSuccess?.();
    } else {
      setSubmitError(result.message ?? 'Произошла ошибка');
    }
  };

  if (submitSuccess) {
    return (
      <Block>
        <Typography>Спасибо! Ваше обращение принято.</Typography>
      </Block>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Block title="Новое обращение">
        {/* Тип обращения – нативный select, можно заменить на кастомный при необходимости */}
        <div>
          <label htmlFor="feedback-type">
            <Typography variant='caption'>Тип обращения</Typography>
          </label>
          <select
            id="feedback-type"
            {...register('type')}
            style={{ width: '100%', padding: '8px' }}
          >
            <option value="bug">Баг / Ошибка</option>
            <option value="improvement">Предложение по улучшению</option>
            <option value="feature">Идея нового функционала</option>
            <option value="other">Другое</option>
          </select>
          {errors.type && (
            <Typography color='danger'>{errors.type.message}</Typography>
          )}
        </div>

        <Input
  label="Заголовок"
  {...register('title')}
  errorMessage={errors.title?.message}
/>

<Input
  label="Описание"
  multiline
  rows={4}
  {...register('description')}
  errorMessage={errors.description?.message}
/>

<Input
  label="Email для связи"
  type="email"
  {...register('email')}
  errorMessage={errors.email?.message}
/>

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={isSubmitting}
          style={{ marginTop: 16 }}
        >
          Отправить
        </Button>

        {submitError && (
          <Typography color="danger" style={{ marginTop: 8 }}>
            {submitError}
          </Typography>
        )}
      </Block>
    </form>
  );
}