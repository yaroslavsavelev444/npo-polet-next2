import { MessageSquare } from "lucide-react";
import { Button, Empty, Tooltip } from "@/UI";

/**
 * Заглушка: система отзывов ещё не реализована на бэкенде.
 * Компонент не обращается ни к каким API — только статическое состояние.
 */
export function ReviewsTabContent() {
  return (
    <Empty
      icon={<MessageSquare className="h-full w-full" />}
      message="Отзывов пока нет"
      description="Мы разрабатываем систему отзывов о товарах. Скоро вы сможете делиться своим мнением о покупках."
    >
      <Tooltip content="Раздел отзывов появится позже">
        <Button variant="outline" disabled>
          Оставить отзыв
        </Button>
      </Tooltip>
    </Empty>
  );
}
