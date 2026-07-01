'use client';

import { Select, Button,  Typography, Tag } from 'antd';
import { SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import { useProductFilters } from '../hooks/useProductFilters';
import { cn } from '@/utils/cn';

const { Text } = Typography;

interface InfoPanelProps {
  totalProducts: number;
  activeFiltersCount: number;
  className?: string;
}

export function InfoPanel({ totalProducts, activeFiltersCount, className }: InfoPanelProps) {
  const { sort, updateSort } = useProductFilters();

  const handleSortFieldChange = (value: string) => {
    updateSort(value as any, sort.order);
  };

  const toggleOrder = () => {
    updateSort(sort.field, sort.order === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className={cn("bg-surface border border-border rounded-xl p-4 mb-6", className)}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Text>
            Найдено: <strong>{totalProducts}</strong> товаров
          </Text>
          {activeFiltersCount > 0 && (
            <Tag color="blue">Активных фильтров: {activeFiltersCount}</Tag>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Text type="secondary">Сортировка:</Text>
          <Select
            value={sort.field}
            onChange={handleSortFieldChange}
            style={{ width: 160 }}
            options={[
              { value: 'createdAt', label: 'По дате' },
              { value: 'price', label: 'По цене' },
              { value: 'title', label: 'По названию' },
              { value: 'viewsCount', label: 'По просмотрам' },
              { value: 'purchasesCount', label: 'По покупкам' },
            ]}
          />
          <Button
            icon={sort.order === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
            onClick={toggleOrder}
            type="default"
          />
        </div>
      </div>
    </div>
  );
}