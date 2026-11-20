/**
 * ORVA Store — TikTok Connection, OAuth Initiation & Opt-In Telegram Alert Route (Phase B + C)
 * Endpoint: /api/integrations/tiktok/connect/
 *
 * - GET:  Returns server configuration readiness, sanitized PublicTikTokConnectionDto (zero tokens),
 *         and independent opt-in TikTok Telegram alert status (zero bot token / chat ID exposure).
 * - POST: { action: "start" }                          -> generates signed CSRF state, sets HttpOnly cookie, returns auth URL.
 *         { action: "disconnect" }                     -> revokes upstream token (best-effort) & purges local DB tokens.
 *         { action: "set_telegram_opt_in", enabled }   -> toggles independent site_settings.integrations.tiktok.telegram_alerts_enabled
 *                                                         (never modifies checkout Telegram settings; 409 if env-locked).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  buildTikTokAuthorizationUrl,
  disconnectTikTokAccount,
  getTikTokConfigurationReadiness,
} from "@/lib/integrations/tiktok/oauth";
import { TikTokTokenManager } from "@/lib/integrations/tiktok/token-manager";
import { DEFAULT_ORVA_STORE_ID, TikTokApiError } from "@/lib/integrations/tiktok/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  clearOAuthStateCookie,
  jsonNoStore,
  mapTikTokErrorToResponse,
  parseValidatedJsonBody,
  requireAdminRouteSession,
  setOAuthStateCookie,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

interface PublicTikTokTelegramOptInStatus {
  enabled: boolean;
  source: "env" | "site_settings" | "default";
  envLocked: boolean;
  existingTelegramConfigured: boolean;
}

const connectPostBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z
    .object({
      action: z.literal("set_telegram_opt_in"),
      enabled: z.boolean(),
    })
    .strict(),
]);

function readEnvTelegramOptIn(): { locked: boolean; value: boolean | null } {
  const raw = (process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED || "").trim().toLowerCase();
  if (raw === "true" || raw === "1") return { locked: true, value: true };
  if (raw === "false" || raw === "0") return { locked: true, value: false };
  return { locked: false, value: null };
}

async function resolveTelegramOptInStatus(): Promise<PublicTikTokTelegramOptInStatus> {
  const envState = readEnvTelegramOptIn();
  const envHasTelegram = Boolean(
    (process.env.TELEGRAM_BOT_TOKEN || "").trim() && (process.env.TELEGRAM_CHAT_ID || "").trim(),
  );

  let dbOptIn: boolean | undefined;
  let dbHasTelegram = false;

  try {
    const db = getSupabaseServerClient() as any;
    const { data } = await db
      .from("site_settings")
      .select("integrations, telegram_bot_token, telegram_chat_id")
      .eq("id", 1)
      .maybeSingle();

    if (data && typeof data === "object") {
      const integrations =
        data.integrations && typeof data.integrations === "object"
          ? (data.integrations as Record<string, any>)
          : {};

      if (typeof integrations.tiktok?.telegram_alerts_enabled === "boolean") {
        dbOptIn = integrations.tiktok.telegram_alerts_enabled;
      }

      const botToken = String(data.telegram_bot_token || integrations.telegram?.bot_token || "").trim();
      const chatId = String(data.telegram_chat_id || integrations.telegram?.chat_id || "").trim();
      dbHasTelegram = Boolean(botToken && chatId);
    }
  } catch {
    // Fail closed: never break connection status if site_settings isn't initialized yet
  }

  const existingTelegramConfigured = envHasTelegram || dbHasTelegram;

  if (envState.locked && envState.value !== null) {
    return {
      enabled: envState.value,
      source: "env",
      envLocked: true,
      existingTelegramConfigured,
    };
  }

  if (typeof dbOptIn === "boolean") {
    return {
      enabled: dbOptIn,
      source: "site_settings",
      envLocked: false,
      existingTelegramConfigured,
    };
  }

  return {
    enabled: false,
    source: "default",
    envLocked: false,
    existingTelegramConfigured,
  };
}

async function persistTelegramOptInSetting(enabled: boolean): Promise<PublicTikTokTelegramOptInStatus> {
  let db: any;
  try {
    db = getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok notification preferences.",
      cause: err,
    });
  }

  const { data: existingRow, error: readErr } = await db
    .from("site_settings")
    .select("id, integrations")
    .eq("id", 1)
    .maybeSingle();

  if (readErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to read site_settings: ${readErr.message}`,
      cause: readErr,
    });
  }

  const currentIntegrations =
    existingRow?.integrations && typeof existingRow.integrations === "object"
      ? (existingRow.integrations as Record<string, unknown>)
      : {};

  const currentTikTok =
    currentIntegrations.tiktok && typeof currentIntegrations.tiktok === "object"
      ? (currentIntegrations.tiktok as Record<string, unknown>)
      : {};

  const nowIso = new Date().toISOString();
  const nextIntegrations: Record<string, unknown> = {
    ...currentIntegrations,
    tiktok: {
      ...currentTikTok,
      telegram_alerts_enabled: Boolean(enabled),
      updated_at: nowIso,
    },
  };

  if (existingRow) {
    const { error: updateErr } = await db
      .from("site_settings")
      .update({
        integrations: nextIntegrations,
        updated_at: nowIso,
      })
      .eq("id", 1);

    if (updateErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to update TikTok Telegram opt-in setting: ${updateErr.message}`,
        cause: updateErr,
      });
    }
  } else {
    const { error: upsertErr } = await db
      .from("site_settings")
      .upsert(
        {
          id: 1,
          integrations: nextIntegrations,
          updated_at: nowIso,
        },
        { onConflict: "id" },
      );

    if (upsertErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to persist TikTok Telegram opt-in setting: ${upsertErr.message}`,
        cause: upsertErr,
      });
    }
  }

  return await resolveTelegramOptInStatus();
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  try {
    const readiness = getTikTokConfigurationReadiness();
    const tokenManager = new TikTokTokenManager();
    const [connection, telegramOptIn] = await Promise.all([
      tokenManager.getPublicConnection(DEFAULT_ORVA_STORE_ID),
      resolveTelegramOptInStatus(),
    ]);

    return jsonNoStore({
      success: true,
      readiness,
      connection,
      telegramOptIn,
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/connect GET");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseValidatedJsonBody(request, connectPostBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    if (parsed.data.action === "start") {
      const { authorizationUrl, state, expiresAt, redirectUri } = buildTikTokAuthorizationUrl({
        storeId: DEFAULT_ORVA_STORE_ID,
        actor: auth.session.sub,
      });

      const response = jsonNoStore({
        success: true,
        authorizationUrl,
        expiresAt,
        redirectUri,
      });
      setOAuthStateCookie(response, state);
      return response;
    }

    if (parsed.data.action === "set_telegram_opt_in") {
      const envState = readEnvTelegramOptIn();
      if (envState.locked) {
        const current = await resolveTelegramOptInStatus();
        return jsonNoStore(
          {
            success: false,
            error:
              "TikTok Telegram alerts opt-in is locked by server environment variable TIKTOK_TELEGRAM_ALERTS_ENABLED.",
            code: "TELEGRAM_OPT_IN_ENV_LOCKED",
            telegramOptIn: current,
          },
          409,
        );
      }

      const telegramOptIn = await persistTelegramOptInSetting(parsed.data.enabled);
      return jsonNoStore({
        success: true,
        telegramOptIn,
      });
    }

    // action === "disconnect"
    const result = await disconnectTikTokAccount({
      storeId: DEFAULT_ORVA_STORE_ID,
    });

    const response = jsonNoStore({
      success: true,
      disconnected: result.disconnected,
      upstreamRevoked: result.upstreamRevoked,
    });
    clearOAuthStateCookie(response);
    return response;
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/connect POST");
  }
}
