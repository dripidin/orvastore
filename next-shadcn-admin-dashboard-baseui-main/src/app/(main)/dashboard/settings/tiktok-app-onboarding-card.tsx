"use client";

import * as React from "react";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DOMAIN_VERIFY_ENDPOINT = "/api/integrations/tiktok/domain-verify/";

const PORTAL_FIELDS = [
  {
    id: "portal_url",
    labelAr: "بوابة مطوّري الأعمال المعتمدة (TikTok Marketing API)",
    value: "https://business-api.tiktok.com/portal/apps",
    noteAr: "أنشئ التطبيق هنا (وليس في developers.tiktok.com) للحصول على صلاحيات الإعلانات والنماذج الفورية.",
    isLink: true,
  },
  {
    id: "app_name",
    labelAr: "اسم التطبيق (App Name — 20/50)",
    value: "ORVA Store Lead Sync",
    noteAr: "الاسم الظاهر عند طلب صلاحية ربط الحساب الإعلاني.",
  },
  {
    id: "category",
    labelAr: "التصنيف والمنصة (Category & Platform)",
    value: "E-Commerce — Web",
    noteAr: "اختر تصنيف التجارة الإلكترونية ومنصة الويب (Web).",
  },
  {
    id: "website_url",
    labelAr: "رابط الموقع الأساسي (Website / URL Prefix)",
    value: "https://orva-store.com/",
    noteAr: "النطاق الأساسي الموحّد بدون www.",
  },
  {
    id: "terms_url",
    labelAr: "رابط الشروط والأحكام (Terms of Service URL)",
    value: "https://orva-store.com/terms/",
    noteAr: "صفحة رسمية نشطة على المتجر.",
  },
  {
    id: "privacy_url",
    labelAr: "رابط سياسة الخصوصية (Privacy Policy URL)",
    value: "https://orva-store.com/privacy/",
    noteAr: "صفحة رسمية نشطة على المتجر.",
  },
  {
    id: "redirect_uri",
    labelAr: "رابط عودة التفويض (Advertiser Redirect URL)",
    value: "https://orva-store.com/api/integrations/tiktok/callback/",
    noteAr: "يجب نسخه مع الشرطة المائلة الأخيرة (/) حرفياً.",
  },
  {
    id: "webhook_url",
    labelAr: "رابط إشعارات الطلبيات الفورية (Webhook Callback URL)",
    value: "https://orva-store.com/api/integrations/tiktok/webhook/",
    noteAr: "لاستقبال عملاء النماذج الفورية لحظياً بتوقيع مشفّر.",
  },
] as const;

const APP_DESCRIPTION_EN =
  "Official ORVA Store integration to sync TikTok Instant Form leads directly into our e-commerce order dashboard.";

const APP_REVIEW_EXPLANATION_EN = `ORVA Store (https://orva-store.com) is an e-commerce platform in Algeria selling hardware and workshop equipment with Cash-on-Delivery (COD). We use this internal web integration inside our protected Admin Dashboard (/dashboard/settings/?tab=tiktok) so our marketing and operations team can:
1. Authenticate our TikTok Business account via OAuth 2.0 and select our authorized Ad Account.
2. Read active TikTok Instant Lead Forms and map each form to an ORVA catalog product (Leads Retrieval scope 12010100).
3. Generate and verify sandbox/test submissions before launching campaigns (Test Leads scope 12020100).
4. Receive real-time leads via signed webhooks (/api/integrations/tiktok/webhook/) and scheduled sync to create pending COD orders for call-center confirmation.`;

const SANDBOX_VIDEO_STEPS = [
  {
    step: "1",
    title: "إظهار النطاق وتسجيل الدخول (00:00 – 00:10)",
    detail:
      "تأكد أن شريط عنوان المتصفح ظاهر بوضوح ويعرض https://orva-store.com/dashboard/settings/?tab=tiktok ليتطابق مع النطاق الموثّق.",
  },
  {
    step: "2",
    title: "بدء ربط حساب TikTok OAuth (00:10 – 00:25)",
    detail:
      "انزل إلى بطاقة «ربط حساب TikTok Business» بالأسفل واضغط زر الربط، ثم وافق على منح صلاحيتَي Leads Retrieval (12010100) و Test Leads (12020100) في نافذة TikTok.",
  },
  {
    step: "3",
    title: "اختيار الحساب الإعلاني وتحديث النماذج (00:25 – 00:40)",
    detail:
      "بعد العودة التلقائية وظهور شارة «متصل ونشط»، اختر الحساب الإعلاني واضغط «تحديث النماذج» ثم اربط النموذج بمنتج من كتالوج ORVA.",
  },
  {
    step: "4",
    title: "مزامنة عميل تجريبي Test Lead (00:40 – 00:50)",
    detail:
      "اضغط «مزامنة الآن» على النموذج المفعّل لإظهار جلب العميل التجريبي وإنشاء طلب جديد في سجل المزامنة.",
  },
  {
    step: "5",
    title: "إظهار الطلب المُنشأ بحالة قيد الانتظار (00:50 – 01:00)",
    detail:
      "انتقل إلى صفحة الطلبيات (/dashboard/ecommerce/) لإظهار الطلب التجريبي المستورد من TikTok بحالة pending، ثم أوقف التسجيل بصيغة MP4 (أقل من 50MB).",
  },
] as const;

