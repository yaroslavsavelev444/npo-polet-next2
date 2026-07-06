const rubFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export function formatRub(value: number): string {
  return `${rubFormatter.format(Math.round(value))} ₽`;
}

export function formatDate(date: Date | string): string {
  return dateFormatter.format(typeof date === "string" ? new Date(date) : date);
}
