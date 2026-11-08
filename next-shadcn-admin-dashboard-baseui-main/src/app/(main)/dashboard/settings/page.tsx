import type { Metadata } from "next";
import { DevEnvironmentBanner } from "@/components/dev-environment-banner";
import { SettingsIntegrations } from "./settings-integrations";

export const metadata: Metadata = {
  title: "System Settings & Integrations Center | ORVA Store",
  description: "Meta Pixel & CAPI, Telegram Bot Instant Alerts, and Courier Logistics Management — ORVA Store",
};

export default function Page() {
  return (
    <main className="flex flex-col gap-6" dir="rtl">
      <header className="flex flex-col gap-1 border-b pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">إعدادات النظام والتكاملات اللوجستية</h1>
        <p className="text-sm text-muted-foreground">
          إدارة بيكسل فيسبوك (CAPI)، إشعارات تليجرام الفورية، وإعدادات الربط اللوجستي مع Redex Express DZ.
        </p>
      </header>

      <DevEnvironmentBanner />

      {/* Unified Settings & Integrations */}
      <div dir="ltr">
        <SettingsIntegrations />
      </div>
    </main>
  );
}
