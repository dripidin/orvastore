import { NextRequest, NextResponse } from "next/server";
import { adminListProducts } from "@/lib/catalog/server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getAdminSettingsAction } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await getAdminSettingsAction();
    if (!settings.geminiAi.enabled || !settings.geminiAi.apiKey) {
      return NextResponse.json({ success: false, error: "فعّل Orva Agent AI وأضف مفتاح Gemini من الإعدادات أولاً." }, { status: 424 });
    }
    const products = await adminListProducts();
    const catalog = products.map((p) => ({ sku: p.sku, title: p.title, description: p.description || p.subtitle, status: p.status, stock: p.stockQuantity }));
    const model = settings.geminiAi.model && settings.geminiAi.model !== "auto" ? settings.geminiAi.model : "gemini-2.5-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": settings.geminiAi.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "أنت مساعد تصنيف منتجات متجر جزائري لأدوات الورش والسيارات. اقترح شجرة تصنيفات عربية عملية، وصنّف كل منتج مرة واحدة. استعمل فقط معلومات المنتجات. أخرج JSON صالحاً فقط بالشكل {categories:[{name:string,subcategories:string[]}],assignments:[{sku:string,category:string,subcategory:string|null}]}. أنشئ فئات فرعية عند الحاجة فقط. لا تستبعد المنتجات غير النشطة." }] },
        contents: [{ role: "user", parts: [{ text: `اقترح مخطط تصنيفات كامل للكتالوج التالي، بما فيه المنتجات النشطة والمسودات والمؤرشفة.\n${JSON.stringify(catalog)}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4000, responseMimeType: "application/json" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message || `Gemini returned HTTP ${response.status}`);
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!raw) throw new Error("لم يرجع الوكيل مخططاً قابلاً للقراءة.");
    const plan = JSON.parse(raw) as { categories?: Array<{ name: string; subcategories?: string[] }>; assignments?: Array<{ sku: string; category: string; subcategory?: string | null }> };
    if (!Array.isArray(plan.categories) || !Array.isArray(plan.assignments)) throw new Error("صيغة المخطط غير مكتملة.");
    return NextResponse.json({ success: true, data: { categories: plan.categories, assignments: plan.assignments, productCount: products.length } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر إعداد مخطط التصنيفات" }, { status: 502 });
  }
}
