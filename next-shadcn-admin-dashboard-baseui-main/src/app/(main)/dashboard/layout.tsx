"use client";

import * as React from "react";
import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getPreference } from "@/server/server-actions";

import { AdminSessionGate } from "./_components/admin-session-gate";
import { LayoutControls } from "./_components/header/layout-controls";
import { SearchDialog } from "./_components/header/search-dialog";
import { ThemeSwitcher } from "./_components/header/theme-switcher";
import { AdminLocaleProvider } from "@/lib/i18n/admin-locale";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const [variant, setVariant] = React.useState<any>("inset");
  const [collapsible, setCollapsible] = React.useState<any>("icon");

  React.useEffect(() => {
    async function loadPreferences() {
      try {
        const [v, c] = await Promise.all([
          getPreference("sidebar_variant"),
          getPreference("sidebar_collapsible"),
        ]);
        if (v) setVariant(v);
        if (c) setCollapsible(c);
      } catch (e) {
        // Fallback to default inset / icon
      }
    }
    void loadPreferences();
  }, []);

  return (
    <AdminLocaleProvider>
      <AdminSessionGate>
        <SidebarProvider
          defaultOpen={true}
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 68)",
            } as React.CSSProperties
          }
        >
        <AppSidebar variant={variant} collapsible={collapsible} />
        <SidebarInset
          className={cn(
            "[html[data-content-layout=centered]_&>*]:mx-auto",
            "[html[data-content-layout=centered]_&>*]:w-full",
            "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
            "peer-data-[variant=inset]:border",
            "[--dashboard-header-height:--spacing(12)]",
            "min-w-0 overflow-x-clip",
          )}
        >
          <header
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
              "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
            )}
          >
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                />
                <SearchDialog />
              </div>
              <div className="flex items-center gap-2">
                <LayoutControls />
                <ThemeSwitcher />
              </div>
            </div>
          </header>
          {/* Pages can set data-content-padding="false" to render full-bleed app layouts. */}
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 has-data-[content-padding=false]:p-0 md:p-6 md:has-data-[content-padding=false]:p-0">
            {children}
          </div>
        </SidebarInset>
        </SidebarProvider>
      </AdminSessionGate>
    </AdminLocaleProvider>
  );
}
