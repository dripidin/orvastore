"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  Activity,
  ArrowLeft,
  Bot,
  Cookie,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  Info,
  Laptop,
  Link2,
  Monitor,
  Percent,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type VercelPeriod = "24h" | "7d" | "30d" | "90d";
type MetricFocus = "visitors" | "pageviews";
type DisplayMode = "count" | "percent";

interface DimensionRow {
  label: string;
  visitors: number;
  pageviews: number;
  percent: number;
}

interface TimeseriesPoint {
  bucket: string;
  visitors: number;
  pageviews: number;
}

interface VercelAnalyticsPayload {
  success: boolean;
  connected: boolean;
  customEventsPlanRequired?: boolean;
  reason?: string;
  message?: string;
  provider: "vercel-web-analytics";
  sdkPackage: string;
  rootLayoutActive: boolean;
  period: VercelPeriod;
  activeFilter: { key: string; value: string } | null;
  project: {
    projectId: string;
    teamId: string;
    projectName: string;
  };
  dashboardUrl: string;
  syncedAt: string | null;
  summary: {
    visitors: number;
    pageviews: number;
    pagesPerVisit: number;
    customEventsTotal: number;
  } | null;
  timeseries: TimeseriesPoint[];
  panels: {
    pages: DimensionRow[];
    referrers: DimensionRow[];
    countries: DimensionRow[];
    os: DimensionRow[];
    devices: DimensionRow[];
    browsers: DimensionRow[];
    events: DimensionRow[];
  };
}

