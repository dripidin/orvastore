import { type NextRequest, NextResponse } from "next/server";

import { queryVercelAnalytics, resolveVercelAnalyticsRuntimeConfig } from "@/lib/analytics/vercel-server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

type VercelPeriod = "24h" | "7d" | "30d" | "90d";

const ALLOWED_FILTER_DIMENSIONS = new Set([
  "country",
  "deviceType",
  "requestPath",
  "referrerHostname",
  "osName",
  "browserName",
]);

interface AggregateDimensionRow {
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

function resolveDateRange(period: VercelPeriod): { since: string; until: string; timeDimension: "hour" | "day" } {
  const now = new Date();
  const msMap: Record<VercelPeriod, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  const since = new Date(now.getTime() - msMap[period]).toISOString();
  return {
    since,
    until: now.toISOString(),
    timeDimension: period === "24h" ? "hour" : "day",
  };
}

function buildODataFilter(filterKey: string | null, filterValue: string | null): string | undefined {
  if (!filterKey || !filterValue || !ALLOWED_FILTER_DIMENSIONS.has(filterKey)) {
    return undefined;
  }
  const sanitized = filterValue.trim().slice(0, 200).replace(/'/g, "''");
  if (!sanitized) return undefined;
  return `${filterKey} eq '${sanitized}'`;
}

function normalizeDimensionRows(
  rows: Array<Record<string, unknown>> | undefined,
  dimensionKey: string,
): AggregateDimensionRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const totalVisitors = rows.reduce((sum, row) => sum + Number(row.visitors || 0), 0);

  return rows
    .map((row) => {
      const rawLabel = row[dimensionKey];
      const label =
        rawLabel === null || rawLabel === undefined || String(rawLabel).trim() === ""
          ? "(مباشر / غير محدد)"
          : String(rawLabel);
      const visitors = Number(row.visitors || 0);
      const pageviews = Number(row.pageviews || 0);
      const percent = totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0;
      return { label, visitors, pageviews, percent };
    })
    .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews);
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPeriod = searchParams.get("period");
  const period: VercelPeriod =
    rawPeriod === "24h" || rawPeriod === "7d" || rawPeriod === "30d" || rawPeriod === "90d" ? rawPeriod : "7d";
  const filterKey = searchParams.get("filterKey");
  const filterValue = searchParams.get("filterValue");
  const odataFilter = buildODataFilter(filterKey, filterValue);

  const runtime = await resolveVercelAnalyticsRuntimeConfig();
  const { project, dashboardUrl, token, enabled } = runtime;

  const basePayload = {
    success: true,
    provider: "vercel-web-analytics" as const,
    sdkPackage: "@vercel/analytics/next" as const,
    rootLayoutActive: true,
    vercelTokenConfigured: Boolean(token),
    period,
    activeFilter: odataFilter && filterKey && filterValue ? { key: filterKey, value: filterValue } : null,
    project,
    dashboardUrl,
  };

  if (!token || !enabled) {
    return NextResponse.json({
      ...basePayload,
      connected: false,
      reason: !enabled ? "vercel_analytics_disabled" : "missing_vercel_token",
      message: !enabled
        ? "تم إيقاف سحب إحصائيات Vercel من إعدادات لوحة التحكم."
        : "الحزمة @vercel/analytics/next مفعّلة في الموقع. لعرض إحصائيات Vercel مباشرة داخل اللوحة أضف VERCEL_TOKEN من إعدادات التكامل أو متغيرات Vercel.",
      syncedAt: null,
      summary: null,
      timeseries: [],
      panels: {
        pages: [],
        referrers: [],
        countries: [],
        os: [],
        devices: [],
        browsers: [],
        events: [],
      },
    });
  }

  const { since, until, timeDimension } = resolveDateRange(period);
  const commonParams = {
    projectId: project.projectId,
    teamId: project.teamId,
    since,
    until,
    ...(odataFilter ? { filter: odataFilter } : {}),
  };

