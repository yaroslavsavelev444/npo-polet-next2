'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';
import type { FilterState, SortState } from '../types/filters';

export function useProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => ({
    priceFrom: searchParams.get('priceFrom') ? Number(searchParams.get('priceFrom')) : undefined,
    priceTo: searchParams.get('priceTo') ? Number(searchParams.get('priceTo')) : undefined,
    status: (searchParams.get('status') as any) || 'all',
    inStock: searchParams.get('inStock') === 'true' ? true : 
             searchParams.get('inStock') === 'false' ? false : null,
  }), [searchParams]);

  const sort = useMemo(() => ({
    field: (searchParams.get('sort') as SortState['field']) || 'createdAt',
    order: (searchParams.get('order') as 'asc' | 'desc') || 'desc',
  }), [searchParams]);

  const updateURL = useCallback((newParams: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const updateFilters = useCallback((newFilters: Partial<FilterState>) => {
    const params: Record<string, string | null> = {};
    if (newFilters.priceFrom !== undefined) params.priceFrom = newFilters.priceFrom?.toString() || null;
    if (newFilters.priceTo !== undefined) params.priceTo = newFilters.priceTo?.toString() || null;
    if (newFilters.status !== undefined) params.status = newFilters.status;
    if (newFilters.inStock !== undefined) params.inStock = newFilters.inStock?.toString() || null;
    updateURL(params);
  }, [updateURL]);

  // Debounced версия для слайдера цены
  const debouncedUpdateFilters = useMemo(
    () => debounce(updateFilters, 350),
    [updateFilters]
  );

  const updateSort = useCallback((field: SortState['field'], order: SortState['order']) => {
    updateURL({ sort: field, order });
  }, [updateURL]);

  const resetFilters = useCallback(() => {
    updateURL({ priceFrom: null, priceTo: null, status: null, inStock: null });
  }, [updateURL]);

  return {
    filters,
    sort,
    updateFilters: updateFilters,           // мгновенный
    debouncedUpdateFilters,                 // для слайдера
    updateSort,
    resetFilters,
  };
}