"use client";

import * as React from "react";
import { AlertCircle, Database, RefreshCw, Server, ShieldAlert, Truck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOrvaOrders } from "@/lib/orva-api";

interface HealthReport {
  timestamp: string;
  orderCount: number;
}

export function ApiManagement() {
  const [report, setReport] = React.useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const checkHealth = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const orders = await fetchOrvaOrders();
      setReport({ timestamp: new Date().toISOString(), orderCount: orders.length });
    } catch (reason) {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "تعذر قراءة تقرير الفحص.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => { void checkHealth(); }, [checkHealth]);

  const integrationItems = [
    { key: "database", title: "قراءة بيانات الطلبات", icon: Database, note: "قراءة ناجحة لسجل الطلبات عبر نقطة الإدارة." },
    { key: "delivery_api", title: "واجهة الطلبات", icon: Server, note: "تم التحقق من استجابة طلب البيانات الفعلي." },
    { key: "meta_pixel", title: "Meta Pixel / Analytics", icon: ShieldAlert, note: "أحداث الزيارات غير موصولة بمصدر موثوق في هذا المشروع." },
    { key: "redex", title: "Redex", icon: Truck, note: "لا يوجد إرسال آلي مثبت؛ تعليق التعديل مخصص للنسخ اليدوي." },
  ];

  return (
    <div className="space-y-5 text-right" dir="ltr">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Server className="size-5 text-primary" /> حالة واجهات الربط</h2>
          <p className="mt-1 text-xs text-muted-foreground">الفحص يعرض البيانات المتاحة مع توضيح حدود ما يمكن تأكيده.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void checkHealth()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "animate-spin" : ""} data-icon="inline-start" />
          تحديث الفحص
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>تقرير حالة الربط غير متاح</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {report && !error && (
        <Alert>
          <Server aria-hidden="true" />
            <AlertTitle>قراءة بيانات الإدارة نجحت</AlertTitle>
          <AlertDescription>
            استُلمت {report.orderCount.toLocaleString("fr-DZ")} طلبية من خدمة الإدارة. لا يختبر هذا الفحص وصول أحداث Meta أو إرسالًا إلى Redex. آخر فحص: {new Date(report.timestamp).toLocaleString("ar-DZ")}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {integrationItems.map((item) => {
          const Icon = item.icon;
          const title = item.title;
          const status = isLoading
            ? "جارٍ الفحص…"
            : error
              ? "غير متاح"
              : item.key === "database" || item.key === "delivery_api"
                ? "تم التحقق"
                : item.key === "redex"
                  ? "نسخ يدوي"
                  : "غير موصول";
          return (
            <Card key={item.key}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2"><Icon className="size-4 text-primary" aria-hidden="true" />{title}</span>
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{status}</span>
                </CardTitle>
                <CardDescription>{item.note}</CardDescription>
              </CardHeader>
              {report && !error && item.key === "database" && (
                <CardContent className="text-xs text-muted-foreground">
                  عدد الطلبات المستلمة في هذا الفحص: {report.orderCount.toLocaleString("fr-DZ")}.
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