  try {
    const [countRes, timeRes, pagesRes, referrersRes, countriesRes, osRes, devicesRes, browsersRes, eventsRes] =
      await Promise.all([
        queryVercelAnalytics<{ visitors?: number; pageviews?: number }>("visits/count", token, commonParams),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: [timeDimension],
          limit: "90",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["requestPath"],
          limit: "50",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["referrerHostname"],
          limit: "50",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["country"],
          limit: "50",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["osName"],
          limit: "25",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["deviceType"],
          limit: "25",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("visits/aggregate", token, {
          ...commonParams,
          by: ["browserName"],
          limit: "25",
        }),
        queryVercelAnalytics<Array<Record<string, unknown>>>("events/aggregate", token, {
          ...commonParams,
          by: ["eventName"],
          limit: "25",
        }),
      ]);

    if (!countRes.ok) {
      return NextResponse.json({
        ...basePayload,
        connected: false,
        reason: countRes.status === 401 || countRes.status === 403 ? "vercel_api_unauthorized" : "vercel_api_error",
        message: countRes.error,
        syncedAt: null,
        summary: null,
        timeseries: [],
        panels: {
          pages: [],
          referrers: [],
          countries: [],
          os: [],
          devices: [],
          browsers: [],
          events: [],
        },
      });
    }

    const visitors = Number(countRes.data?.visitors || 0);
    const pageviews = Number(countRes.data?.pageviews || 0);
    const pagesPerVisit = visitors > 0 ? Number((pageviews / visitors).toFixed(2)) : 0;

    const timeseries: TimeseriesPoint[] =
      timeRes.ok && Array.isArray(timeRes.data)
        ? timeRes.data.map((row) => {
            const rawTs = String(row.timestamp ?? row[timeDimension] ?? "");
            let bucket = rawTs;
            if (rawTs) {
              bucket = timeDimension === "hour" ? rawTs.slice(11, 16) || rawTs : rawTs.slice(0, 10);
            }
            return {
              bucket,
              visitors: Number(row.visitors || 0),
              pageviews: Number(row.pageviews || 0),
            };
          })
        : [];

    const customEventsPlanRequired = !eventsRes.ok && eventsRes.status === 402;
    const events: AggregateDimensionRow[] =
      eventsRes.ok && Array.isArray(eventsRes.data)
        ? eventsRes.data.map((row) => ({
            label: String(row.eventName || "Custom Event"),
            visitors: Number(row.visitors || 0),
            pageviews: Number(row.count || row.events || row.pageviews || 0),
            percent: 0,
          }))
        : [];

    return NextResponse.json({
      ...basePayload,
      connected: true,
      customEventsPlanRequired,
      syncedAt: new Date().toISOString(),
      summary: {
        visitors,
        pageviews,
        pagesPerVisit,
        customEventsTotal: events.reduce((acc, item) => acc + item.pageviews, 0),
      },
      timeseries,
      panels: {
        pages: pagesRes.ok ? normalizeDimensionRows(pagesRes.data, "requestPath") : [],
        referrers: referrersRes.ok ? normalizeDimensionRows(referrersRes.data, "referrerHostname") : [],
        countries: countriesRes.ok ? normalizeDimensionRows(countriesRes.data, "country") : [],
        os: osRes.ok ? normalizeDimensionRows(osRes.data, "osName") : [],
        devices: devicesRes.ok ? normalizeDimensionRows(devicesRes.data, "deviceType") : [],
        browsers: browsersRes.ok ? normalizeDimensionRows(browsersRes.data, "browserName") : [],
        events,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to query Vercel Web Analytics API";
    return NextResponse.json({
      ...basePayload,
      connected: false,
      reason: "vercel_fetch_failed",
      message,
      syncedAt: null,
      summary: null,
      timeseries: [],
      panels: {
        pages: [],
        referrers: [],
        countries: [],
        os: [],
        devices: [],
        browsers: [],
        events: [],
      },
    });
  }
}
