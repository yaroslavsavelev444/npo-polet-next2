"use client";

import {
  ChartMode,
  ChartVariant,
  DataThemeProvider,
  IconProvider,
  iconLibrary,
  LayoutProvider,
} from "@once-ui-system/core";
import { OAuthProvidersProvider } from "@/modules/auth/oauth/components/OAuthProvidersContext";
import { dataStyle } from "@/resources/content";
import { AppToaster } from "@/shared/components/Toaster";
import { QueryProvider } from "@/shared/providers/QueryProvider";

export function Providers({
  children,
  oauth,
}: {
  children: React.ReactNode;
  /** Включённые сервисы входа — решает сервер (modules/auth/oauth/config.ts). */
  oauth: { yandex: boolean };
}) {
  return (
    <OAuthProvidersProvider yandex={oauth.yandex}>
      <QueryProvider>
        <LayoutProvider>
          <DataThemeProvider
            variant={dataStyle.variant as ChartVariant}
            mode={"categorical" as ChartMode}
            height={400}
          >
            <IconProvider icons={iconLibrary}>
              {children}
              <AppToaster />
            </IconProvider>
          </DataThemeProvider>
        </LayoutProvider>
      </QueryProvider>
    </OAuthProvidersProvider>
  );
}
