"use client";

import { RevealFx } from "@once-ui-system/core";
import type { ComponentProps, ReactNode } from "react";
import { useInView } from "react-intersection-observer";

type RevealFxComponentProps = ComponentProps<typeof RevealFx>;

type RevealProps = Omit<RevealFxComponentProps, "trigger"> & {
  /** Порог срабатывания (0..1). По умолчанию 0.15. */
  threshold?: number;
  /** Корректировка области отслеживания. */
  rootMargin?: string;
  /** Анимировать только один раз (рекомендуется). */
  once?: boolean;
  children: ReactNode;
};

export function Reveal({
  threshold = 0.15,
  rootMargin = "0px 0px -15% 0px",
  once = true,
  children,
  ...revealFxProps
}: RevealProps) {
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: once,
  });

  return (
    <div ref={ref}>
      <RevealFx trigger={inView} {...revealFxProps}>
        {children}
      </RevealFx>
    </div>
  );
}
