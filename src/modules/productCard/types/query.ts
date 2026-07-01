export interface ProductQuery {
  categorySlug?: string;       // для страниц категорий
  categoryId?: string;         // если уже известен ID
  isVisible?: boolean;
  showOnMainPage?: boolean;
  status?: 'available' | 'preorder' | 'out_of_stock' | 'discontinued';
  search?: string;
  priceFrom?: number;
  priceTo?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;               // поле сортировки
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}