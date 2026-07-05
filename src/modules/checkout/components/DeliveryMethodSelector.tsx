"use client";

import { Home, Package, Store } from "lucide-react";
import { Empty } from "@/UI";
import { Input } from "@/UI/Input/Input";
import { cn } from "@/utils/cn";
import type {
  CheckoutDeliveryInput,
  PickupPointOption,
  TransportCompanyOption,
} from "../types";

const METHODS = [
  {
    value: "door_to_door" as const,
    label: "Курьер до двери",
    icon: Home,
    description: "Доставим по указанному адресу",
  },
  {
    value: "pickup_point" as const,
    label: "Доставка в ПВЗ",
    icon: Package,
    description: "До пункта выдачи транспортной компании",
  },
  {
    value: "self_pickup" as const,
    label: "Самовывоз",
    icon: Store,
    description: "Заберите заказ сами",
  },
];

interface Props {
  value: CheckoutDeliveryInput;
  onChange: (next: CheckoutDeliveryInput) => void;
  pickupPoints: PickupPointOption[];
  transportCompanies: TransportCompanyOption[];
}

export function DeliveryMethodSelector({
  value,
  onChange,
  pickupPoints,
  transportCompanies,
}: Props) {
  const address = value.address ?? {
    street: "",
    city: "",
    postalCode: "",
    country: "Россия",
  };

  return (
    <div className="rounded-lg border border-(--border) bg-(--surface) p-5">
      <h2 className="mb-4 text-base font-semibold text-(--text-primary)">
        Способ получения
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {METHODS.map(({ value: method, label, icon: Icon, description }) => {
          const isActive = value.method === method;
          return (
            <button
              key={method}
              type="button"
              onClick={() => onChange({ ...value, method })}
              className={cn(
                "flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors",
                isActive
                  ? "border-(--primary) bg-(--primary)/5"
                  : "border-(--border) hover:border-(--border-light)",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  isActive ? "text-(--primary)" : "text-(--text-secondary)",
                )}
              />
              <span className="text-sm font-medium text-(--text-primary)">
                {label}
              </span>
              <span className="text-xs text-(--text-secondary)">
                {description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Transport company (door_to_door / pickup_point) */}
      {(value.method === "door_to_door" || value.method === "pickup_point") && (
        <div className="mt-5">
          <label
            htmlFor="transport-company"
            className="mb-1.5 block text-sm font-medium text-(--text-primary)"
          >
            Транспортная компания
          </label>
          {transportCompanies.length === 0 ? (
            <Empty size="sm" message="Нет доступных транспортных компаний" />
          ) : (
            <select
              id="transport-company"
              value={value.transportCompanyId ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  transportCompanyId: e.target.value || undefined,
                })
              }
              className="w-full rounded-sm border border-(--border) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--primary)"
            >
              <option value="">Выберите компанию</option>
              {transportCompanies.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Address (door_to_door full address) */}
      {value.method === "door_to_door" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Адрес"
            placeholder="Улица, дом, квартира"
            value={address.street}
            onChange={(e) =>
              onChange({
                ...value,
                address: { ...address, street: e.target.value },
              })
            }
            wrapperClassName="sm:col-span-2"
          />
          <Input
            label="Город"
            placeholder="Город"
            value={address.city}
            onChange={(e) =>
              onChange({
                ...value,
                address: { ...address, city: e.target.value },
              })
            }
          />
          <Input
            label="Индекс"
            placeholder="Индекс"
            value={address.postalCode}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 6);
              onChange({
                ...value,
                address: { ...address, postalCode: val },
              });
            }}
          />
        </div>
      )}

      {/* Destination city (pickup_point) */}
      {value.method === "pickup_point" && (
        <div className="mt-4">
          <Input
            label="Город назначения"
            placeholder="Город назначения"
            value={address.city}
            onChange={(e) =>
              onChange({
                ...value,
                address: { ...address, city: e.target.value },
              })
            }
          />
        </div>
      )}

      {/* Pickup point (self_pickup) */}
      {value.method === "self_pickup" && (
        <div className="mt-4 flex flex-col gap-2">
          {pickupPoints.length === 0 ? (
            <Empty size="sm" message="Нет доступных пунктов самовывоза" />
          ) : (
            pickupPoints.map((point) => {
              const isSelected = value.pickupPointId === point.id;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() =>
                    onChange({ ...value, pickupPointId: point.id })
                  }
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
                    isSelected
                      ? "border-(--primary) bg-(--primary)/5"
                      : "border-(--border) hover:border-(--border-light)",
                  )}
                >
                  <span className="text-sm font-medium text-(--text-primary)">
                    {point.name}
                  </span>
                  <span className="text-xs text-(--text-secondary)">
                    {point.address}
                  </span>
                  {point.workingHours && (
                    <span className="text-xs text-(--text-muted)">
                      {point.workingHours}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Delivery notes */}
      <div className="mt-4">
        <Input
          label="Комментарий к доставке"
          placeholder="Например: позвоните перед доставкой"
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>

      {/* Save address checkbox */}
      <label className="mt-4 flex items-center gap-2 text-sm text-(--text-secondary)">
        <input
          type="checkbox"
          checked={value.saveAddress}
          onChange={(e) =>
            onChange({ ...value, saveAddress: e.target.checked })
          }
        />
        Сохранить адрес для следующих заказов
      </label>
    </div>
  );
}
