import { type NextRequest, NextResponse } from "next/server";

import { getAdminSettingsAction } from "@/app/actions/settings";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminListProducts } from "@/lib/catalog/server";
import { CURATED_CATEGORY_ICONS, normalizeCategoryIconName } from "@/lib/categories/icon-registry";
import { adminListCategories } from "@/lib/categories/server";
import type { AiCategoryPlan } from "@/lib/categories/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const settings = await getAdminSettingsAction();
    if (!settings.geminiAi.enabled || !settings.geminiAi.apiKey) {
      return NextResponse.json(
        { success: false, error: "فعّل Orva Agent AI وأضف مفتاح Gemini من الإعدادات أولاً." },
        { status: 424 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: "all" | "uncategorized_only" | "reorganize";
      instructions?: string;
    };
    const mode =
      body.mode === "uncategorized_only" || body.mode === "reorganize" ? body.mode : "all";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 500) : "";

    const [products, categoryState] = await Promise.all([adminListProducts(), adminListCategories()]);
    const targetProducts =
      mode === "uncategorized_only" ? products.filter((p) => !p.categoryId) : products;

    if (targetProducts.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          summary: "كل المنتجات مصنفة حالياً ولا توجد منتجات بحاجة إلى اقتراح.",
          categories: [],
          assignments: [],
          productCount: 0,
        } satisfies AiCategoryPlan,
      });
    }

    const existingTree = categoryState.categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isSubcategory: Boolean(c.parent_id),
      parentName: c.parent_id
        ? categoryState.categories.find((p) => p.id === c.parent_id)?.name ?? null
        : null,
      iconName: c.icon_name,
      active: c.active,
    }));

    const catalog = targetProducts.map((p) => ({
      productId: p.id,
      sku: p.sku,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      status: p.status,
      priceDzd: p.sellingPrice,
      currentCategory: p.categoryPath ?? p.categoryName ?? null,
    }));

    const allowedIconChoices = CURATED_CATEGORY_ICONS.map((i) => i.name).join(", ");
    const model =
      settings.geminiAi.model && settings.geminiAi.model !== "auto"
        ? settings.geminiAi.model
        : "gemini-2.5-flash";

    const systemPrompt = [
      "أنت خبير تنظيم متاجر إلكترونية جزائرية لأدوات الورش والمعدات (CROWN, STARCLE PRO, إلخ).",
      "صمّم أو طوّر شجرة تصنيفات عربية احترافية واضحة (تصنيفات رئيسية وفروع عند الحاجة فقط بحد أقصى مستويين)، ووزّع كل منتج في القائمة إلى أنسب تصنيف مرة واحدة فقط.",
      `احترم التصنيفات الموجودة في المتجر وضع علامة isExisting=true لأي تصنيف موجود بالفعل تنصح بإبقائه أو إعادة استخدام اسمه الدقيق.`,
      `اختر لكل تصنيف رئيسي وفرعي iconName مناسب من هذه القائمة فقط: [${allowedIconChoices}].`,
      `أخرج JSON صالحاً فقط بالمخطط التالي:`,
      `{ "summary": string, "categories": [{ "name": string, "description": string, "iconName": string, "isExisting": boolean, "subcategories": [{ "name": string, "description": string, "iconName": string, "isExisting": boolean }] }], "assignments": [{ "sku": string, "productId": string, "category": string, "subcategory": string | null, "confidence": number, "reason": string }] }`,
      "استعمل فقط معلومات المنتجات الموجودة. نسبة الثقة confidence من 50 إلى 100. اشرح السبب باختصار بالعربية.",
    ].join("\n");

    const userPrompt = [
      `وضع التحليل: ${mode}`,
      instructions ? `توجيهات المدير المخصصة: ${instructions}` : "لا توجد توجيهات إضافية؛ اعتمد أفضل تنظيم تجاري واضح للمشتري الجزائري.",
      `التصنيفات الموجودة حالياً:\n${JSON.stringify(existingTree)}`,
      `المنتجات المطلوب تصنيفها (${catalog.length}):\n${JSON.stringify(catalog)}`,
    ].join("\n\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": settings.geminiAi.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4500,
            responseMimeType: "application/json",
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      }
    );

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `Gemini returned HTTP ${response.status}`);
    }

    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!raw) throw new Error("لم يرجع الوكيل مخططاً قابلاً للقراءة.");

    const parsed = JSON.parse(raw) as AiCategoryPlan;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.assignments)) {
      throw new Error("صيغة المخطط المقترح غير مكتملة.");
    }

    const normalizedCategories = parsed.categories.map((cat) => ({
      name: String(cat.name || "").trim(),
      description: cat.description ? String(cat.description).trim() : "",
      iconName: normalizeCategoryIconName(cat.iconName),
      isExisting: Boolean(cat.isExisting),
      subcategories: Array.isArray(cat.subcategories)
        ? cat.subcategories
            .filter((sub) => String(sub?.name || "").trim().length > 0)
            .map((sub) => ({
              name: String(sub.name).trim(),
              description: sub.description ? String(sub.description).trim() : "",
              iconName: normalizeCategoryIconName(sub.iconName),
              isExisting: Boolean(sub.isExisting),
            }))
        : [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        summary: parsed.summary || `تم تحليل ${targetProducts.length} منتج واقتراح ${normalizedCategories.length} تصنيفات رئيسية.`,
        categories: normalizedCategories,
        assignments: parsed.assignments,
        productCount: targetProducts.length,
      } satisfies AiCategoryPlan,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر إعداد مخطط التصنيفات" },
      { status: 502 }
    );
  }
}
