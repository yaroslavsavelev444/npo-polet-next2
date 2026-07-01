// src/modules/productCatalog/components/MobileFiltersDrawer.tsx
'use client';

import { Drawer, Button, Space, Typography, Badge } from 'antd';
import { FilterOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { FiltersSidebar } from './FiltersSidebar';
import { useProductFilters } from '../hooks/useProductFilters';

const { Text } = Typography;

interface MobileFiltersDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileFiltersDrawer({ open, onClose }: MobileFiltersDrawerProps) {
  const { filters, resetFilters } = useProductFilters();

  const activeFiltersCount = 
    (filters.priceFrom !== undefined || filters.priceTo !== undefined ? 1 : 0) +
    (filters.inStock !== null ? 1 : 0) +
    (filters.status && filters.status !== 'all' ? 1 : 0);

  return (
    <Drawer
      title={
        <Space>
          <FilterOutlined className="text-lg" />
          <Text strong>Фильтры</Text>
          {activeFiltersCount > 0 && (
            <Badge count={activeFiltersCount} color="#1677ff" />
          )}
        </Space>
      }
      placement="left"
      open={open}
      onClose={onClose}
      size="min(400px, 90vw)"   // ← заменили size на width с CSS-значением
      closable={false}
      extra={
        <Button 
          type="text" 
          icon={<CloseOutlined />} 
          onClick={onClose}
          size="large"
        />
      }
      styles={{
        body: { 
          padding: 0,
          backgroundColor: 'var(--background)',
        },
        header: {
          borderBottom: '1px solid var(--border)',
        },
      }}
    >
      {/* остальное без изменений */}
    </Drawer>
  );
}