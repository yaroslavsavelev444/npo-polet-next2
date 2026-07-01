'use client';

import { cn } from '@/utils/cn';
import { Input } from 'antd';

interface FormInputProps {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'; // и другие
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string; // текст ошибки (если есть)
  className?: string; // дополнительные классы для контейнера
}

export function FormInput({
  id,
  name,
  label,
  type = 'text',
  autoComplete,
  required,
  disabled,
  placeholder,
  error,
  className,
}: FormInputProps) {
  // Для пароля используем специальный компонент Input.Password
  const isPassword = type === 'password';

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      {isPassword ? (
        <Input.Password
          id={id}
          name={name}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          status={error ? 'error' : undefined}
          className="w-full" // можно добавить свои Tailwind-классы, если нужно переопределить отступы
        />
      ) : (
        <Input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          status={error ? 'error' : undefined}
          className="w-full"
        />
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}