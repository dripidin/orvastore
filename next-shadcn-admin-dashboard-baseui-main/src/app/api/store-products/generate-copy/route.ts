import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getAdminSettingsAction } from "@/app/actions/settings";
import { DEFAULT_SUPABASE_URL } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
type GeneratedCopy = { title: string; subtitle: string; description: string; highlights: string[] };

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await getAdminSettingsAction();
    if (!settings.geminiAi.enabled || !settings.geminiAi.apiKey) return NextResponse.json({ success: false, error: "فعّل Orva Agent AI وأضف مفتاح Gemini من الإعدادات أولاً." }, { status: 424 });
    const body = await request.json() as { brief?: string; images?: string[] };
    const brief = (body.brief ?? "").trim();
    if (!brief) return NextResponse.json({ success: false, error: "اكتب وصفاً مختصراً للمنتج قبل التوليد." }, { status: 400 });
    const parts: Array<Record<string, unknown>> = [{ text: `حلل صور المنتج مع الوصف التالي، واكتب بيانات متجر عربية دقيقة بدون اختلاق مواصفات غير ظاهرة. أخرج JSON فقط بالشكل {title,subtitle,description,highlights:string[]}. اجعل الوصف عملياً ومناسباً لأدوات الورش في الجزائر، ولا تضف السعر. الوصف الأولي: ${brief}` }];
    const expectedHost = new URL(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL).host;
    for (const image of (body.images ?? []).slice(0, 4)) {
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
      if (match && match[2].length <= 5_600_000) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        continue;
      }
      try {
        const imageUrl = new URL(image);
        if (imageUrl.protocol !== "https:" || imageUrl.host !== expectedHost || !imageUrl.pathname.includes("/storage/v1/object/public/product-images/")) continue;
        const imageResponse = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "";
        const bytes = Buffer.from(await imageResponse.arrayBuffer());
        if (imageResponse.ok && ["image/jpeg", "image/png", "image/webp"].includes(mimeType) && bytes.length <= 4 * 1024 * 1024) {
          parts.push({ inlineData: { mimeType, data: bytes.toString("base64") } });
        }
      } catch { /* Ignore images that are not supported by the configured image store. */ }
    }
    const model = settings.geminiAi.model && settings.geminiAi.model !== "auto" ? settings.geminiAi.model : "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": settings.geminiAi.apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.35, maxOutputTokens: 1600, responseMimeType: "application/json" } }),
      cache: "no-store", signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || `Gemini returned HTTP ${response.status}`);
    const raw = result.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!raw) throw new Error("لم يرجع الوكيل بيانات المنتج.");
    const generated = JSON.parse(raw) as GeneratedCopy;
    if (!generated.title || !generated.description || !Array.isArray(generated.highlights)) throw new Error("البيانات المولّدة غير مكتملة.");
    return NextResponse.json({ success: true, data: generated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر توليد بيانات المنتج" }, { status: 502 });
  }
}
