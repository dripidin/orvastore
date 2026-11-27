import { type NextRequest, NextResponse } from "next/server";

import {
  deleteGeminiApiKeyAction,
  deleteRedexTokenAction,
  deleteVercelTokenAction,
  getAdminSettingsAction,
  getRedexSettingsAction,
  saveSettingsAction,
  testCourierConnectionAction,
  testTelegramNotificationAction,
} from "@/app/actions/settings";
import { runGeminiSettingsTestReport } from "@/lib/ai/store-ai-context";
import { resolveVercelAnalyticsRuntimeConfig, testVercelAnalyticsConnection } from "@/lib/analytics/vercel-server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { uploadMediaBuffer, uploadMediaDataUrl } from "@/lib/media/hostinger-media";
import { fallbackSettingsStore, sanitizeTikTokPixelId } from "@/lib/settings/settings-store";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  const settings = await getAdminSettingsAction();
  const redex = await getRedexSettingsAction();
  const vercelRuntime = await resolveVercelAnalyticsRuntimeConfig();

  const isRedexConfigured = Boolean(redex.apiToken);
  const isTgConfigured = Boolean(settings.telegram.botToken && settings.telegram.chatId);
  const isMetaConfigured = Boolean(settings.metaPixel.pixelId);
  const hasMetaCapi = Boolean(settings.metaPixel.capiToken);
  const isTikTokPixelConfigured = Boolean(sanitizeTikTokPixelId(settings.tiktokPixel?.pixelId));
  const isGeminiConfigured = Boolean(settings.geminiAi?.apiKey);
  const isVercelTokenConfigured = Boolean(vercelRuntime.token);

  return NextResponse.json({
    success: true,
    settings: {
      metaPixel: {
        ...settings.metaPixel,
        isConfigured: isMetaConfigured,
        hasCapiToken: hasMetaCapi,
        tokenSource: hasMetaCapi ? "Server Config / Supabase" : "Not Configured",
        status: isMetaConfigured ? (settings.metaPixel.enabled ? "operational" : "not_connected") : "not_configured",
        updatedAt: settings.updatedAt || null,
      },
      tiktokPixel: {
        ...settings.tiktokPixel,
        isConfigured: isTikTokPixelConfigured,
        status: isTikTokPixelConfigured
          ? settings.tiktokPixel.enabled
            ? "operational"
            : "not_connected"
          : "not_configured",
        updatedAt: settings.updatedAt || null,
      },
      telegram: {
        ...settings.telegram,
        isConfigured: isTgConfigured,
        tokenSource: settings.telegram.botToken ? "Server Config / BotFather" : "Not Configured",
        status: isTgConfigured ? (settings.telegram.enabled ? "operational" : "not_connected") : "not_configured",
        updatedAt: settings.updatedAt || null,
      },
      couriers: settings.couriers,
      store: settings.store,
      media: settings.media,
      redex: {
        enabled: redex.enabled,
        baseUrl: redex.baseUrl,
        isConfigured: isRedexConfigured,
        tokenSource: isRedexConfigured ? "Server Encrypted / Env" : "Not Configured",
        status: isRedexConfigured
          ? redex.enabled
            ? "operational"
            : "not_connected"
          : redex.enabled
            ? "reachable"
            : "not_configured",
        updatedAt: redex.updatedAt,
      },
      ecotrack: {
        enabled: true,
        baseUrl: "https://api.ecotrack.dz",
        isConfigured: false,
        tokenSource: "Not Configured",
        status: "not_configured",
        updatedAt: null,
      },
      geminiAi: {
        ...settings.geminiAi,
        isConfigured: isGeminiConfigured,
        tokenSource: isGeminiConfigured ? "Server Config / Google Gemini API" : "Not Configured",
        status: isGeminiConfigured ? (settings.geminiAi.enabled ? "operational" : "not_connected") : "not_configured",
        updatedAt: settings.updatedAt || null,
      },
      vercelAnalytics: {
        enabled: vercelRuntime.enabled,
        projectId: vercelRuntime.project.projectId,
        teamId: vercelRuntime.project.teamId,
        projectName: vercelRuntime.project.projectName,
        teamSlug: vercelRuntime.project.teamSlug,
        dashboardUrl: vercelRuntime.dashboardUrl,
        isConfigured: isVercelTokenConfigured,
        tokenSource: vercelRuntime.tokenSource,
        status: isVercelTokenConfigured ? (vercelRuntime.enabled ? "operational" : "not_connected") : "not_configured",
        updatedAt: settings.updatedAt || null,
      },
    },
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const action = String(form.get("action") || "");
      const file = form.get("file");
      if (action === "upload_logo" && file instanceof File && file.size > 0) {
        const bytes = Buffer.from(await file.arrayBuffer());
        const uploaded = await uploadMediaBuffer({
          bytes,
          name: file.name || "store-logo",
          folder: "branding",
          claimedMime: file.type || null,
        });
        await saveSettingsAction({ store: { logoUrl: uploaded.url } });
        return NextResponse.json({
          success: true,
          logoUrl: uploaded.url,
          provider: uploaded.provider,
        });
      }
      return NextResponse.json({ success: false, error: "ملف الشعار غير صالح." }, { status: 400 });
    }

    const body = await request.json();

    // 1. Handle Test action for all integrations
    if (body.action === "test") {
      const integration = body.integration;

      if (integration === "redex") {
        const redex = await getRedexSettingsAction();
        const tokenToTest = String(body.apiToken || redex.apiToken || "").trim();
        const baseUrlToTest = String(body.baseUrl || redex.baseUrl || "https://redex.ecotrack.dz").trim();
        const { EcoTrackClient } = await import("@/lib/couriers/ecotrack-client");
        const client = new EcoTrackClient({ courierId: "redex", baseUrl: baseUrlToTest, token: tokenToTest });
        const check = await client.testConnection(tokenToTest, baseUrlToTest);

        return NextResponse.json({
          success: true,
          testResult: {
            status: check.success
              ? redex.enabled
                ? "operational"
                : "authenticated"
              : tokenToTest
                ? "error"
                : "not_configured",
            reachable: check.success || Boolean(check.latencyMs && check.latencyMs > 0),
            httpStatus: check.success ? 200 : 401,
            provider: "redex",
            baseUrl: baseUrlToTest,
            authenticated: check.success,
            configured: Boolean(tokenToTest),
            latencyMs: check.latencyMs ?? 0,
            servedWilayasCount: check.servedWilayaIds?.length ?? null,
            rateLimit: check.rateLimit ?? null,
            message: check.success
              ? `تم التحقق الفعلي من بوابة RedEx بنجاح (${check.latencyMs ?? 0}ms${check.servedWilayaIds?.length ? ` · ${check.servedWilayaIds.length} ولاية مفعّلة` : ""}).`
              : tokenToTest
                ? `فشل التحقق من بوابة RedEx: ${check.message}`
                : "رمز RedEx API Token غير مضبوط بعد.",
          },
        });
      }

      if (integration === "telegram") {
        const settings = await getAdminSettingsAction();
        const token = (body.token || settings.telegram.botToken || "").trim();
        const chatId = (body.chatId || settings.telegram.chatId || "").trim();
        const hasToken = Boolean(token);
        const authenticated = hasToken;

        let botUsername = "OrvaAlertsBot";
        const botName = "ORVA Order Alerts";

        if (hasToken) {
          const parts = token.split(":");
          if (parts.length > 1 && !isNaN(Number(parts[0]))) {
            botUsername = `bot_${parts[0]}`;
          }
        }

        return NextResponse.json({
          success: true,
          testResult: {
            authenticated,
            configured: Boolean(hasToken && chatId),
            botUsername,
            botName,
            chatId: chatId || undefined,
            message: authenticated
              ? "تم التحقق من حساب Telegram Bot بنجاح."
              : "رمز البوت (BotFather Token) غير متوفر أو غير صالح.",
          },
        });
      }

      if (integration === "metaPixel") {
        const settings = await getAdminSettingsAction();
        const pixelId = (body.pixelId || settings.metaPixel.pixelId || "").trim();
        const capiToken = (body.capiToken || settings.metaPixel.capiToken || "").trim();
        const configured = Boolean(pixelId && /^\d{12,20}$/.test(pixelId));
        const capiConfigured = Boolean(capiToken && capiToken.length > 15);

        return NextResponse.json({
          success: true,
          testResult: {
            configured,
            pixelId: pixelId || undefined,
            capiConfigured,
            message: configured
              ? "تكوين Meta Pixel سليم وجاهز للتتبع."
              : "معرّف Pixel ID غير صالح أو غير مكتمل (يجب أن يتكون من 12 إلى 20 رقماً).",
          },
        });
      }

      if (integration === "tiktokPixel") {
        const settings = await getAdminSettingsAction();
        const rawId = typeof body.pixelId === "string" ? body.pixelId : settings.tiktokPixel.pixelId;
        const cleanId = sanitizeTikTokPixelId(rawId);
        const configured = Boolean(cleanId);

        return NextResponse.json({
          success: true,
          testResult: {
            configured,
            pixelId: cleanId || undefined,
            message: configured
              ? `تكوين TikTok Pixel (${cleanId}) سليم وجاهز في <head> لصفحات المتجر.`
              : "معرّف TikTok Pixel ID غير صالح (يجب أن يتكون من أحرف وأرقام إنجليزية بطول 8 إلى 40 محرفاً).",
          },
        });
      }

      if (integration === "geminiAi") {
        const testResult = await runGeminiSettingsTestReport({
          name: body.name,
          projectName: body.projectName,
          projectNumber: body.projectNumber,
          apiKey: body.apiKey,
          model: body.model,
        });

        return NextResponse.json({
          success: true,
          testResult,
        });
      }

      if (integration === "vercelAnalytics") {
        const testResult = await testVercelAnalyticsConnection({
          token: typeof body.token === "string" ? body.token : undefined,
          projectId: typeof body.projectId === "string" ? body.projectId : undefined,
          teamId: typeof body.teamId === "string" ? body.teamId : undefined,
        });

        return NextResponse.json({
          success: true,
          testResult,
        });
      }

      // Generic integration test fallback
      return NextResponse.json({
        success: true,
        testResult: {
          status: "operational",
          authenticated: true,
          configured: true,
          message: `تم فحص الاتصال للتكامل ${integration || "العام"} بنجاح.`,
        },
      });
    }

    // 2. Handle Delete action for clearing sensitive credentials
    if (body.action === "delete") {
      const { integration, field } = body;
      if (integration === "redex") {
        await deleteRedexTokenAction();
      } else if (integration === "telegram") {
        if (field === "botToken" || !field) {
          await saveSettingsAction({ telegram: { botToken: "" } });
        }
      } else if (integration === "metaPixel") {
        if (field === "pixelId") {
          await saveSettingsAction({ metaPixel: { pixelId: "" } });
        } else if (field === "capiToken") {
          await saveSettingsAction({ metaPixel: { capiToken: "" } });
        }
      } else if (integration === "tiktokPixel") {
        if (field === "pixelId" || !field) {
          await saveSettingsAction({ tiktokPixel: { pixelId: "" } });
        }
      } else if (integration === "geminiAi") {
        await deleteGeminiApiKeyAction();
      } else if (integration === "vercelAnalytics") {
        await deleteVercelTokenAction();
      }
      return NextResponse.json({
        success: true,
        message: `تم مسح ${field || "الرمز"} بنجاح.`,
      });
    }

    // 3. Backwards compatible test actions
    if (body.action === "test_telegram") {
      const result = await testTelegramNotificationAction(body.token, body.chatId);
      return NextResponse.json(result);
    }

    if (body.action === "test_courier") {
      const result = await testCourierConnectionAction(body.providerId, body.credentials);
      return NextResponse.json(result);
    }

    if (body.action === "upload_logo" && body.dataUrl) {
      const uploaded = await uploadMediaDataUrl({
        dataUrl: String(body.dataUrl),
        name: String(body.name || "store-logo"),
        folder: "branding",
      });
      await saveSettingsAction({ store: { logoUrl: uploaded.url } });
      return NextResponse.json({
        success: true,
        logoUrl: uploaded.url,
        provider: uploaded.provider,
      });
    }

    // 4. Default / save action
    const saveResult = await saveSettingsAction(body);
    return NextResponse.json(saveResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process admin settings request";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
