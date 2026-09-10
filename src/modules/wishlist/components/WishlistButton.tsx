// modules/wishlist/components/WishlistButton.tsx
"use client";

import { Heart } from "lucide-react";
import type { ProductCardData } from "@/modules/productCard";
import { useToggleWishlist } from "@/modules/productCard/hooks/useToggleWishlist";
import {
	CircleIconButton,
	type CircleIconButtonSize,
	type CircleIconButtonTone,
} from "@/shared/components/CircleIconButton";

interface WishlistButtonProps {
	product: ProductCardData;
	/** Материал и размер кнопки — см. CircleIconButton. */
	tone?: CircleIconButtonTone;
	size?: CircleIconButtonSize;
	className?: string;
}

export function WishlistButton({
	product,
	tone,
	size,
	className,
}: WishlistButtonProps) {
	const { isInWishlist, isToggling, toggleWishlist } = useToggleWishlist(
		product.id,
	);

	return (
		<CircleIconButton
			active={isInWishlist}
			disabled={isToggling}
			tone={tone}
			size={size}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				toggleWishlist(product);
			}}
			aria-label={
				isInWishlist ? "Удалить из избранного" : "Добавить в избранное"
			}
			className={className}
		>
			<Heart
				size={size === "sm" ? 15 : 18}
				fill={isInWishlist ? "currentColor" : "none"}
				aria-hidden="true"
			/>
		</CircleIconButton>
	);
}
