import type { CheckoutPreference } from "../../../payload-types";
import { getPayloadInstance } from "./getPayload";

export async function getCheckoutPreferences(
  userId: string,
): Promise<CheckoutPreference | null> {
  const payload = await getPayloadInstance();
  const { docs } = await payload.find({
    collection: "checkout-preferences",
    where: { user: { equals: userId } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });
  return (docs[0] as unknown as CheckoutPreference) ?? null;
}

interface SaveCheckoutPreferencesInput {
  recipient?: { fullName: string; phone: string; email: string };
  delivery?: {
    method: string;
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
  };
}

export async function saveCheckoutPreferences(
  userId: string,
  input: SaveCheckoutPreferencesInput,
): Promise<void> {
  const payload = await getPayloadInstance();
  const existing = await getCheckoutPreferences(userId);

  const data: Record<string, unknown> = {};
  if (input.recipient) data.recipient = input.recipient;
  if (input.delivery) {
    data.delivery = {
      method: input.delivery.method,
      address: input.delivery.address,
      transportCompany: input.delivery.transportCompanyId
        ? Number(input.delivery.transportCompanyId)
        : undefined,
      pickupPoint: input.delivery.pickupPointId
        ? Number(input.delivery.pickupPointId)
        : undefined,
    };
  }

  if (existing) {
    await payload.update({
      collection: "checkout-preferences",
      id: existing.id,
      data,
      overrideAccess: true,
    });
    return;
  }

  await payload.create({
    collection: "checkout-preferences",
    data: { user: Number(userId), ...data },
    overrideAccess: true,
  });
}
