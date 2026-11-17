import { type NextRequest, NextResponse } from "next/server";

import { getAdminSettingsAction } from "@/app/actions/settings";
import {
  formatGeminiUserErrorMessage,
  probeOrvaGeminiConnection,
  runOrvaGeminiAgentQuery,
} from "@/lib/ai/store-ai-context";
import { verifyAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode");
  if (mode === "status" || mode === "probe") {
    const probe = await probeOrvaGeminiConnection({ forceLiveCheck: mode === "probe" });
    return NextResponse.json({
      success: true,
      ...probe,
      disconnected: probe.configured && probe.enabled ? !probe.connected : false,
      error: !probe.connected ? formatGeminiUserErrorMessage(probe.errorCode, probe.apiError) : undefined,
    });
  }

  const settings = await getAdminSettingsAction();
  const result = await runOrvaGeminiAgentQuery({
    userMessage:
      "أعطني التقرير الأخير لعدد الطلبيات وتوزيع حالاتها مع التقرير العام لأداء المتجر والمبيعات وأهم المنتجات.",
  });

  if (!result.ok) {
    const status = result.errorCode === "MISSING_API_KEY" ? 424 : 503;
    return NextResponse.json(
      {
        success: false,
        disconnected: true,
        enabled: settings.geminiAi.enabled,
        errorCode: result.errorCode,
        error: formatGeminiUserErrorMessage(result.errorCode, result.apiError),
        apiError: result.apiError,
        attemptedModels: result.attemptedModels,
        agentName: result.agentName,
        projectName: result.projectName,
        projectNumber: result.projectNumber,
      },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    enabled: settings.geminiAi.enabled,
    agentName: result.agentName,
    projectName: result.projectName,
    projectNumber: result.projectNumber,
    model: result.model,
    requestedModel: result.requestedModel,
    latencyMs: result.latencyMs,
    snapshot: result.snapshot,
    initialReport: result.reply,
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      message?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };

    const userMessage = (body.message ?? "").trim();
    if (!userMessage) {
      return NextResponse.json({ success: false, error: "يرجى كتابة رسالة أو سؤال للوكيل." }, { status: 400 });
    }

    const settings = await getAdminSettingsAction();
    if (!settings.geminiAi.enabled) {
      return NextResponse.json(
        {
          success: false,
          disconnected: true,
          errorCode: "GEMINI_DISABLED",
          error: "وكيل Orva Agent AI متوقف حالياً من إعدادات لوحة التحكم.",
        },
        { status: 403 },
      );
    }

    const result = await runOrvaGeminiAgentQuery({
      userMessage,
      history: Array.isArray(body.history) ? body.history : [],
    });

    if (!result.ok) {
      const httpStatus = result.errorCode === "MISSING_API_KEY" ? 424 : 503;
      return NextResponse.json(
        {
          success: false,
          disconnected: true,
          errorCode: result.errorCode,
          error: formatGeminiUserErrorMessage(result.errorCode, result.apiError),
          apiError: result.apiError,
          attemptedModels: result.attemptedModels,
          agentName: result.agentName,
          projectName: result.projectName,
          projectNumber: result.projectNumber,
          requestedModel: result.requestedModel,
          latencyMs: result.latencyMs,
        },
        { status: httpStatus },
      );
    }

    return NextResponse.json({
      success: true,
      disconnected: false,
      reply: result.reply,
      matchedOrders: result.matchedOrders,
      snapshot: result.snapshot,
      agentName: result.agentName,
      projectName: result.projectName,
      projectNumber: result.projectNumber,
      model: result.model,
      requestedModel: result.requestedModel,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر معالجة طلب Orva Agent AI.";
    return NextResponse.json(
      {
        success: false,
        disconnected: true,
        error: `تم إيقاف الدردشة مؤقتاً: ${msg}`,
      },
      { status: 500 },
    );
  }
}
