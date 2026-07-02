'use client'

import { Toaster } from 'sonner'

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      expand
      duration={4000}
      visibleToasts={5}
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'rounded-xl border border-white/10 shadow-2xl',
          title:
            'font-semibold',
          description:
            'text-sm opacity-90',
          closeButton:
            'bg-transparent border-0',
        },
      }}
    />
  )
}