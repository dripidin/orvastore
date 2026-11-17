import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";

import fs from "node:fs";
import path from "node:path";

type VercelPeriod = "24h" | "7d" | "30d" | "90d";

const ALLOWED_FILTER_DIMENSIONS = new Set([
  "country",
  "deviceType",
  "requestPath",
  "referrerHostname",
  "osName",
  "browserName",
]);

interface VercelProjectConfig {
  projectId: string;
  teamId: string;
  projectName: string;
}

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

function readVercelProjectConfig(): VercelProjectConfig {
  let projectId = process.env.VERCEL_PROJECT_ID || "prj_QO9oV9rX9En9UgVZeLD6xa8X7m7t";
  let teamId = process.env.VERCEL_TEAM_ID || "team_Csxw1YZzzCNQeQgJXApoZekM";
  let projectName = process.env.VERCEL_PROJECT_NAME || "orvastore";

  try {
    const configPath = path.join(process.cwd(), ".vercel", "project.json");
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        projectId?: string;
        orgId?: string;
        projectName?: string;
      };
      if (parsed.projectId) projectId = parsed.projectId;
      if (parsed.orgId) teamId = parsed.orgId;
      if (parsed.projectName) projectName = parsed.projectName;
    }
  } catch {
    // Fallback to environment or default workspace project identifiers
  }

  return { projectId, teamId, projectName };
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

async function queryVercelAnalytics<T>(
  endpoint: string,
  token: string,
  params: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = new URL(`https://api.vercel.com/v1/query/web-analytics/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let errorMsg = `Vercel API error (${res.status})`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      }
    } catch {
      // ignore non-json error bodies
    }
    return { ok: false, status: res.status, error: errorMsg };
  }

  const json = (await res.json()) as { data?: T };
  return { ok: true, data: json.data as T };
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

  const project = readVercelProjectConfig();
  const dashboardUrl = `https://vercel.com/dripalpha/${project.projectName}/analytics`;
  const token = (process.env.VERCEL_TOKEN || process.env.VERCEL_ACCESS_TOKEN || "").trim();

  const basePayload = {
    success: true,
    provider: "vercel-web-analytics" as const,
    sdkPackage: "@vercel/analytics/next" as const,
    rootLayoutActive: true,
    period,
    activeFilter: odataFilter && filterKey && filterValue ? { key: filterKey, value: filterValue } : null,
    project,
    dashboardUrl,
  };

  if (!token) {
    return NextResponse.json({
      ...basePayload,
      connected: false,
      reason: "missing_vercel_token",
      message:
        "الحزمة @vercel/analytics/next مفعّلة في الموقع. لعرض إحصائيات Vercel مباشرة داخل اللوحة أضف متغير البيئة VERCEL_TOKEN، أو افتح لوحة Vercel Web Analytics مباشرة.",
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
