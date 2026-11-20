import { Suspense } from "react";

import type { Metadata } from "next";

import { SettingsIntegrations } from "./settings-integrations";
import { SyncFeesCard } from "./sync-fees-card";

export const metadata: Metadata = {
  title: "System Settings, Gemini AI & Integrations Center | ORVA Store",
  description:
    "Orva Agent AI, Meta Pixel & CAPI, Telegram Bot Instant Alerts, and Courier Logistics Management — ORVA Store",
};

export default function Page() {
  return (
    <main className="flex flex-col gap-6" dir="rtl">
      <header className="flex flex-col gap-1 border-b pb-4">
        <h1 className="font-extrabold text-2xl tracking-tight sm:text-3xl">
          إعدادات النظام والذكاء الاصطناعي والتكاملات اللوجستية
        </h1>
        <p className="text-muted-foreground text-sm">
          إدارة مساعد الذكاء الاصطناعي، بيكسل فيسبوك، إشعارات تيليجرام الفورية، وإعدادات الربط اللوجستي مع شركة التوصيل.
        </p>
      </header>

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
