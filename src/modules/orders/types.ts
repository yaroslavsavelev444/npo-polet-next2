import type { Order } from "@/payload-types";

export type OrderStatus = Order["status"];

export type OrderFilterGroup =
  | "all"
  | "current"
  | "completed"
  | "cancelled"
  | "past";

export interface OrderItemView {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
}

export interface OrderListItemView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  itemsCount: number;
  totalItems: number;
  total: number;
  currency: string;
  deliveryMethod: Order["delivery"]["method"];
  canCancel: boolean;
}

export interface OrderDetailView extends OrderListItemView {
  recipient: {
    fullName: string;
    phone: string;
    email: string;
    contactPerson?: string | null;
  };
  delivery: {
    method: Order["delivery"]["method"];
    address?: {
      street?: string | null;
      city?: string | null;
      postalCode?: string | null;
      country?: string | null;
    } | null;
    transportCompanyName?: string | null;
    pickupPointName?: string | null;
    trackingNumber?: string | null;
    estimatedDelivery?: string | null;
    notes?: string | null;
  };
  items: OrderItemView[];
  pricing: {
    subtotal: number;
    discount: number;
    shippingCost: number;
    total: number;
    currency: string;
  };
  payment: {
    method: Order["payment"]["method"];
    status: NonNullable<Order["payment"]["status"]>;
  };
  notes?: string | null;
  companyInfo?: { name?: string | null; taxNumber?: string | null } | null;
}

export interface OrdersListResult {
  orders: OrderListItemView[];
  totalDocs: number;
  totalPages: number;
  page: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export type CancelOrderErrorCode =
  | "AUTH_REQUIRED"
  | "NOT_FOUND"
  | "NOT_CANCELLABLE"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export type CancelOrderResult =
  | { success: true; data: { status: OrderStatus } }
  | { success: false; error: CancelOrderErrorCode; message: string };

export type OrderDetailResult =
  | { success: true; data: OrderDetailView }
  | { success: false; message: string };
