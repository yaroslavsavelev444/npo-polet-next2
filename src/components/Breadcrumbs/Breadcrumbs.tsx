"use client";

import { RightOutlined } from "@ant-design/icons";
import { Breadcrumb } from "antd";
import type { ItemType } from "antd/es/breadcrumb/Breadcrumb";
import Link from "next/link";
import React from "react";

interface BreadcrumbsProps {
  /** Массив элементов хлебных крошек */
  items: ItemType[];
  /** Дополнительный CSS-класс для контейнера */
  className?: string;
  /** Вариант оформления */
  variant?: "default" | "light" | "dark" | "transparent" | "white";
  /** Выравнивание */
  align?: "start" | "center" | "end";
}

/**
 * Улучшенный компонент хлебных крошек
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  className = "",
  variant = "default",
  align = "start",
}) => {
  const isWhiteText =
    variant === "default" || variant === "dark" || variant === "white";

  // Стили контейнера
  const getContainerStyles = () => {
    const base = `
      inline-flex items-center gap-2 px-5 py-3
      rounded-2xl min-h-[48px] w-fit
      transition-all duration-200 backdrop-blur-md
    `;

    switch (variant) {
      case "light":
        return `${base} border bg-[var(--surface)] border-[var(--border)] text-[var(--text-primary)]`;

      case "dark":
        return `${base} bg-[var(--text-primary)] text-white`;

      case "white":
        return `${base} bg-[var(--border-light)] text-white`;

      case "transparent":
        return `${base} bg-transparent px-0 py-2`;

      case "default":
      default:
        return `${base} border bg-zinc-900/70 border-white/20 text-white shadow-lg`;
    }
  };

  const containerClass = `
    ${getContainerStyles()}
    ${
      align === "center"
        ? "justify-center"
        : align === "end"
          ? "justify-end"
          : "justify-start"
    }
    ${className}
  `;

  return (
    <div className={containerClass}>
      <Breadcrumb
        separator={
          <RightOutlined
            style={{
              fontSize: "14px",
              opacity: 0.75,
              color: isWhiteText ? "#fff" : "var(--text-primary)",
            }}
          />
        }
        items={items}
        itemRender={(route, params, routes) => {
          const isLast = route === routes[routes.length - 1];

          const content = (
            <span
              className={`
        transition-colors duration-200
        ${isWhiteText ? "text-white" : ""}
        ${
          isLast
            ? "font-medium cursor-default"
            : isWhiteText
              ? "hover:text-white/80 hover:underline cursor-pointer"
              : "hover:text-[var(--primary)] hover:underline cursor-pointer"
        }
      `}
            >
              {route.title}
            </span>
          );

          if (isLast) {
            return content;
          }

          return (
            <Link href={route.href || "#"} className="no-underline">
              {content}
            </Link>
          );
        }}
      />
    </div>
  );
};

// Вспомогательная функция
export const createBreadcrumbItem = (
  title: React.ReactNode,
  href?: string,
  disabled?: boolean,
): ItemType => ({
  title,
  href,
});
