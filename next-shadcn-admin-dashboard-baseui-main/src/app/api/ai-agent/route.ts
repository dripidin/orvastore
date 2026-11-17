import { type NextRequest, NextResponse } from "next/server";

import { getAdminSettingsAction } from "@/app/actions/settings";
import { runOrvaGeminiAgentQuery } from "@/lib/ai/store-ai-context";
import { verifyAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized: Admin session required" }, { status: 401 });
  }

  const settings = await getAdminSettingsAction();
  const result = await runOrvaGeminiAgentQuery({
    userMessage:
      "أعطني التقرير الأخير لعدد الطلبيات وتوزيع حالاتها مع التقرير العام لأداء المتجر والمبيعات وأهم المنتجات.",
  });

  return NextResponse.json({
    success: true,
    enabled: settings.geminiAi.enabled,
    agentName: result.agentName,
    projectName: result.projectName,
    projectNumber: result.projectNumber,
    model: result.model,
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
          error: "وكيل Orva Agent AI متوقف حالياً من إعدادات لوحة التحكم.",
        },
        { status: 403 },
      );
    }

    const result = await runOrvaGeminiAgentQuery({
      userMessage,
      history: Array.isArray(body.history) ? body.history : [],
    });

    return NextResponse.json({
      success: true,
      reply: result.reply,
      matchedOrders: result.matchedOrders,
      snapshot: result.snapshot,
      agentName: result.agentName,
      projectName: result.projectName,
      projectNumber: result.projectNumber,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر معالجة طلب Orva Agent AI.";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
