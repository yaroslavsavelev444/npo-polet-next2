'use client';

// import { Search } from 'lucide-react';

interface Props {
  expanded?: boolean;
}

export default function SearchInput({ expanded = false }: Props) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl transition-all ${
        expanded ? 'w-full max-w-[420px]' : 'w-48'
      }`}
    >
      {/* <Search size={18} className="text-neutral-400" /> */}
      <input
        type="text"
        placeholder="Поиск товаров..."
        className="bg-transparent border-none outline-none text-sm text-white placeholder:text-neutral-400 flex-1"
      />
    </div>
  );
}