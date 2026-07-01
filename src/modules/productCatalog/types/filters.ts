import { ProductCardData } from "@/modules/productCard";

export type SortField = 'createdAt' | 'price' | 'title' | 'viewsCount' | 'purchasesCount';

export type ProductStatusFilter = 'all' | 'available' | 'preorder' | 'out_of_stock';

export type FilterState = {
  priceFrom?: number;
  priceTo?: number;
  status?: ProductStatusFilter;
  inStock?: boolean | null;
};

export type SortState = {
  field: SortField;
  order: 'asc' | 'desc';
  sort: string;
};

export type ProductCatalogResult = {
  products: ProductCardData[];
  totalDocs: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};