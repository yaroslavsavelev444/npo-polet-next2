'use client';

import { Drawer } from 'antd';
import { Radio, Button, Divider } from 'antd';
import { useProductFilters } from '../hooks/useProductFilters';
// import { useUIStore } from '@/shared/store/ui.store'; // если есть

interface Props {
  open: boolean;
  onClose: () => void;
}

export function MobileSortDrawer({ open, onClose }: Props) {
  const { sort, updateSort } = useProductFilters();

  return (
    <Drawer
      title="Сортировка"
      placement="right"
      open={open}
      onClose={onClose}
      size={320}
    >
      <Radio.Group
        value={sort.field}
        onChange={e => updateSort(e.target.value, sort.order)}
        className="flex flex-col gap-3"
      >
        {[
          { value: 'createdAt', label: 'По дате добавления' },
          { value: 'price', label: 'По цене' },
          { value: 'title', label: 'По названию' },
          { value: 'viewsCount', label: 'По просмотрам' },
          { value: 'purchasesCount', label: 'По популярности' },
        ].map(opt => (
          <Radio key={opt.value} value={opt.value}>{opt.label}</Radio>
        ))}
      </Radio.Group>

      <Divider />

      <Radio.Group
        value={sort.order}
        onChange={e => updateSort(sort.field, e.target.value)}
      >
        <Radio value="desc">По убыванию</Radio>
        <Radio value="asc">По возрастанию</Radio>
      </Radio.Group>

      <Button type="primary" block size="large" className="mt-6" onClick={onClose}>
        Применить
      </Button>
    </Drawer>
  );
}