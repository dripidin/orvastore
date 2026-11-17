import { Suspense } from "react";

import type { Metadata } from "next";

import { DevEnvironmentBanner } from "@/components/dev-environment-banner";

import { SettingsIntegrations } from "./settings-integrations";
import { SyncFeesCard } from "./sync-fees-card";

export const metadata: Metadata = {
  title: "System Settings, Gemini AI & Integrations Center | ORVA Store",
  description:
    "Orva Agent AI (Google Gemini API), Meta Pixel & CAPI, Telegram Bot Instant Alerts, and Courier Logistics Management — ORVA Store",
};

export default function Page() {
  return (
    <main className="flex flex-col gap-6" dir="rtl">
      <header className="flex flex-col gap-1 border-b pb-4">
        <h1 className="font-extrabold text-2xl tracking-tight sm:text-3xl">
          إعدادات النظام، الذكاء الاصطناعي (Gemini AI)، والتكاملات اللوجستية
        </h1>
        <p className="text-muted-foreground text-sm">
          إدارة وكيل الذكاء الاصطناعي Orva Agent AI (Google Gemini API)، بيكسل فيسبوك (CAPI)، إشعارات تليجرام الفورية،
          وإعدادات الربط اللوجستي مع Redex Express DZ.
        </p>
      </header>

      <DevEnvironmentBanner />

      <SyncFeesCard />

      {/* Unified Settings & Integrations */}
      <div dir="ltr">
        <Suspense
          fallback={<div className="p-6 text-muted-foreground text-xs">جارٍ تحميل إعدادات النظام والتكاملات...</div>}
        >
          <SettingsIntegrations />
        </Suspense>
      </div>
    </main>
  );
}
