import { ErrorPage } from "@/modules/error";

export default function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="Страница не найдена"
      description="Запрашиваемая страница отсутствует либо была перемещена."
      showBackButton
    />
  );
}
