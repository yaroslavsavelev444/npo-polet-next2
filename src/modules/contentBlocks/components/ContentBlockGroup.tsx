import type { ContentBlock as PayloadContentBlock } from '@/payload-types';
import { ContentBlock } from './ContentBlock';

// ─── Типы ────────────────────────────────────────────────────────────────────
type Variant = 'default' | 'featured' | 'compact';

type Props = {
  blocks: PayloadContentBlock[];
  /** Заголовок группы (опционально) */
  title?: string;
  /** Визуальный вариант карточек */
  variant?: Variant;
  /** Ограничение количества отображаемых блоков */
  maxBlocks?: number;
  /** Обработчик клика по блоку */
  onClick?: (block: PayloadContentBlock) => void;
  className?: string;
};

// ─── Компонент ContentBlockGroup ─────────────────────────────────────────────
export const ContentBlockGroup = ({
  blocks,
  title,
  variant = 'default',
  maxBlocks,
  onClick,
  className = '',
}: Props) => {
  if (!blocks || blocks.length === 0) return null;

  const displayBlocks = maxBlocks ? blocks.slice(0, maxBlocks) : blocks;

  return (
    <section className={['flex flex-col', className].filter(Boolean).join(' ')}>
      {/* Заголовок группы */}
      {title && (
        <div className="mb-6 flex items-end gap-4 md:mb-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] md:text-3xl">
            {title}
          </h2>
          {/* Декоративная линия */}
          <div className="mb-1 h-[2px] flex-1 bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-transparent opacity-40" />
        </div>
      )}

      {/* Сетка — ВСЕГДА одна колонка, карточки вертикально друг под другом */}
      <div className="grid grid-cols-1 gap-6 md:gap-8">
        {displayBlocks.map((block) => (
          <ContentBlock
            key={block.id}
            block={block}
            variant={variant}
            onClick={onClick}
          />
        ))}
      </div>
    </section>
  );
};

ContentBlockGroup.displayName = 'ContentBlockGroup';