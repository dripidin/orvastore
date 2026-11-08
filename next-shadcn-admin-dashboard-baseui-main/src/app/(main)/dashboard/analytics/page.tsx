import { AnalyticsOverview } from "./_components/analytics-overview";

export default function Page() {
  return (
    <div className="flex flex-col gap-6" dir="ltr">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">مؤشرات تشغيلية من سجلات الطلبات الفعلية ومصادر البيانات المتاحة.</p>
      </header>
      <AnalyticsOverview />
    </div>
  );
}
