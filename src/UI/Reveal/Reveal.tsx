"use client";

import { RevealFx, RevealFxProps } from "@once-ui-system/core";
import { useInView } from "react-intersection-observer";

type RevealProps = Omit<RevealFxProps, "trigger"> & {
  /** Порог срабатывания (0..1). По умолчанию 0.15 — анимация начинается,
   *  когда 15% блока вошло в область просмотра. */
  threshold?: number;
  /** Корректировка области отслеживания. Значение "-15% 0px" даёт
   *  небольшой запас снизу, чтобы блок «оживал» чуть раньше. */
  rootMargin?: string;
  /** Анимировать только один раз (рекомендуется). */
  once?: boolean;
};

export function Reveal({
  threshold = 0.15,
  rootMargin = "0px 0px -15% 0px",
  once = true,
  ...revealFxProps
}: RevealProps) {
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: once,
  });

  return (
    <div ref={ref}>
      <RevealFx trigger={inView} {...revealFxProps} />
    </div>
  );
}
