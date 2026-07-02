"use client";

import { dataStyle } from "@/resources/content";
import { AppToaster } from "@/shared/components/Toaster";
import {
  ChartMode,
  ChartVariant,
  DataThemeProvider,
  iconLibrary,
  IconProvider,
  LayoutProvider,
} from "@once-ui-system/core";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider>
        <DataThemeProvider
          variant={dataStyle.variant as ChartVariant}
          mode={'categorical' as ChartMode}
          height={400}
        >
            <IconProvider icons={iconLibrary}>{children}
              <AppToaster />

            </IconProvider>
        </DataThemeProvider>

    </LayoutProvider>
  );
}
