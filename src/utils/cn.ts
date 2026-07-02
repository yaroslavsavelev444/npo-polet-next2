import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Объединяет классы Tailwind с учётом приоритетов и удаляет дубли.
 * Использует clsx для условных классов и tailwind-merge для конфликтов.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
