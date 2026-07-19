import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { getCartByUserId } from "@/payload/services/carts.service";
import { getCheckoutPreferences } from "@/payload/services/checkout-preferences.service";
import { getCachedCompaniesByUser } from "@/payload/services/companies.service";
import { getCachedPickupPoints } from "@/payload/services/pickup-points.service";
import { getCachedTransportCompanies } from "@/payload/services/transport-companies.service";
import type {
  CheckoutView,
  PickupPointOption,
  SavedDelivery,
  TransportCompanyOption,
} from "../types";

export async function buildCheckoutView(userId: string): Promise<CheckoutView> {
  const [
    cartDoc,
    preferences,
    companiesResult,
    pickupPointsResult,
    transportCompaniesResult,
  ] = await Promise.all([
    getCartByUserId(userId),
    getCheckoutPreferences(userId),
    getCachedCompaniesByUser(userId, { limit: 20, sort: "-createdAt" }),
    getCachedPickupPoints({ limit: 100 }),
    getCachedTransportCompanies({ limit: 100 }),
  ]);

  const cart = await buildCartView(cartDoc);

  const savedRecipient =
    preferences?.recipient?.fullName &&
    preferences.recipient.phone &&
    preferences.recipient.email
      ? {
          fullName: preferences.recipient.fullName,
          phone: preferences.recipient.phone,
          email: preferences.recipient.email,
        }
      : null;

  const savedDelivery: SavedDelivery | null = preferences?.delivery?.method
    ? {
        method: preferences.delivery.method as SavedDelivery["method"],
        address: preferences.delivery.address
          ? {
              city: preferences.delivery.address.city ?? undefined,
              street: preferences.delivery.address.street ?? undefined,
              house: preferences.delivery.address.house ?? undefined,
              apartment: preferences.delivery.address.apartment ?? undefined,
              postalCode: preferences.delivery.address.postalCode ?? undefined,
              country: preferences.delivery.address.country ?? undefined,
            }
          : undefined,
        transportCompanyId: preferences.delivery.transportCompany
          ? String(
              typeof preferences.delivery.transportCompany === "object"
                ? preferences.delivery.transportCompany.id
                : preferences.delivery.transportCompany,
            )
          : undefined,
        pickupPointId: preferences.delivery.pickupPoint
          ? String(
              typeof preferences.delivery.pickupPoint === "object"
                ? preferences.delivery.pickupPoint.id
                : preferences.delivery.pickupPoint,
            )
          : undefined,
      }
    : null;

  const pickupPoints: PickupPointOption[] = pickupPointsResult.docs
    .filter((p) => p.isActive !== false)
    .map((p) => ({
      id: String(p.id),
      name: p.name,
      address: p.address,
      city: p.city ?? null,
      workingHours: p.workingHours ?? null,
    }));

  const transportCompanies: TransportCompanyOption[] =
    transportCompaniesResult.docs
      .filter((t: any) => t.isActive !== false)
      .map((t: any) => ({
        id: String(t.id),
        name: t.name,
        phone: t.phone ?? null,
      }));

  return {
    cart,
    savedRecipient,
    savedDelivery,
    companies: companiesResult.docs,
    pickupPoints,
    transportCompanies,
  };
}
