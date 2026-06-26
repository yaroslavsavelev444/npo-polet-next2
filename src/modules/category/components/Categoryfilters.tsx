'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Space, Typography } from 'antd';
import { CloseOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';

const { Text } = Typography;

export type SortField = 'order' | 'name' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

interface CategoryFiltersProps {
  totalCount: number;
  filteredCount: number;
}

const SORT_OPTIONS: ReadonlyArray<{ value: SortField; label: string }> = [
  { value: 'order', label: 'По умолчанию' },
  { value: 'name', label: 'По алфавиту' },
  { value: 'createdAt', label: 'По дате' },
];

export default function CategoryFilters({ totalCount, filteredCount }: CategoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Читаем параметры сортировки из URL
  const sortBy = (searchParams.get('sort') ?? 'order') as SortField;
  const sortOrder = (searchParams.get('order') ?? 'asc') as SortOrder;

  const hasActiveFilters = useMemo(() => sortBy !== 'order', [sortBy]);

  const updateParams = useCallback(
    (updates: Partial<Record<string, string>>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === '' || (key === 'sort' && value === 'order') || (key === 'order' && value === 'asc')) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      params.delete('page'); // сбрасываем пагинацию

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      startTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  const handleSortClick = useCallback(
    (field: SortField) => {
      if (field === sortBy) {
        // Переключаем направление
        updateParams({
          sort: field,
          order: sortOrder === 'asc' ? 'desc' : 'asc',
        });
        return;
      }
      updateParams({ sort: field, order: 'asc' });
    },
    [sortBy, sortOrder, updateParams]
  );

  const handleReset = useCallback(() => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  }, [pathname, router]);

  return (
    <section className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Кнопки сортировки */}
        <Space wrap size="middle">
          {SORT_OPTIONS.map((option) => {
            const active = option.value === sortBy;
            return (
              <Button
                key={option.value}
                type={active ? 'primary' : 'default'}
                onClick={() => handleSortClick(option.value)}
                icon={
                  active ? (
                    sortOrder === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />
                  ) : undefined
                }
                className={active ? '' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-light)] hover:text-[var(--text-primary)]'}
                style={active ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' } : {}}
              >
                {option.label}
              </Button>
            );
          })}
        </Space>

        {/* Счётчик и сброс */}
        <div className="ml-auto flex items-center gap-3">
          <Text className="text-[var(--text-secondary)] text-sm">
            {hasActiveFilters
              ? `${filteredCount} из ${totalCount}`
              : `${totalCount} категорий`}
          </Text>

          {hasActiveFilters && (
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={handleReset}
              className="text-[var(--text-secondary)] hover:text-[var(--error)]"
            >
              Сбросить
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}