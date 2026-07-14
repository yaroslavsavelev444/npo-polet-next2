'use client';

import { memo, useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import {
  getPasswordRequirements,
  getPasswordStrength,
  PASSWORD_MAX_LENGTH,
  type PasswordStrengthLevel,
} from '../lib/passwordPolicy';
import styles from './PasswordStrengthMeter.module.css';

const SEGMENT_COUNT = 4;

const SEGMENTS_BY_LEVEL: Record<PasswordStrengthLevel, number> = {
  empty: 0,
  weak: 1,
  fair: 2,
  good: 3,
  strong: 4,
};

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

/**
 * Индикатор требований к паролю для форм регистрации и восстановления пароля.
 * Требования и пороги надёжности берутся из lib/passwordPolicy.ts — того же
 * источника, что используют серверные zod-схемы, поэтому UI никогда не
 * обещает то, что бэкенд не проверяет.
 *
 * Раскрытие панели и цвет/подпись уровня надёжности анимируются через
 * CSS-модуль (см. PasswordStrengthMeter.module.css): проверка каждого
 * требования при переключении false→true пересоздаёт DOM-узел иконки
 * (через смену key), поэтому CSS-анимация "pop" всегда проигрывается заново
 * без ручного отслеживания предыдущего состояния в JS.
 */
function PasswordStrengthMeterImpl({ password, className }: PasswordStrengthMeterProps) {
  const requirements = useMemo(() => getPasswordRequirements(password), [password]);
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const filledSegments = SEGMENTS_BY_LEVEL[strength.level];
  const isOpen = password.length > 0;

  return (
    <div className={cn(styles.collapse, className)} data-open={isOpen}>
      <div className={styles.inner} aria-hidden={!isOpen}>
        <div className="flex items-center justify-between gap-3 pt-1 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className={styles.segments} data-level={strength.level} aria-hidden>
              {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
                <span
                  key={i}
                  className={styles.segment}
                  data-filled={i < filledSegments}
                />
              ))}
            </div>
            <span
              key={strength.level}
              className={cn(styles.levelLabel, 'text-xs font-medium')}
              data-level={strength.level}
            >
              {strength.label}
            </span>
          </div>
          <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
            {password.length}/{PASSWORD_MAX_LENGTH}
          </span>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5" role="list">
          {requirements.map((req) => (
            <li key={req.key} className="flex items-center gap-2 min-w-0">
              <span
                key={`${req.key}-${req.met}`}
                className={cn(styles.icon, req.met ? styles.iconMet : styles.iconUnmet)}
              >
                {req.met && (
                  <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />
                )}
              </span>
              <span
                className={cn(
                  'text-xs transition-colors duration-300 truncate',
                  req.met ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
                )}
              >
                {req.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export const PasswordStrengthMeter = memo(PasswordStrengthMeterImpl);
