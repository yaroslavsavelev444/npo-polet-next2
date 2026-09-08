#!/usr/bin/env python3
"""
Подготовка изображений главной страницы под те кадры, которые для них
отведены в вёрстке.

    python3 scripts/prepare-home-images.py [--source DIR] [--dry-run]

────────────────────────────────────────────────────────────────────────────
ЗАЧЕМ
────────────────────────────────────────────────────────────────────────────
Исходники приходят в разных пропорциях и на разном фоне: неоновые рендеры на
чёрном (16:10 и портрет), фотография изделия на БЕЛОМ фоне, реальные снимки
производства 3:4. Если отдать их в вёрстку как есть, object-fit: cover
подгонит каждый под свой блок обрезкой — и кадры окажутся срезаны в
произвольных местах.

Скрипт приводит каждый файл к пропорции его блока ОДИН раз и осознанно:
    • фотографии — кадрируются (обрезка по большей стороне) с учётом того,
      где в кадре находится главное;
    • рендеры на чёрном — вписываются целиком, поля дозаливаются цветом фона
      САМОГО исходника, поэтому изделие никогда не режется, а стык полей и
      кадра не виден.

После этого в вёрстке обрезать уже нечего: файл и блок совпадают по
пропорции, а в манифесте (src/modules/home/lib/media.ts) стоят те самые
размеры, что и у файла.

────────────────────────────────────────────────────────────────────────────
ПОВТОРНЫЙ ЗАПУСК
────────────────────────────────────────────────────────────────────────────
Скрипт НЕ идемпотентен: он перезаписывает файлы в public/images/home. Заменив
исходник, положите его рядом и укажите каталог через --source, иначе
повторный прогон кадрирует уже кадрированное.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

# Фон страницы (--void-deep из app/(frontend)/theme.css). Запасной вариант,
# если у исходника не удалось определить цвет рамки.
PAGE_BG = (13, 16, 21)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "images" / "home"


@dataclass
class Spec:
    name: str
    # Целевые размеры кадра в пикселях.
    width: int
    height: int
    # "cover"   — кадрировать по большей стороне (для фотографий);
    # "contain" — вписать целиком, поля залить фоном (для рендеров);
    mode: str
    # Смещение кадра при "cover": 0.0 — верх, 0.5 — центр, 1.0 — низ.
    focus_y: float = 0.5
    # Удалить белый фон перед обработкой.
    drop_white: bool = False
    # Доля кадра, которую занимает изделие при "contain" (остальное — поля).
    inset: float = 0.92


SPECS: list[Spec] = [
    # ── Направления ──────────────────────────────────────────────────────
    # Три кадра в одном ряду обязаны быть одной пропорции, иначе ряд
    # «прыгает». 4:3 — компромисс между широким рендером пистолета и
    # портретным рендером стационарной установки.
    Spec("direction-handheld", 1200, 900, "contain"),
    Spec("direction-stationary", 1200, 900, "contain"),
    # Единственный кадр из трёх, который снят на камеру, а не отрисован:
    # изделие стоит в фотобоксе со светлыми стенками. Поэтому "cover", а не
    # "contain": вписывание целиком оставило бы на тёмной странице светлый
    # прямоугольник со швами павильона. Плотная обрезка убирает стенки и
    # оставляет само изделие.
    #
    # Убрать фон ключом здесь нельзя: он не белый, а серый с градиентом и
    # видимыми стыками, и порог по яркости рвёт его на куски (проверено).
    # Ровный результат дала бы только настоящая обтравка.
    Spec("direction-ew", 1200, 900, "cover", focus_y=0.5),
    # ── Производство ─────────────────────────────────────────────────────
    # Широкий кадр цеха. Исходник почти квадратный (1280×1225), интересное —
    # ряд стеллажей в средней трети, поэтому кадр смещён вверх от центра.
    Spec("production-wide", 1280, 720, "cover", focus_y=0.42),
    # Лента кадров: все пять в одной пропорции 3:4 — она же у четырёх
    # исходников, так что режется только пятый.
    Spec("production-1", 900, 1200, "cover"),
    Spec("production-2", 900, 1200, "cover"),
    Spec("production-3", 900, 1200, "cover"),
    Spec("production-4", 900, 1200, "cover"),
    Spec("production-5", 900, 1200, "cover"),
    # ── Фон финального призыва ───────────────────────────────────────────
    # Работает подложкой под текст с прозрачностью 40%, поэтому кадрируется
    # широко и мягко.
    Spec("cta-backdrop", 1600, 700, "cover"),
]


def drop_white_background(image: Image.Image) -> Image.Image:
    """
    Убирает белый фон, НЕ трогая светлые детали внутри изделия.

    Порог по яркости «в лоб» выбил бы дыры в белой наклейке на корпусе и в
    бликах. Поэтому удаляется только то белое, что связано с краем кадра:
    от рамки запускается заливка по маске светлых пикселей, и прозрачным
    становится ровно фон.

    Край объекта сглажен: у полупрозрачных пикселей на границе альфа падает
    плавно в диапазоне яркости 200…245, иначе вокруг изделия остаётся
    ступенчатый белый ореол.
    """
    rgb = np.asarray(image.convert("RGB")).astype(np.float32)
    luma = rgb.max(axis=2)

    # Заведомо светлые пиксели — кандидаты в фон.
    light = luma > 200

    # Волновая заливка от границ кадра по маске light.
    h, w = light.shape
    background = np.zeros_like(light)
    stack: list[tuple[int, int]] = []

    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not background[y, x]:
                background[y, x] = True
                stack.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not background[y, x]:
                background[y, x] = True
                stack.append((y, x))

    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not background[ny, nx]:
                background[ny, nx] = True
                stack.append((ny, nx))

    # Мягкая граница: чем светлее пиксель фона, тем он прозрачнее.
    ramp = np.clip((luma - 200.0) / 45.0, 0.0, 1.0)
    alpha = np.where(background, 1.0 - ramp, 1.0)

    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def fit_cover(image: Image.Image, width: int, height: int, focus_y: float) -> Image.Image:
    """Заполнить кадр целиком, обрезав лишнее по большей стороне."""
    src_ratio = image.width / image.height
    dst_ratio = width / height

    if src_ratio > dst_ratio:
        # Исходник шире — режем по ширине, по центру.
        new_w = int(round(image.height * dst_ratio))
        left = (image.width - new_w) // 2
        box = (left, 0, left + new_w, image.height)
    else:
        # Исходник выше — режем по высоте, с учётом точки внимания.
        new_h = int(round(image.width / dst_ratio))
        top = int(round((image.height - new_h) * focus_y))
        top = max(0, min(top, image.height - new_h))
        box = (0, top, image.width, top + new_h)

    return image.crop(box).resize((width, height), Image.LANCZOS)


def border_color(image: Image.Image) -> tuple[int, int, int]:
    """
    Цвет фона самого исходника — медиана по рамке в один пиксель.

    Заливать поля фиксированным цветом страницы нельзя: у рендеров фон
    чисто чёрный (#000), а токен страницы — #0D1015, и разница в пятнадцать
    единиц яркости видна как более тёмный прямоугольник внутри кадра.
    Медиана по краю подстраивается под конкретный файл и делает стык
    незаметным.

    Медиана, а не среднее: одна яркая деталь, случайно задевшая край, сдвинет
    среднее, но не медиану.
    """
    rgb = np.asarray(image.convert("RGB"))
    edges = np.concatenate(
        [rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0
    )
    median = np.median(edges, axis=0)
    return tuple(int(round(channel)) for channel in median)  # type: ignore[return-value]


def fit_contain(image: Image.Image, width: int, height: int, inset: float) -> Image.Image:
    """Вписать целиком, залив поля фоном самого исходника."""
    canvas = Image.new("RGB", (width, height), border_color(image))

    max_w = int(width * inset)
    max_h = int(height * inset)
    scale = min(max_w / image.width, max_h / image.height)
    new_size = (max(1, int(round(image.width * scale))), max(1, int(round(image.height * scale))))
    resized = image.resize(new_size, Image.LANCZOS)

    offset = ((width - new_size[0]) // 2, (height - new_size[1]) // 2)
    if resized.mode == "RGBA":
        canvas.paste(resized, offset, resized)
    else:
        canvas.paste(resized, offset)
    return canvas


def process(spec: Spec, source_dir: Path, dry_run: bool) -> str:
    src = source_dir / f"{spec.name}.jpg"
    if not src.exists():
        return f"пропущен (нет файла): {src.name}"

    with Image.open(src) as raw:
        raw.load()
        before = f"{raw.width}x{raw.height}"
        image = raw

        if spec.drop_white:
            image = drop_white_background(image)

        if spec.mode == "cover":
            result = fit_cover(image.convert("RGB"), spec.width, spec.height, spec.focus_y)
        else:
            result = fit_contain(image, spec.width, spec.height, spec.inset)

    if dry_run:
        return f"{spec.name}: {before} -> {spec.width}x{spec.height} ({spec.mode}) [dry-run]"

    dst = OUT_DIR / f"{spec.name}.jpg"
    # Качество 82 — предел, ниже которого на неоновых градиентах появляется
    # полосатость. progressive даёт раннюю отрисовку на медленном канале.
    result.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    size_kb = dst.stat().st_size // 1024
    return f"{spec.name}: {before} -> {spec.width}x{spec.height} ({spec.mode}), {size_kb} КБ"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=OUT_DIR,
        help="каталог с исходниками (по умолчанию — сам public/images/home)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.source.is_dir():
        print(f"нет каталога с исходниками: {args.source}", file=sys.stderr)
        return 1

    # Обработка «на месте» перезаписывает исходник, поэтому он сначала
    # копируется во временный каталог и читается уже оттуда.
    staging = None
    if args.source.resolve() == OUT_DIR.resolve() and not args.dry_run:
        staging = OUT_DIR.parent / ".home-staging"
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)
        for spec in SPECS:
            candidate = OUT_DIR / f"{spec.name}.jpg"
            if candidate.exists():
                shutil.copy2(candidate, staging / candidate.name)
        source_dir = staging
    else:
        source_dir = args.source

    try:
        for spec in SPECS:
            print(process(spec, source_dir, args.dry_run))
    finally:
        if staging and staging.exists():
            shutil.rmtree(staging)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
