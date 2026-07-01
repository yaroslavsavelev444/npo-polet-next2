// components/ConsentItem.tsx
'use client';

import { ConsentListItem } from '@/modules/auth/types';
import Typography from '@/UI/Typography/Typography';
import Link from 'next/link';

interface ConsentItemProps {
  consent: ConsentListItem;
  checked: boolean;
  onChange: (slug: string) => void;
  disabled?: boolean;
}

export function ConsentItem({ consent, checked, onChange, disabled }: ConsentItemProps) {
  const { slug, title, isRequired, documentUrl } = consent;

  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(slug)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 
                   focus:ring-blue-500 cursor-pointer disabled:opacity-50 
                   disabled:cursor-not-allowed transition-colors"
      />
      <Typography variant="body-sm" color="secondary" className="flex-1">
        {isRequired && (
          <span className="text-red-500 mr-1">*</span>
        )}
        {documentUrl ? (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-500 hover:underline"
          >
            {title}
          </a>
        ) : (
          <Link
            href={`/consents/${slug}`}
            target="_blank"
            className="text-blue-600 hover:text-blue-500 hover:underline"
          >
            {title}
          </Link>
        )}
        {isRequired && (
          <span className="ml-1 text-xs text-gray-400">(обязательно)</span>
        )}
      </Typography>
    </label>
  );
}