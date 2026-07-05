export type ErrorPageProps = {
  code: string; // "404" | "500" | "503" и т.д.
  title: string;
  description: string;
  retry?: () => void; // callback для повторной попытки
  showBackButton?: boolean; // показывать кнопку "Назад"
};