const PERIOD_OPTIONS: Array<{ value: VercelPeriod; label: string }> = [
  { value: "24h", label: "آخر 24 ساعة" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يوماً" },
  { value: "90d", label: "آخر 90 يوماً" },
];

function exportPanelToCsv(panelName: string, rows: DimensionRow[]) {
  if (!rows.length) return;
  const maxRows = rows.slice(0, 250);
  const escapeCell = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const lines = [
    ["Entry", "Visitors", "Page Views", "Share (%)"].map(escapeCell).join(","),
    ...maxRows.map((row) => [row.label, row.visitors, row.pageviews, `${row.percent}%`].map(escapeCell).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `vercel-analytics-${panelName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getMetricValue(row: DimensionRow, metricFocus: MetricFocus): number {
  return metricFocus === "visitors" ? row.visitors : row.pageviews;
}

function computeRowShares(
  rows: DimensionRow[],
  metricFocus: MetricFocus,
): Array<DimensionRow & { sharePercent: number }> {
  const total = rows.reduce((sum, item) => sum + getMetricValue(item, metricFocus), 0);
  return [...rows]
    .sort((a, b) => getMetricValue(b, metricFocus) - getMetricValue(a, metricFocus))
    .map((row) => ({
      ...row,
      sharePercent: total > 0 ? Math.round((getMetricValue(row, metricFocus) / total) * 100) : row.percent,
    }));
}

interface AnalyticsPanelCardProps {
  title: string;
  subtitle: string;
  panelKey: string;
  dimensionKey: string;
  rows: DimensionRow[];
  connected: boolean;
  metricFocus: MetricFocus;
  displayMode: DisplayMode;
  activeFilter: { key: string; value: string } | null;
  onSelectFilter: (key: string, value: string) => void;
  unitLabels?: { visitors: string; pageviews: string };
  emptyNotice?: string;
}

function AnalyticsPanelCard({
  title,
  subtitle,
  panelKey,
  dimensionKey,
  rows,
  connected,
  metricFocus,
  displayMode,
  activeFilter,
  onSelectFilter,
  unitLabels = { visitors: "زائر", pageviews: "مشاهدة" },
  emptyNotice,
}: AnalyticsPanelCardProps) {
  const [expanded, setExpanded] = useState(false);
  const rankedRows = computeRowShares(rows, metricFocus);
  const displayed = expanded ? rankedRows : rankedRows.slice(0, 5);

  const renderPanelBody = () => {
    if (!connected) {
      return (
        <div className="rounded-lg border border-border/70 border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-xs">
          ستظهر صفوف <span className="font-semibold text-foreground">{title}</span> مباشرة هنا عند ربط{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">VERCEL_TOKEN</code>، أو عبر لوحة Vercel
          Web Analytics.
        </div>
      );
    }

    if (displayed.length === 0) {
      return (
        <div className="rounded-lg border border-border/70 border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-xs">
          {emptyNotice ?? "لا توجد بيانات مسجلة لهذا البُعد خلال النطاق الزمني المحدد."}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {displayed.map((row) => {
          const isSelected = activeFilter?.key === dimensionKey && activeFilter.value === row.label;
          const primaryVal = getMetricValue(row, metricFocus);
          const unitLabel = metricFocus === "visitors" ? unitLabels.visitors : unitLabels.pageviews;
          return (
            <button
              key={`${dimensionKey}-${row.label}`}
              type="button"
              onClick={() => onSelectFilter(dimensionKey, row.label)}
              className={`w-full cursor-pointer space-y-1 rounded-md p-1.5 text-right transition-colors ${
                isSelected ? "bg-emerald-500/15 ring-1 ring-emerald-500/50" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="max-w-[180px] truncate font-mono text-foreground" dir="ltr">
                  {row.label}
                </span>
                <div className="flex shrink-0 items-center gap-2 font-mono">
                  {displayMode === "percent" ? (
                    <span className="font-semibold text-foreground">{row.sharePercent}%</span>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground">
                        {primaryVal.toLocaleString("en-US")} {unitLabel}
                      </span>
                      {row.sharePercent > 0 && (
                        <span className="text-[11px] text-muted-foreground">{row.sharePercent}%</span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(4, row.sharePercent || 10)}%` }}
                />
              </div>
            </button>
          );
        })}

        {rankedRows.length > 5 && (
          <div className="pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((prev) => !prev)}
              className="h-7 w-full text-muted-foreground text-xs hover:text-foreground"
            >
              {expanded ? "عرض أقل" : `عرض الكل (View All • ${rankedRows.length})`}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="flex flex-col justify-between border-slate-800/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="font-semibold text-sm">{title}</CardTitle>
            <CardDescription className="text-xs">{subtitle}</CardDescription>
          </div>
          {rankedRows.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => exportPanelToCsv(panelKey, rankedRows)}
              title="تصدير CSV (حتى 250 سجل)"
              aria-label={`تصدير ${title} بصيغة CSV`}
            >
              <Download className="size-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2.5">{renderPanelBody()}</CardContent>
    </Card>
  );
}

export default function StoreTrafficPage() {
  const [period, setPeriod] = useState<VercelPeriod>("7d");
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("visitors");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("count");
  const [activeFilter, setActiveFilter] = useState<{ key: string; value: string } | null>(null);
  const [data, setData] = useState<VercelAnalyticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [deviceTab, setDeviceTab] = useState<"devices" | "browsers">("devices");
  const [devicesExpanded, setDevicesExpanded] = useState<boolean>(false);

  const fetchAnalytics = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest" };
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("orva_admin_token");
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        const params = new URLSearchParams({ period });
        if (activeFilter) {
          params.set("filterKey", activeFilter.key);
          params.set("filterValue", activeFilter.value);
        }
        const res = await fetch(`/api/analytics/vercel?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers,
        });
        if (res.ok) {
          const json = (await res.json()) as VercelAnalyticsPayload;
          if (json.success) {
            setData(json);
          }
        }
      } catch (err) {
        console.warn("Could not fetch Vercel Web Analytics telemetry:", err);
      } finally {
        setIsLoading(false);
        if (manual) setIsRefreshing(false);
      }
    },
    [period, activeFilter],
  );

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSelectFilter = (key: string, value: string) => {
    setActiveFilter((prev) => {
      if (prev && prev.key === key && prev.value === value) {
        return null;
      }
      return { key, value };
    });
  };

  const dashboardUrl = data?.dashboardUrl ?? "https://vercel.com/dripalpha/orvastore/analytics";
  const isConnected = Boolean(data?.connected && data.summary);
  const isCustomEventFilterActive = activeFilter?.key === "eventName";
  const maxSeriesValue = Math.max(
    1,
    ...(data?.timeseries.map((point) => (metricFocus === "visitors" ? point.visitors : point.pageviews)) ?? [1]),
  );

  const visitorsDisplay = isLoading ? "…" : (data?.summary?.visitors.toLocaleString("en-US") ?? "—");
  const pageviewsDisplay = isLoading ? "…" : (data?.summary?.pageviews.toLocaleString("en-US") ?? "—");

  const rawDeviceOrBrowserRows = deviceTab === "devices" ? (data?.panels.devices ?? []) : (data?.panels.browsers ?? []);
  const deviceOrBrowserRows = computeRowShares(rawDeviceOrBrowserRows, metricFocus);
  const visibleDeviceRows = devicesExpanded ? deviceOrBrowserRows : deviceOrBrowserRows.slice(0, 5);

  const renderDevicesPanelBody = () => {
    const dimKey = deviceTab === "devices" ? "deviceType" : "browserName";
    if (!isConnected) {
      return (
        <div className="rounded-lg border border-border/70 border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-xs">
          تصنيف الأجهزة (Mobile / Desktop) والمتصفحات يُجمع تلقائياً عبر Vercel Web Analytics.
        </div>
      );
    }
    if (visibleDeviceRows.length === 0) {
      return (
        <div className="rounded-lg border border-border/70 border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-xs">
          لا توجد بيانات مسجلة حالياً.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {visibleDeviceRows.map((row) => {
          const isSelected = activeFilter?.key === dimKey && activeFilter.value === row.label;
          const primaryVal = getMetricValue(row, metricFocus);
          return (
            <button
              key={`${dimKey}-${row.label}`}
              type="button"
              onClick={() => handleSelectFilter(dimKey, row.label)}
              className={`w-full cursor-pointer space-y-1 rounded-md p-1.5 text-right transition-colors ${
                isSelected ? "bg-emerald-500/15 ring-1 ring-emerald-500/50" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-foreground">{row.label}</span>
                <span className="font-mono text-muted-foreground">
                  {displayMode === "percent"
                    ? `${row.sharePercent}%`
                    : `${primaryVal.toLocaleString("en-US")} (${row.sharePercent}%)`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(4, row.sharePercent)}%` }}
                />
              </div>
            </button>
          );
        })}

        {deviceOrBrowserRows.length > 5 && (
          <div className="pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDevicesExpanded((prev) => !prev)}
              className="h-7 w-full text-muted-foreground text-xs hover:text-foreground"
            >
              {devicesExpanded ? "عرض أقل" : `عرض الكل (View All • ${deviceOrBrowserRows.length})`}
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
              الرئيسية
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground text-xs">تحليلات الزوار — Vercel Web Analytics</span>
          </div>
          <h1 className="flex flex-wrap items-center gap-2.5 font-bold text-2xl text-foreground tracking-tight">
            <Globe className="h-6 w-6 text-emerald-500" />
            مركز تحليلات الزوار — Vercel Web Analytics
          </h1>
          <p className="text-muted-foreground text-sm">
            تحليلات زوار متجر ORVA ومشاهدات الصفحات ومعدل الارتداد ومصادر الزيارات بخصوصية تامة بدون ملفات تعريف ارتباط
            عبر <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">@vercel/analytics/next</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-400"
          >
            <ShieldCheck className="size-3.5" />
            {isConnected ? "Vercel API متزامن" : "<Analytics /> مفعّل في RootLayout"}
          </Badge>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchAnalytics(true)}
            disabled={isRefreshing}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            تحديث
          </Button>

          <Button
            nativeButton={false}
            render={<a href={dashboardUrl} target="_blank" rel="noopener noreferrer" />}
            size="sm"
            className="h-8 gap-1.5 text-xs"
          >
            <span>فتح لوحة Vercel Web Analytics</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Date Range Dropdown/Pills, Active Filters & Display Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1" aria-label="الفترة الزمنية">
            <legend className="sr-only">الفترة الزمنية</legend>
            {PERIOD_OPTIONS.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={period === item.value ? "secondary" : "ghost"}
                onClick={() => setPeriod(item.value)}
                className="h-7 px-3 text-xs"
              >
                {item.label}
              </Button>
            ))}
          </fieldset>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDisplayMode((prev) => (prev === "count" ? "percent" : "count"))}
            className="h-8 gap-1.5 text-xs"
          >
            <Percent className="size-3.5 text-emerald-500" />
            {displayMode === "count" ? "عرض الأعداد" : "عرض النسب %"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeFilter && (
            <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 font-mono text-xs" dir="ltr">
              <Filter className="size-3 text-emerald-500" />
              {activeFilter.key} = {activeFilter.value}
              <button
                type="button"
                onClick={() => setActiveFilter(null)}
                className="cursor-pointer hover:text-destructive"
                aria-label="إلغاء التصفية"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {data?.syncedAt && (
            <span className="font-mono text-[11px] text-muted-foreground">
              آخر مزامنة: {new Date(data.syncedAt).toLocaleTimeString("ar-DZ")}
            </span>
          )}
        </div>
      </div>

      {/* Honest Connection Status Banner when VERCEL_TOKEN is not configured on the app server */}
      {!isLoading && !isConnected && (
        <Alert className="border-emerald-500/30 bg-emerald-500/5">
          <Info className="size-4 text-emerald-500" />
          <AlertTitle className="font-bold text-sm">
            مكوّن &lt;Analytics /&gt; مفعّل ويرسل البيانات إلى Vercel عند النشر
          </AlertTitle>
          <AlertDescription className="mt-1 space-y-2 text-muted-foreground text-xs">
            <p>
              حزمة <code className="rounded bg-muted px-1 font-mono text-foreground">@vercel/analytics/next</code>{" "}
              مضبوطة داخل <code className="rounded bg-muted px-1 font-mono text-foreground">src/app/layout.tsx</code>{" "}
              وتجمع زيارات المتجر تلقائياً بدون كوكيز.
            </p>
            <p>
              {data?.reason === "vercel_api_unauthorized"
                ? `تعذر سحب الأرقام عبر Vercel REST API (${data.message ?? "تحقق من صلاحيات VERCEL_TOKEN"}).`
                : "لعرض قراءات الزوار ولوحات Vercel مباشرة داخل هذه الصفحة، أضف متغير البيئة VERCEL_TOKEN في إعدادات الخادم، أو انتقل مباشرة إلى تبويب Web Analytics في لوحة Vercel."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Main KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Visitors */}
        <Card
          className={`cursor-pointer transition-colors ${
            metricFocus === "visitors"
              ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 via-background to-background"
              : "hover:border-border"
          }`}
          onClick={() => setMetricFocus("visitors")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">الزوار الفريدون (Visitors)</CardTitle>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
              <Users className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-extrabold font-mono text-3xl text-emerald-500 tracking-tight">{visitorsDisplay}</div>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              تحديد مجهول الهوية عبر Hash يومي مؤقت من الطلب الوارد بدون ملفات تعريف ارتباط.
            </p>
          </CardContent>
        </Card>

        {/* Page Views */}
        <Card
          className={`cursor-pointer transition-colors ${
            metricFocus === "pageviews"
              ? "border-blue-500/50 bg-gradient-to-br from-blue-500/10 via-background to-background"
              : "hover:border-border"
          }`}
          onClick={() => setMetricFocus("pageviews")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">مشاهدات الصفحات (Page Views)</CardTitle>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <Eye className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-extrabold font-mono text-3xl tracking-tight">{pageviewsDisplay}</div>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              {isConnected && data?.summary
                ? `متوسط ${data.summary.pagesPerVisit} صفحة لكل زائر (متابعة التنقلات عبر Browser API).`
                : "كل تحميل صفحة يُحسب فوراً، والتنقلات الداخلية تُرصد عبر واجهة المتصفح."}
            </p>
          </CardContent>
        </Card>

        {/* Bounce Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">معدل الارتداد (Bounce Rate)</CardTitle>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
              <TrendingDown className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-bold font-mono text-foreground text-lg tracking-tight" dir="ltr">
              {isCustomEventFilterActive ? "0%" : "(Single-Page / Total) × 100"}
            </div>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              {isCustomEventFilterActive
                ? "تم تصفية اللوحة حسب حدث مخصص؛ الأحداث المخصصة لا تدخل في حساب الارتداد."
                : "نسبة الزوار المغادرين بعد صفحة واحدة فقط. عند التصفية بحدث مخصص تصبح النسبة 0%."}
            </p>
          </CardContent>
        </Card>

        {/* Bots & Privacy */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">تصفية البوتات والخصوصية</CardTitle>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Bot className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-xs">
                Zero Cookies
              </Badge>
              <Badge variant="outline" className="text-xs">
                Bot Filter Active
              </Badge>
            </div>
            <p className="mt-2.5 text-muted-foreground text-xs leading-relaxed">
              يستبعد Vercel الزيارات الآلية تلقائياً عبر فحص ترويسة <code className="font-mono">User-Agent</code>.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs: Visitors / Page Views + Panels / Methodology */}
      <Tabs defaultValue="panels" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="panels" className="cursor-pointer gap-1.5 text-xs">
              <Activity className="size-3.5" />
              <span>اللوحات التفصيلية (Panels)</span>
            </TabsTrigger>
            <TabsTrigger value="methodology" className="cursor-pointer gap-1.5 text-xs">
              <Cookie className="size-3.5" />
              <span>آلية القياس والتصدير والخصوصية</span>
            </TabsTrigger>
          </TabsList>

          {/* Visitors vs Page Views tab selector matching Vercel Web Analytics UI */}
          <fieldset className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1" aria-label="مقياس التحليل">
            <legend className="sr-only">مقياس التحليل</legend>
            <Button
              type="button"
              size="sm"
              variant={metricFocus === "visitors" ? "secondary" : "ghost"}
              onClick={() => setMetricFocus("visitors")}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              <Users className="size-3.5 text-emerald-500" />
              تبويب الزوار (Visitors)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={metricFocus === "pageviews" ? "secondary" : "ghost"}
              onClick={() => setMetricFocus("pageviews")}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              <Eye className="size-3.5 text-blue-500" />
              تبويب المشاهدات (Page Views)
            </Button>
          </fieldset>
        </div>

        <TabsContent value="panels" className="space-y-6">
          {/* Visitors / Page Views Timeseries */}
          <Card className="border-slate-800/80">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-semibold text-base">
                    {metricFocus === "visitors"
                      ? "مخطط الزوار الفريدين (Visitors)"
                      : "مخطط مشاهدات الصفحات (Page Views)"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {metricFocus === "visitors"
                      ? "يعرض جميع الزوار الفريدين للموقع ضمن النطاق الزمني المحدد"
                      : "يعرض كل مرات تحميل صفحات الموقع بما في ذلك الزيارات المتكررة من نفس الزائر"}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {data?.project.projectName ?? "orvastore"} • Production
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isConnected && data?.timeseries && data.timeseries.length > 0 ? (
                <div className="space-y-2.5">
                  {data.timeseries.map((point) => {
                    const activeCount = metricFocus === "visitors" ? point.visitors : point.pageviews;
                    const barWidth = Math.max(4, Math.round((activeCount / maxSeriesValue) * 100));
                    return (
                      <div key={point.bucket} className="grid grid-cols-12 items-center gap-3 text-xs">
                        <span className="col-span-3 truncate font-mono text-muted-foreground sm:col-span-2" dir="ltr">
                          {point.bucket}
                        </span>
                        <div className="col-span-6 space-y-1 sm:col-span-7">
                          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800/80">
                            <div
                              className={`h-full rounded-full ${metricFocus === "visitors" ? "bg-emerald-500" : "bg-blue-500"}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                        <div className="col-span-3 flex flex-col text-left font-mono text-[11px]">
                          <span
                            className={
                              metricFocus === "visitors" ? "font-bold text-emerald-500" : "text-muted-foreground"
                            }
                          >
                            {point.visitors.toLocaleString("en-US")} زائر
                          </span>
                          <span
                            className={
                              metricFocus === "pageviews" ? "font-bold text-blue-400" : "text-muted-foreground"
                            }
                          >
                            {point.pageviews.toLocaleString("en-US")} مشاهدة
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border border-dashed p-6 text-center">
                  <p className="font-medium text-foreground text-sm">
                    {isConnected
                      ? "لا توجد بيانات زمنية كافية في هذه الفترة حتى الآن."
                      : "العرض الزمني المباشر متاح عبر لوحة Vercel Web Analytics أو عند تفعيل VERCEL_TOKEN."}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    تظهر البيانات في Vercel فور وصول زيارات إلى صفحات المتجر بعد النشر وتفعيل{" "}
                    <code className="rounded bg-muted px-1 font-mono">&lt;Analytics /&gt;</code>.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Breakdown Panels matching Vercel Web Analytics UI */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnalyticsPanelCard
              title="الصفحات (Pages)"
              subtitle="الصفحات الأكثر زيارة في المتجر"
              panelKey="pages"
              dimensionKey="requestPath"
              rows={data?.panels.pages ?? []}
              connected={isConnected}
              metricFocus={metricFocus}
              displayMode={displayMode}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
            />

            <AnalyticsPanelCard
              title="مصادر الزيارة (Referrers)"
              subtitle="المواقع والحملات المحيلة للمتجر"
              panelKey="referrers"
              dimensionKey="referrerHostname"
              rows={data?.panels.referrers ?? []}
              connected={isConnected}
              metricFocus={metricFocus}
              displayMode={displayMode}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
            />

            <AnalyticsPanelCard
              title="الدول (Countries)"
              subtitle="التوزيع الجغرافي للزوار"
              panelKey="countries"
              dimensionKey="country"
              rows={data?.panels.countries ?? []}
              connected={isConnected}
              metricFocus={metricFocus}
              displayMode={displayMode}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
            />

            <AnalyticsPanelCard
              title="أنظمة التشغيل (Operating Systems)"
              subtitle="توزيع زوار المتجر حسب النظام"
              panelKey="os"
              dimensionKey="osName"
              rows={data?.panels.os ?? []}
              connected={isConnected}
              metricFocus={metricFocus}
              displayMode={displayMode}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
            />

            {/* Devices & Browsers Panel with Export CSV & View All */}
            <Card className="flex flex-col justify-between border-slate-800/80">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-1.5 font-semibold text-sm">
                      {deviceTab === "devices" ? <Laptop className="size-4" /> : <Monitor className="size-4" />}
                      الأجهزة والمتصفحات (Devices & Browsers)
                    </CardTitle>
                    <CardDescription className="text-xs">توزيع الأجهزة أو متصفحات الزوار</CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {deviceOrBrowserRows.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => exportPanelToCsv(deviceTab, deviceOrBrowserRows)}
                        title="تصدير CSV (حتى 250 سجل)"
                        aria-label="تصدير الأجهزة والمتصفحات CSV"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    )}
                    <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={deviceTab === "devices" ? "secondary" : "ghost"}
                        onClick={() => setDeviceTab("devices")}
                        className="h-6 px-2 text-[11px]"
                      >
                        الأجهزة
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={deviceTab === "browsers" ? "secondary" : "ghost"}
                        onClick={() => setDeviceTab("browsers")}
                        className="h-6 px-2 text-[11px]"
                      >
                        المتصفحات
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-2.5">{renderDevicesPanelBody()}</CardContent>
            </Card>

            <AnalyticsPanelCard
              title="الأحداث المخصصة وميزات الأعلام (Custom Events)"
              subtitle="أحداث track() واستخدام Feature Flags"
              panelKey="custom-events"
              dimensionKey="eventName"
              rows={data?.panels.events ?? []}
              connected={isConnected}
              metricFocus={metricFocus}
              displayMode={displayMode}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
              unitLabels={{ visitors: "مستخدم", pageviews: "حدث" }}
              emptyNotice={
                data?.customEventsPlanRequired
                  ? "الأحداث المخصصة (Custom Events) تتطلب خطة Vercel Pro أو Enterprise، بينما تتبع الزوار والصفحات يعمل على جميع الخطط."
                  : undefined
              }
            />
          </div>
        </TabsContent>

        {/* Official Vercel Web Analytics Guide & Rules */}
        <TabsContent value="methodology" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-emerald-500" />
                كيف يتم تحديد الزوار (How Visitors Are Determined)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground text-xs leading-relaxed">
              <p>
                بدلاً من الاعتماد على ملفات تعريف الارتباط (Cookies)، تعتمد تحليلات Vercel على{" "}
                <span className="font-semibold text-foreground">Hash مجهول الهوية</span> يُنشأ من الطلب الوارد.
              </p>
              <p>
                يبقى هذا المعرّف صالحاً ليوم واحد فقط ثم يُعاد تعيينه تلقائياً، مما يمنع تتبع الزوار عبر الأيام المختلفة أو
                عبر مواقع أخرى.
              </p>
              <p>
                عند تحميل الموقع لأول مرة تُسجل الزيارة كـ{" "}
                <span className="font-semibold text-foreground">Page View</span>، وتُرصد التنقلات اللاحقة تلقائياً عبر
                واجهة برمجة المتصفح الأصلية.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="size-4 text-purple-500" />
                حساب معدل الارتداد (Bounce Rate)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground text-xs leading-relaxed">
              <div className="rounded-lg bg-muted p-2.5 text-center font-mono text-foreground" dir="ltr">
                Bounce Rate (%) = (Single-Page Sessions / Total Sessions) × 100
              </div>
              <p>
                تُعرَّف الجلسة بأنها مجموعة مشاهدات الصفحات الخاصة بنفس الزائر. الأحداث المخصصة (Custom Events) لا تُحسب ضمن
                معدل الارتداد.
              </p>
              <p>
                لذلك، عند تصفية لوحة البيانات لحدث مخصص محدد ستظهر قيمة معدل الارتداد مساوية دائماً لـ{" "}
                <span className="font-mono font-semibold text-foreground">0%</span>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="size-4 text-blue-500" />
                تصدير البيانات واللوحات (Panels & Exporting CSV)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground text-xs leading-relaxed">
              <p>
                يمكن تصدير حتى <span className="font-semibold text-foreground">250 صفاً</span> من البيانات المجمّعة
                (الزوار ومشاهدات الصفحات) بصيغة CSV من أي لوحة في Vercel Web Analytics.
              </p>
              <p>
                ولإرسال الأحداث الخام غير المجمّعة إلى وجهات خارجية بشكل مستمر يمكن استخدام ميزة{" "}
                <span className="font-semibold text-foreground">Drains</span> في منصة Vercel.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-amber-500" />
                خطوات عرض وتصفية البيانات في Vercel Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-muted-foreground text-xs leading-relaxed">
              <ol className="list-inside list-decimal space-y-1">
                <li>
                  اختر مشروع <span className="font-mono text-foreground">orvastore</span> من لوحة Vercel.
                </li>
                <li>
                  افتح تبويب <span className="font-semibold text-foreground">Web Analytics</span> من القائمة.
                </li>
                <li>حدّد النطاق (Domain) والفترة الزمنية من القائمة العلوية.</li>
                <li>انقر على أي مدخل داخل اللوحات لتصفية الزوار والمشاهدات والرسوم البيانية حسبه.</li>
              </ol>
              <div className="pt-2">
                <Button
                  nativeButton={false}
                  render={<a href={dashboardUrl} target="_blank" rel="noopener noreferrer" />}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                >
                  <Link2 className="size-3.5" />
                  الانتقال مباشرة إلى Vercel Web Analytics
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
