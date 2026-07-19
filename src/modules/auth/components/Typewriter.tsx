"use client";

import { useEffect, useRef, useState } from "react";

interface TypewriterProps {
  /** Полный текст, который «печатается» посимвольно при монтировании. */
  text: string;
  /** Задержка между символами, мс. */
  speed?: number;
  /** Задержка перед стартом печати, мс. */
  startDelay?: number;
  className?: string;
}

/**
 * Печатный (typewriter) эффект без внешних зависимостей.
 *
 * Анимация запускается один раз — при монтировании компонента (т.е. при
 * открытии страницы). Мигающий курсор гаснет по завершении печати.
 *
 * Доступность: пользователям с prefers-reduced-motion текст показывается
 * сразу целиком, без анимации и курсора. Для скринридеров реальный текст
 * всегда доступен через визуально скрытую подпись, а анимируемая часть
 * помечена aria-hidden.
 */
export function Typewriter({
  text,
  speed = 55,
  startDelay = 150,
  className,
}: TypewriterProps) {
  const [display, setDisplay] = useState("");
  const [done, setDone] = useState(false);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion.current) {
      setDisplay(text);
      setDone(true);
      return;
    }

    let index = 0;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        index += 1;
        setDisplay(text.slice(0, index));
        if (index >= text.length) {
          clearInterval(intervalId);
          setDone(true);
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [text, speed, startDelay]);

  return (
    <>
      <span aria-hidden="true">
        {display}
        <span
          className={done ? "opacity-0" : "animate-[caret-blink_1s_step-end_infinite]"}
          style={{
            display: "inline-block",
            width: "0.06em",
            marginLeft: "0.06em",
            alignSelf: "stretch",
            backgroundColor: "currentColor",
            transform: "translateY(0.12em)",
            height: "1em",
          }}
        />
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
