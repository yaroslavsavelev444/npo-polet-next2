"use client";

import { dataStyle } from "@/resources/content";
import {
  ChartMode,
  ChartVariant,
  DataThemeProvider,
  iconLibrary,
  IconProvider,
  LayoutProvider,
  ToastProvider,
} from "@once-ui-system/core";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider>
        <DataThemeProvider
          variant={dataStyle.variant as ChartVariant}
          mode={'categorical' as ChartMode}
          height={400}
        >
          <ToastProvider>
            <IconProvider icons={iconLibrary}>{children}</IconProvider>
          </ToastProvider>
        </DataThemeProvider>

    </LayoutProvider>
  );
}
