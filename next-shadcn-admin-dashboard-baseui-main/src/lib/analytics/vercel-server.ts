import { getAdminSettingsAction } from "@/app/actions/settings";

import fs from "node:fs";
import path from "node:path";

export interface VercelProjectConfig {
  projectId: string;
  teamId: string;
  teamSlug: string;
  projectName: string;
}

export function readVercelProjectConfig(overrides?: { projectId?: string; teamId?: string }): VercelProjectConfig {
  let projectId = (overrides?.projectId ?? process.env.VERCEL_PROJECT_ID ?? "prj_Zm7DPG2CymNdDKu0KxupUZdGp0rx").trim();
  let teamId = (overrides?.teamId ?? process.env.VERCEL_TEAM_ID ?? "team_cYT8gZkkTTbR60uqUXL6aRPH").trim();
  const teamSlug = (process.env.VERCEL_TEAM_SLUG ?? "dripidin2-1079").trim();
  let projectName = (process.env.VERCEL_PROJECT_NAME ?? "orvastore").trim();

  if (!overrides?.projectId || !overrides?.teamId) {
    try {
      const configPath = path.join(process.cwd(), ".vercel", "project.json");
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
          projectId?: string;
          orgId?: string;
          projectName?: string;
        };
        if (!overrides?.projectId && parsed.projectId) projectId = parsed.projectId;
        if (!overrides?.teamId && parsed.orgId) teamId = parsed.orgId;
        if (parsed.projectName) projectName = parsed.projectName;
      }
    } catch {
      // Fallback to env/default project context
    }
  }

  return { projectId, teamId, teamSlug, projectName };
}

function pickNonEmpty(...values: Array<string | undefined | null>): string {
  for (const val of values) {
    const trimmed = val?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export async function resolveVercelAnalyticsRuntimeConfig(overrides?: {
  token?: string;
  projectId?: string;
  teamId?: string;
}) {
  const settings = await getAdminSettingsAction();
  const envToken = pickNonEmpty(process.env.VERCEL_TOKEN, process.env.VERCEL_ACCESS_TOKEN);
  const savedToken = settings.vercelAnalytics.token.trim();
  const token = pickNonEmpty(overrides?.token, envToken, savedToken);

  let tokenSource = "Not Configured";
  if (envToken) {
    tokenSource = "Server Environment (VERCEL_TOKEN)";
  } else if (savedToken) {
    tokenSource = "Supabase Admin Settings";
  }

  const project = readVercelProjectConfig({
    projectId: pickNonEmpty(overrides?.projectId, settings.vercelAnalytics.projectId) || undefined,
    teamId: pickNonEmpty(overrides?.teamId, settings.vercelAnalytics.teamId) || undefined,
  });

  return {
    enabled: settings.vercelAnalytics.enabled !== false,
    token,
    tokenSource,
    project,
    dashboardUrl: `https://vercel.com/${project.teamSlug}/${project.projectName}/analytics`,
  };
}

export async function queryVercelAnalytics<T>(
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
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    let errorMsg = `Vercel API error (${res.status})`;
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      }
    } catch {
      // Ignore non-JSON error payloads
    }
    return { ok: false, status: res.status, error: errorMsg };
  }

  const json = (await res.json()) as { data?: T };
  return { ok: true, data: json.data as T };
}

export async function testVercelAnalyticsConnection(overrides?: {
  token?: string;
  projectId?: string;
  teamId?: string;
}) {
  const startedAt = Date.now();
  const runtime = await resolveVercelAnalyticsRuntimeConfig(overrides);

  if (!runtime.token) {
    return {
      configured: false,
      authenticated: false,
      status: "not_configured",
      projectId: runtime.project.projectId,
      teamId: runtime.project.teamId,
      latencyMs: Date.now() - startedAt,
      message:
        "رمز VERCEL_TOKEN غير مدخل بعد. أنشئ رمزاً من vercel.com/account/tokens ثم احفظه هنا أو في متغيرات بيئة Vercel.",
    };
  }

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = await queryVercelAnalytics<{ visitors?: number; pageviews?: number }>("visits/count", runtime.token, {
    projectId: runtime.project.projectId,
    teamId: runtime.project.teamId,
    since,
    until: now.toISOString(),
  });

  if (!res.ok) {
    return {
      configured: true,
      authenticated: false,
      status: res.status === 401 || res.status === 403 ? "error" : "reachable",
      projectId: runtime.project.projectId,
      teamId: runtime.project.teamId,
      latencyMs: Date.now() - startedAt,
      message: `تعذّر سحب إحصائيات Vercel Web Analytics: ${res.error}`,
    };
  }

  const visitors = Number(res.data?.visitors || 0);
  const pageviews = Number(res.data?.pageviews || 0);
  return {
    configured: true,
    authenticated: true,
    status: "operational",
    projectId: runtime.project.projectId,
    teamId: runtime.project.teamId,
    visitors,
    pageviews,
    latencyMs: Date.now() - startedAt,
    message: `تم الاتصال بنجاح بـ Vercel Web Analytics للمشروع (${runtime.project.projectName}) — آخر 7 أيام: ${visitors} زائر و ${pageviews} مشاهدة.`,
  };
}