interface VerificationFileItem {
  fileName: string;
  content: string;
  updatedAt: string;
  publicUrl: string;
}

function buildAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (typeof window !== "undefined") {
    try {
      const token = window.localStorage.getItem("orva_admin_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Ignore storage access errors
    }
  }
  return headers;
}

function generateRandomHex(byteLength: number): string {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Array.from({ length: byteLength * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function TikTokAppOnboardingCard() {
  const [expanded, setExpanded] = React.useState<boolean>(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Domain verification state
  const [files, setFiles] = React.useState<VerificationFileItem[]>([]);
  const [fileNameInput, setFileNameInput] = React.useState<string>("");
  const [contentInput, setContentInput] = React.useState<string>("");
  const [verifyBusy, setVerifyBusy] = React.useState<boolean>(false);
  const [verifyFeedback, setVerifyFeedback] = React.useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const filePickerRef = React.useRef<HTMLInputElement>(null);

  // Client-side Hostinger env helper state (never persisted on server)
  const [envMode, setEnvMode] = React.useState<"sandbox" | "production">("sandbox");
  const [draftAppId, setDraftAppId] = React.useState<string>("");
  const [draftAppSecret, setDraftAppSecret] = React.useState<string>("");
  const [generatedEncKey, setGeneratedEncKey] = React.useState<string>("");
  const [generatedCronSecret, setGeneratedCronSecret] = React.useState<string>("");

  const copyText = (id: string, value: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2200);
    }
  };

  const loadVerificationFiles = React.useCallback(async () => {
    try {
      const res = await fetch(`${DOMAIN_VERIFY_ENDPOINT}?action=list`, {
        method: "GET",
        headers: buildAdminHeaders(),
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.files)) {
        setFiles(data.files as VerificationFileItem[]);
      }
    } catch {
      // Non-blocking initial load
    }
  }, []);

  React.useEffect(() => {
    if (expanded) {
      void loadVerificationFiles();
      if (!generatedEncKey) setGeneratedEncKey(generateRandomHex(32));
      if (!generatedCronSecret) setGeneratedCronSecret(generateRandomHex(32));
    }
  }, [expanded, loadVerificationFiles, generatedEncKey, generatedCronSecret]);

  const handleFileUploadPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setFileNameInput(file.name.trim());
      setContentInput(text.trim());
      setVerifyFeedback({
        type: "info",
        message: `تمت قراءة الملف «${file.name}» بنجاح. اضغط «حفظ وتفعيل ملف التوثيق» لنشره فوراً على النطاق.`,
      });
    } catch {
      setVerifyFeedback({ type: "error", message: "تعذر قراءة الملف النصي المختار." });
    } finally {
      if (filePickerRef.current) filePickerRef.current.value = "";
    }
  };

  const handleSaveVerificationFile = async () => {
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyFeedback(null);
    try {
      const res = await fetch(DOMAIN_VERIFY_ENDPOINT, {
        method: "POST",
        headers: buildAdminHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          fileName: fileNameInput.trim(),
          content: contentInput.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "تعذر حفظ ملف توثيق النطاق.");
      }
      setFiles(Array.isArray(data.files) ? (data.files as VerificationFileItem[]) : []);
      setFileNameInput("");
      setContentInput("");
      setVerifyFeedback({
        type: "success",
        message: "تم تفعيل ملف التوقيع فوراً على https://orva-store.com! افتح الرابط الحي للتأكد ثم اضغط Verify في TikTok.",
      });
    } catch (err) {
      setVerifyFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "حدث خطأ أثناء حفظ ملف التوثيق.",
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleDeleteVerificationFile = async (fileName: string) => {
    if (verifyBusy) return;
    setVerifyBusy(true);
    setVerifyFeedback(null);
    try {
      const res = await fetch(`${DOMAIN_VERIFY_ENDPOINT}?file=${encodeURIComponent(fileName)}`, {
        method: "DELETE",
        headers: buildAdminHeaders(),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "تعذر حذف ملف التوثيق.");
      }
      setFiles(Array.isArray(data.files) ? (data.files as VerificationFileItem[]) : []);
      setVerifyFeedback({ type: "info", message: `تم حذف ملف التوثيق «${fileName}».` });
    } catch (err) {
      setVerifyFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر حذف الملف.",
      });
    } finally {
      setVerifyBusy(false);
    }
  };

  const regenerateKeys = () => {
    setGeneratedEncKey(generateRandomHex(32));
    setGeneratedCronSecret(generateRandomHex(32));
  };

  const hostingerEnvBlock = React.useMemo(() => {
    const appIdVal = draftAppId.trim() || "<ضع_هنا_App_ID_من_بوابة_الأعمال>";
    const secretVal = draftAppSecret.trim() || "<ضع_هنا_Secret_من_بوابة_الأعمال>";
    const isSandbox = envMode === "sandbox";
    return [
      `APP_URL=https://orva-store.com`,
      `NEXT_PUBLIC_APP_URL=https://orva-store.com`,
      `TIKTOK_APP_ID=${appIdVal}`,
      `TIKTOK_APP_SECRET=${secretVal}`,
      `TIKTOK_API_VERSION=v1.3`,
      `TIKTOK_ENV=${isSandbox ? "tiktok_sandbox" : "production"}`,
      `TIKTOK_SANDBOX_MODE=${isSandbox ? "true" : "false"}`,
      `TIKTOK_REDIRECT_URI=https://orva-store.com/api/integrations/tiktok/callback/`,
      `TIKTOK_TOKEN_ENCRYPTION_KEY=${generatedEncKey || "<اضغط_توليد_مفاتيح>"}`,
      `TIKTOK_WEBHOOK_SECRET=${secretVal}`,
      `TIKTOK_SYNC_CRON_SECRET=${generatedCronSecret || "<اضغط_توليد_مفاتيح>"}`,
      `TIKTOK_TELEGRAM_ALERTS_ENABLED=false`,
    ].join("\n");
  }, [draftAppId, draftAppSecret, envMode, generatedEncKey, generatedCronSecret]);

  return (
    <Card className="mb-4 border-indigo-500/30 bg-indigo-500/[0.02]" dir="rtl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400" />
              <span>دليل إنشاء تطبيق TikTok Business وتوثيق النطاق وفيديو المراجعة</span>
              <Badge variant="outline" className="text-[10px] border-indigo-400/50 text-indigo-700 dark:text-indigo-300">
                أداة مساعدة شاملة
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              يوفّر لك كل النصوص والروابط الجاهزة للنسخ لإنشاء التطبيق على{" "}
              <span className="font-mono font-semibold" dir="ltr">
                business-api.tiktok.com
              </span>
              ، وتفعيل ملف توثيق النطاق (<span className="font-mono" dir="ltr">tiktok*.txt</span>) فوراً دون إعادة نشر،
              ومولّد متغيرات Hostinger، وسيناريو تسجيل فيديو الـ Sandbox.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs gap-1.5 h-8 shrink-0"
          >
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            <span>{expanded ? "طيّ الدليل" : "فتح دليل الإنشاء وأداة توثيق النطاق"}</span>
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 text-xs pt-1">
          {/* ── 1. Ready-to-Copy Portal Values & 1024px Icon ─────────────────── */}
          <div className="rounded-xl border bg-background p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="font-bold text-sm text-foreground">
                  1. بيانات إنشاء التطبيق الجاهزة للنسخ (بوابة الأعمال Marketing API)
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  افتح بوابة الأعمال واضغط Create App ثم انسخ الحقول التالية كما هي، وارفع الأيقونة المجهزة أدناه.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/images/tiktok-app-icon-1024.png"
                  download="orva-tiktok-app-icon-1024x1024.png"
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs font-semibold hover:bg-muted transition"
                >
                  <Download className="size-3.5 text-indigo-600" />
                  <span>تنزيل أيقونة 1024×1024 PNG الجاهزة</span>
                </a>
                <a
                  href="https://business-api.tiktok.com/portal/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 transition"
                >
                  <ExternalLink className="size-3.5" />
                  <span>فتح business-api.tiktok.com</span>
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PORTAL_FIELDS.map((item) => (
                <div key={item.id} className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[11px] text-foreground">{item.labelAr}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => copyText(item.id, item.value)}
                    >
                      {copiedId === item.id ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      <span>{copiedId === item.id ? "تم النسخ" : "نسخ"}</span>
                    </Button>
                  </div>
                  <div className="font-mono text-[11px] bg-background rounded border px-2 py-1 break-all" dir="ltr">
                    {item.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{item.noteAr}</div>
                </div>
              ))}
            </div>

            {/* Scopes Warning */}
            <div className="rounded-lg border border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5">
              <div className="font-bold text-amber-900 dark:text-amber-200">
                الصلاحيات المطلوبة فقط (Scopes — لا تضف صلاحيات غير مستخدمة حتى لا تتأخر المراجعة):
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5" dir="ltr">
                <Badge variant="secondary" className="font-mono text-[11px]">
                  Lead Management → Leads Retrieval (12010100)
                </Badge>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  Lead Management → Test Leads (12020100)
                </Badge>
              </div>
            </div>

            {/* Description & App Review Explanation */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px]">
                    وصف التطبيق القصير (Description — {APP_DESCRIPTION_EN.length}/120 حرفاً)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => copyText("desc_en", APP_DESCRIPTION_EN)}
                  >
                    {copiedId === "desc_en" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedId === "desc_en" ? "تم النسخ" : "نسخ الوصف"}</span>
                  </Button>
                </div>
                <pre
                  className="font-mono text-[11px] bg-background rounded border p-2.5 whitespace-pre-wrap leading-relaxed"
                  dir="ltr"
                >
                  {APP_DESCRIPTION_EN}
                </pre>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px]">
                    شرح آلية عمل الصلاحيات للمراجعة (App Review — {APP_REVIEW_EXPLANATION_EN.length}/1000 حرفاً)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => copyText("review_en", APP_REVIEW_EXPLANATION_EN)}
                  >
                    {copiedId === "review_en" ? (
                      <Check className="size-3 text-emerald-600" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{copiedId === "review_en" ? "تم النسخ" : "نسخ الشرح"}</span>
                  </Button>
                </div>
                <pre
                  className="font-mono text-[11px] bg-background rounded border p-2.5 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto"
                  dir="ltr"
                >
                  {APP_REVIEW_EXPLANATION_EN}
                </pre>
              </div>
            </div>
          </div>

          {/* ── 2. Dynamic Domain Signature File Verifier (tiktok*.txt) ─────── */}
          <div className="rounded-xl border bg-background p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <FileCheck2 className="size-4 text-emerald-600" />
                  <span>2. توثيق ملكية النطاق الفوري عبر ملف التوقيع (URL Prefix Signature File)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  عند اختيار <span className="font-mono">URL prefix: https://orva-store.com/</span> وتحميل ملف{" "}
                  <span className="font-mono">tiktok....txt</span> من TikTok، ارفعه هنا أو الصق محتواه ليتم نشره فوراً على
                  النطاق بدون إعادة بناء الموقع.
                </p>
              </div>
              <div>
                <input
                  ref={filePickerRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleFileUploadPick}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => filePickerRef.current?.click()}
                  className="text-xs gap-1.5 h-8"
                >
                  <Upload className="size-3.5" />
                  <span>اختيار ملف tiktok*.txt من جهازك</span>
                </Button>
              </div>
            </div>

            {verifyFeedback && (
              <Alert variant={verifyFeedback.type === "error" ? "destructive" : "default"} className="py-2.5">
                {verifyFeedback.type === "error" ? (
                  <AlertCircle className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                <AlertTitle className="text-xs font-bold">
                  {verifyFeedback.type === "error" ? "تنبيه" : "حالة ملف التوثيق"}
                </AlertTitle>
                <AlertDescription className="text-xs mt-0.5">{verifyFeedback.message}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tt-verify-filename" className="text-xs font-semibold">
                  اسم ملف التوقيع (مثال: tiktokAbCdEf12345.txt):
                </Label>
                <Input
                  id="tt-verify-filename"
                  type="text"
                  placeholder="tiktokXXXXXXXXXXXX.txt"
                  value={fileNameInput}
                  onChange={(e) => setFileNameInput(e.target.value)}
                  className="font-mono text-xs"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tt-verify-content" className="text-xs font-semibold">
                  محتوى ملف التوقيع (سطر التحقق النصي من TikTok):
                </Label>
                <Input
                  id="tt-verify-content"
                  type="text"
                  placeholder="tiktok-developers-site-verification=..."
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                  className="font-mono text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveVerificationFile}
                disabled={verifyBusy || !fileNameInput.trim() || !contentInput.trim()}
                className="text-xs gap-1.5 h-8"
              >
                {verifyBusy ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}
                <span>حفظ وتفعيل ملف التوثيق فوراً</span>
              </Button>
            </div>

            {files.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="font-semibold text-[11px] text-muted-foreground">ملفات التوثيق النشطة حالياً على النطاق:</div>
                <div className="space-y-2">
                  {files.map((f) => (
                    <div
                      key={f.fileName}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-mono font-bold text-xs text-foreground break-all" dir="ltr">
                          /{f.fileName}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-md" dir="ltr">
                          {f.content}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/${f.fileName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted transition"
                        >
                          <ExternalLink className="size-3" />
                          <span>اختبار الرابط الحي</span>
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={verifyBusy}
                          onClick={() => handleDeleteVerificationFile(f.fileName)}
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── 3. Hostinger Environment Variables Builder (Client-Only) ──────── */}
          <div className="rounded-xl border bg-background p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                  <KeyRound className="size-4 text-amber-600" />
                  <span>3. مولّد متغيرات البيئة لـ Hostinger (Sandbox للمراجعة ثم Production)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  تُولَّد مفاتيح التشفير محلياً داخل متصفحك فقط ولا تُحفظ أو تُرسل لأي خادم. الصق المتغيرات في لوحة{" "}
                  <strong>Hostinger → Node.js → Environment Variables</strong>.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={envMode === "sandbox" ? "default" : "outline"}
                  onClick={() => setEnvMode("sandbox")}
                  className="h-7 text-[11px]"
                >
                  1. وضع Sandbox (لتسجيل الفيديو والمراجعة)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={envMode === "production" ? "default" : "outline"}
                  onClick={() => setEnvMode("production")}
                  className="h-7 text-[11px]"
                >
                  2. وضع Production (بعد الموافقة)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="draft-tt-appid" className="text-[11px] font-semibold">
                  معرّف التطبيق من بوابة الأعمال (App ID — اختياري لتعبئة القالب):
                </Label>
                <Input
                  id="draft-tt-appid"
                  type="text"
                  placeholder="مثال: 7438920192837465"
                  value={draftAppId}
                  onChange={(e) => setDraftAppId(e.target.value)}
                  className="font-mono text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="draft-tt-secret" className="text-[11px] font-semibold">
                  المفتاح السري للتطبيق (Secret — اختياري لتعبئة القالب محلياً):
                </Label>
                <Input
                  id="draft-tt-secret"
                  type="password"
                  placeholder="Secret من بوابة business-api.tiktok.com"
                  value={draftAppSecret}
                  onChange={(e) => setDraftAppSecret(e.target.value)}
                  className="font-mono text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[11px]">
                  قالب متغيرات Hostinger الجاهز ({envMode === "sandbox" ? "وضع Sandbox" : "وضع Production"}):
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={regenerateKeys}
                    className="h-7 px-2.5 text-[11px]"
                  >
                    توليد مفاتيح عشوائية جديدة
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => copyText("hostinger_env", hostingerEnvBlock)}
                    className="h-7 px-3 text-[11px] gap-1"
                  >
                    {copiedId === "hostinger_env" ? <Check className="size-3" /> : <Copy className="size-3" />}
                    <span>{copiedId === "hostinger_env" ? "تم نسخ المتغيرات" : "نسخ الكل لـ Hostinger"}</span>
                  </Button>
                </div>
              </div>
              <pre
                className="font-mono text-[11px] bg-slate-950 text-slate-100 rounded-lg p-3 overflow-x-auto leading-relaxed"
                dir="ltr"
              >
                {hostingerEnvBlock}
              </pre>
            </div>
          </div>

          {/* ── 4. 60-Second Sandbox Demo Video Script ──────────────────────── */}
          <div className="rounded-xl border bg-background p-4 space-y-3">
            <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <Video className="size-4 text-rose-600" />
              <span>4. خطوات تسجيل فيديو المراجعة (Demo Video — 60 ثانية بصيغة MP4)</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              يشترط مراجعو TikTok فيديو تسجيل شاشة حقيقي (وليس مونتاجاً ترويجياً) يظهر فيه النطاق{" "}
              <span className="font-mono" dir="ltr">
                https://orva-store.com
              </span>{" "}
              وتجربة الصلاحيات المختارة فقط على وضع Sandbox:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
              {SANDBOX_VIDEO_STEPS.map((item) => (
                <div key={item.step} className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    خطوة {item.step}
                  </Badge>
                  <div className="font-bold text-[11px] text-foreground leading-snug">{item.title}</div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
