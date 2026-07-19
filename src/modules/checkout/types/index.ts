import type { CartView } from "@/modules/cart";
import type { Company } from "@/payload-types";

export type CheckoutDeliveryMethod =
  | "door_to_door"
  | "pickup_point"
  | "self_pickup";
export type CheckoutPaymentMethod =
  | "invoice"
  | "self_pickup_card"
  | "self_pickup_cash";

export interface TransportCompanyOption {
  id: string;
  name: string;
  phone: string | null;
}

export interface PickupPointOption {
  id: string;
  name: string;
  address: string;
  city: string | null;
  workingHours: string | null;
}

export interface SavedRecipient {
  fullName: string;
  phone: string;
  email: string;
}

export interface SavedDelivery {
  method: CheckoutDeliveryMethod;
  address?: {
    city?: string;
    street?: string;
    house?: string;
    apartment?: string;
    postalCode?: string;
    country?: string;
  };
  transportCompanyId?: string;
  pickupPointId?: string;
}

export interface CheckoutView {
  cart: CartView;
  savedRecipient: SavedRecipient | null;
  savedDelivery: SavedDelivery | null;
  companies: Company[];
  pickupPoints: PickupPointOption[];
  transportCompanies: TransportCompanyOption[];
}

// ── Client form state / submission payload ──────────────────────────────────

export interface CheckoutRecipientInput {
  fullName: string;
  phone: string;
  email: string;
  saveRecipient: boolean;
}

export interface CheckoutDeliveryInput {
  method: CheckoutDeliveryMethod;
  address?: {
    city: string;
    street: string;
    house: string;
    apartment: string;
    postalCode: string;
    country: string;
  };
  transportCompanyId?: string;
  pickupPointId?: string;
  notes?: string;
  saveAddress: boolean;
}

export interface CheckoutCompanyInput {
  isCompany: boolean;
  existingCompanyId?: string;
  companyName?: string;
  legalAddress?: string;
  companyAddress?: string;
  taxNumber?: string;
  contactPerson?: string;
  saveCompany: boolean;
}

export interface CheckoutSubmitInput {
  recipient: CheckoutRecipientInput;
  delivery: CheckoutDeliveryInput;
  company?: CheckoutCompanyInput;
  paymentMethod: CheckoutPaymentMethod;
  notes?: string;
}

export type CheckoutActionErrorCode =
  | "AUTH_REQUIRED"
  | "CART_EMPTY"
  | "CART_INVALID"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export type CheckoutActionResult =
  | { success: true; data: { orderNumber: string } }
  | {
      success: false;
      error: CheckoutActionErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };
