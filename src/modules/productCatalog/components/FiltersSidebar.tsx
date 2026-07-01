'use client';

import { useProductFilters } from '../hooks/useProductFilters';
import { Button, Slider, Select, Checkbox } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { Card } from '@/UI';
import { Heading, Text } from '@/UI/Typography/Typography'; // кастомные компоненты

interface Props {
  className?: string;
}

export function FiltersSidebar({ className }: Props) {
  const { filters, updateFilters, resetFilters } = useProductFilters();

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-6">
        <Heading level={4}>Фильтры</Heading>
        <Button type="text" icon={<CloseOutlined />} onClick={resetFilters} />
      </div>


      {/* Цена */}
      <div className="mb-6">
        <Text as="span" className="font-semibold block mb-2">
          Цена (руб)
        </Text>
        <Slider
          range
          min={0}
          max={100000}
          value={[filters.priceFrom || 0, filters.priceTo || 100000]}
          onChange={([from, to]) => updateFilters({ priceFrom: from, priceTo: to })}
          className="mt-4"
        />
        <div className="flex justify-between text-sm text-secondary mt-1">
          <span>{filters.priceFrom || 0} ₽</span>
          <span>{filters.priceTo || 100000} ₽</span>
        </div>
      </div>

      {/* Наличие */}
      <div className="mb-6">
        <Checkbox
          checked={filters.inStock === true}
          onChange={(e) => updateFilters({ inStock: e.target.checked ? true : null })}
        >
          Только в наличии
        </Checkbox>
      </div>

      <Button block type="primary" onClick={resetFilters} danger>
        Сбросить все фильтры
      </Button>
    </Card>
  );
}