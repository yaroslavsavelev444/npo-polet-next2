"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./HeroMediaBackground.module.css";

interface HeroMediaBackgroundProps {
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
}

export function HeroMediaBackground({
  imageUrl,
  videoUrl,
  posterUrl,
}: HeroMediaBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoUrl) return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      videoRef.current?.pause();
    }
  }, [videoUrl]);

  if (!imageUrl && !videoUrl) return null;

  return (
    <div className={styles.wrapper} aria-hidden="true">
      {videoUrl ? (
        <video
          ref={videoRef}
          className={styles.media}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <Image
          src={imageUrl as string}
          alt=""
          fill
          sizes="100vw"
          quality={85}
          className={styles.media}
        />
      )}
      <div className={styles.overlay} />
    </div>
  );
}
