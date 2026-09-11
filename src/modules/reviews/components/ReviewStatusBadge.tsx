import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ReviewStatus } from "@/payload/services/reviews.service";
import { REVIEW_STATUS_VIEW } from "../lib/status-view";
import styles from "./Reviews.module.css";

const ICONS = {
	approved: CheckCircle2,
	pending: Clock,
	rejected: XCircle,
} as const;

const TONE_CLASS = {
	approved: styles.statusApproved,
	pending: styles.statusPending,
	rejected: styles.statusRejected,
} as const;

/**
 * Статус собственного отзыва: значок, подпись словом и тон.
 *
 * Цвет только усиливает — различают статусы силуэт значка и подпись, которые
 * работают при дальтонизме и в распечатке.
 */
export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
	const view = REVIEW_STATUS_VIEW[status];
	const Icon = ICONS[view.tone];

	return (
		<span className={`${styles.status} ${TONE_CLASS[view.tone]}`}>
			<Icon size={13} aria-hidden />
			{view.label}
		</span>
	);
}

export default ReviewStatusBadge;
