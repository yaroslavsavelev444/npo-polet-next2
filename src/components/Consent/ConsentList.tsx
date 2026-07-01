// components/ConsentList.tsx
'use client';

import { ConsentListItem } from '@/modules/auth/types';
import { ConsentItem } from './ConsentItem';
import Typography from '@/UI/Typography/Typography';
interface ConsentListProps {
  consents: ConsentListItem[];
  checkedSlugs: Record<string, boolean>;
  onToggle: (slug: string) => void;
  disabled?: boolean;
  error?: string;
}

export function ConsentList({
  consents,
  checkedSlugs,
  onToggle,
  disabled,
  error,
}: ConsentListProps) {
  if (consents.length === 0) return null;

  return (
    <div className="space-y-2 pt-2  border-gray-100">
      <div className="space-y-1.5">
        {consents.map((consent) => (
          <ConsentItem
            key={consent.slug}
            consent={consent}
            checked={!!checkedSlugs[consent.slug]}
            onChange={onToggle}
            disabled={disabled}
          />
        ))}
      </div>
      {error && (
        <Typography variant="caption" color="danger">
          {error}
        </Typography>
      )}
    </div>
  );
}