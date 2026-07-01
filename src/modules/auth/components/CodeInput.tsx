// components/CodeInput/CodeInput.tsx
'use client';

import { useRef, useEffect, ClipboardEvent, KeyboardEvent, ChangeEvent } from 'react';
import { cn } from '@/utils/cn';

interface CodeInputProps {
  value: string; // строка из 6 цифр
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  length?: number;
}

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = false,
  className,
  inputClassName,
  length = 6,
}: CodeInputProps) {
  const inputRefs = useRef<HTMLInputElement[]>([]);
  const digits = value.padEnd(length, ' ').split('').slice(0, length);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const updateCode = (newDigits: string[]) => {
    const newValue = newDigits.join('').slice(0, length);
    onChange(newValue);
    if (newValue.length === length && onComplete) {
      onComplete(newValue);
    }
  };

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length > 1) return; // не допускаем более одной цифры
    const newDigits = [...digits];
    newDigits[index] = val;
    updateCode(newDigits);
    if (val && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
      e.preventDefault();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('Text').trim();
    if (/^\d+$/.test(pasted)) {
      const newDigits = pasted.slice(0, length).split('');
      updateCode(newDigits);
      const focusIndex = Math.min(newDigits.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      e.preventDefault();
    }
  };

  const handleFocus = (index: number) => {
    // при фокусе выделяем всё содержимое
    inputRefs.current[index]?.select();
  };

  return (
    <div className={cn('flex justify-center gap-2', className)}>
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            if (el) inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={index === 0 ? handlePaste : undefined}
          onFocus={() => handleFocus(index)}
          disabled={disabled}
          className={cn(
            'w-12 h-14 text-center text-2xl font-mono rounded-md border transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-[var(--primary)]',
            error
              ? 'border-[var(--error)] focus:ring-[var(--error)]'
              : 'border-[var(--border)] focus:border-[var(--primary)]',
            disabled && 'opacity-50 cursor-not-allowed',
            inputClassName,
          )}
          aria-invalid={error}
        />
      ))}
    </div>
  );
}