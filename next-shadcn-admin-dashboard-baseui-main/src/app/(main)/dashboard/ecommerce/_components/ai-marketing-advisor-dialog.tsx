"use client";

import * as React from "react";
import {
  Bot,
  BarChart3,
  CheckCircle2,
  Loader2,
  MapPin,
  Megaphone,
  SendHorizontal,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { sendAiChatMessageFallbackAction } from "@/app/actions/ai-agent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignProfitabilityRow } from "@/lib/analytics/campaign-profitability";
import { formatDzd, orvaFetch } from "@/lib/orva-api";
import { computeEstimatedOrderProfit, computeUnitMargin, type Product } from "@/lib/repository/product-types";

interface AiMarketingAdvisorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaigns: CampaignProfitabilityRow[];
  products: Product[];
  totals: {
    revenue: number;
    adSpend: number;
    cogs: number;
    returnLoss: number;
    netProfit: number;
    delivered: number;
    returned: number;
    redexMatched: number;
  };
}

interface WilayaStatRow {
  wilaya: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  deliveryRatePct: number;
  recommendation: "SCALE" | "HOLD" | "OPTIMIZE_CONFIRMATION";
}

const MARKETING_CONSULT_PROMPTS = [
  {
    id: "budget_decisions",
    label: "🎯 قرارات الميزانية (Scale vs Pause)",
    prompt:
      "بصفتك مستشار تسويق خبير في Meta Ads، حلّل أرقام الحملات والمنتجات الحالية في المتجر وأعطني قرارات حاسمة: أي حملة أو منتج نرفع ميزانيته (Scale) وأيها يجب إيقافه أو تعديل إعلانه مع ذكر الأرقام (ROAS، CPA، صافي الربح)؟",
  },
  {
    id: "cpa_spike",
    label: "📈 تشخيص تكلفة الطلب (CPA) وتحسين الإعلانات",
    prompt:
      "حلّل متوسط تكلفة الطلب (CPA) وتكلفة الطلب المسلّم (CPD) مقارنة بهامش ربح كل منتج (Break-Even CPA)، واقترح خطة عملية لخفض تكلفة الإعلان ورفع نسبة التحويل في صفحات الهبوط.",
  },
  {
    id: "wilaya_targeting",
    label: "🗺️ أفضل الولايات للاستهداف في Meta Ads",
    prompt:
      "بناءً على إحصائيات الولايات ونسب التسليم والمرتجعات في المتجر، ما هي أفضل الولايات الجزائرية التي يجب تركيز ميزانية إعلانات Meta Ads عليها، وأي ولايات تحتاج تشديد التأكيد الهاتفي لتقليل خسائر المرتجعات؟",
  },
  {
    id: "bundle_strategy",
    label: "💡 استراتيجية الباقات وتعظيم صافي الربح",
    prompt:
      "اقترح خطة تسويقية لزيادة متوسط سلة الشراء وصافي الربح للباقات الحالية في المتجر بناءً على أسعار البيع، تكلفة الشراء، وتكلفة التسويق لكل طلب.",
  },
] as const;

export function AiMarketingAdvisorDialog({
  open,
  onOpenChange,
  campaigns,
  products,
  totals,
}: AiMarketingAdvisorDialogProps) {
  const [activeTab, setActiveTab] = React.useState<"consultant" | "economics" | "wilayas">("consultant");
  const [customQuestion, setCustomQuestion] = React.useState("");
  const [isConsulting, setIsConsulting] = React.useState(false);
  const [consultationHistory, setConsultationHistory] = React.useState<
    Array<{ id: string; question: string; answer: string; model?: string; timestamp: string }>
  >([]);
  const [wilayaEfficiency, setWilayaEfficiency] = React.useState<WilayaStatRow[]>([]);

  React.useEffect(() => {
    if (!open) return;
    orvaFetch("/api/ai-agent?mode=marketing_snapshot")
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.snapshot?.marketingAnalytics?.wilayaEfficiency)) {
          setWilayaEfficiency(json.snapshot.marketingAnalytics.wilayaEfficiency as WilayaStatRow[]);
        }
      })
      .catch(() => undefined);
  }, [open]);

  const buildLocalStructuredFallback = React.useCallback(
    (question: string): string => {
      const totalOrders = campaigns.reduce((acc, c) => acc + c.totalOrders, 0);
      const overallRoas = totals.adSpend > 0 ? (totals.revenue / totals.adSpend).toFixed(2) : "—";
      const overallCpa = totals.adSpend > 0 && totalOrders > 0 ? Math.round(totals.adSpend / totalOrders) : 0;
      const overallCpd =
        totals.adSpend > 0 && totals.delivered > 0 ? Math.round(totals.adSpend / totals.delivered) : 0;
      const outcomes = totals.delivered + totals.returned;
      const deliveryRate = outcomes > 0 ? Math.round((totals.delivered / outcomes) * 100) : 0;

      const topCampaign = [...campaigns].sort((a, b) => b.netProfitDzd - a.netProfitDzd)[0];
      const weakCampaign = [...campaigns].sort((a, b) => a.netProfitDzd - b.netProfitDzd)[0];

      const prodLines = products.slice(0, 4).map((p) => {
        const margin = computeUnitMargin(p.sellingPrice, p.purchaseCost);
        const cpa = p.metaAdsLink?.enabled && p.metaAdsLink.computedCpaDzd > 0 ? p.metaAdsLink.computedCpaDzd : p.marketingCostPerOrder || 850;
        const profit = computeEstimatedOrderProfit(p.sellingPrice, p.purchaseCost, cpa, 1);
        const breakEven = Math.max(0, margin - 200);
        return `• ${p.title}: سعر البيع ${formatDzd(p.sellingPrice)} | هامش القطعة ${formatDzd(margin)} | تكلفة الإعلان الحالية ${formatDzd(cpa)} | الحد الأقصى الآمن لـ CPA (Break-Even): ${formatDzd(breakEven)} | صافي ربح الطلب: ${formatDzd(profit)}`;
      });

      return [
        `📊 **التحليل التسويقي المبني على أرقام متجر ORVA Store (${question})**:`,
        ``,
        `1️⃣ **الملخص التنفيذي للمؤشرات المالية (Meta Ads & COD)**:`,
        `• الإيراد المحصّل من المسلّم: ${formatDzd(totals.revenue)} (${totals.delivered} طلب مسلّم بنسبة تسليم ${deliveryRate}%)`,
        `• إجمالي تكلفة الإعلانات (Meta Ads Spend): ${formatDzd(totals.adSpend)} (ROAS: ${overallRoas}x)`,
        `• متوسط تكلفة الطلب (CPA): ${formatDzd(overallCpa)} | تكلفة الطلب المسلّم (CPD): ${formatDzd(overallCpd)}`,
        `• تكلفة البضاعة (COGS): ${formatDzd(totals.cogs)} | خسائر شحن المرتجعات: ${formatDzd(totals.returnLoss)} (${totals.returned} مرتجع)`,
        `• **صافي الربح النهائي**: ${formatDzd(totals.netProfit)}`,
        ``,
        `2️⃣ **توصيات الميزانية والحملات (Scale vs Optimize)**:`,
        topCampaign
          ? `• **أفضل حملة للتوسيع (Scale +20%)**: "${topCampaign.campaignName}" — حققت صافي ربح ${formatDzd(topCampaign.netProfitDzd)} بنسبة تسليم ${topCampaign.deliveryRatePct}%${topCampaign.roas ? ` وROAS ${topCampaign.roas}x` : ""}.`
          : `• اربط معلمات تتبع Meta Ads في الحملات النشطة لفرز الحملات الرابحة تلقائياً.`,
        weakCampaign && weakCampaign.netProfitDzd < 0
          ? `• **حملة تحتاج مراجعة أو خفض CPA**: "${weakCampaign.campaignName}" — تسجل صافي ${formatDzd(weakCampaign.netProfitDzd)} بسبب تكلفة إعلان ${formatDzd(weakCampaign.adSpendDzd)} أو مرتجعات (${weakCampaign.returnedOrders}). يُنصح بتجديد الكرييتف (Creative) وتشديد تأكيد الهاتف.`
          : `• جميع الحملات المسجلة ضمن نطاق الأمان؛ حافظ على نسبة تسليم أعلى من 70% لتعظيم العائد.`,
        ``,
        `3️⃣ **حدود الأمان المالية للمنتجات (Break-Even CPA)**:`,
        ...(prodLines.length > 0 ? prodLines : ["• أضف تكلفة الشراء وتكلفة التسويق للمنتجات لحساب حدود الأمان تلقائياً."]),
      ].join("\n");
    },
    [campaigns, products, totals],
  );

  const runConsultation = React.useCallback(
    async (promptText: string) => {
      const trimmed = promptText.trim();
      if (!trimmed || isConsulting) return;
      setIsConsulting(true);

      try {
        const res = await orvaFetch("/api/ai-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: consultationHistory.slice(-4).flatMap((h) => [
              { role: "user" as const, content: h.question },
              { role: "assistant" as const, content: h.answer },
            ]),
          }),
        });

        let replyText = "";
        let modelUsed = "Orva AI Advisor";

        if (res.status === 401 || res.status === 403) {
          const fb = await sendAiChatMessageFallbackAction({ message: trimmed, history: [] });
          if (fb.success && fb.reply) {
            replyText = fb.reply;
            modelUsed = fb.model || "Gemini Auto";
          }
        } else {
          const data = await res.json().catch(() => null);
          if (data?.success && data.reply) {
            replyText = String(data.reply);
            modelUsed = String(data.model || "Gemini Auto");
          }
        }

        if (!replyText) {
          replyText = buildLocalStructuredFallback(trimmed);
          modelUsed = "محرك التحليل المالي الفوري (Meta Ads Engine)";
        }

        setConsultationHistory((prev) => [
          {
            id: `consult-${Date.now()}`,
            question: trimmed,
            answer: replyText,
            model: modelUsed,
            timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
          },
          ...prev,
        ]);
        setCustomQuestion("");
      } catch {
        const fallbackReply = buildLocalStructuredFallback(trimmed);
        setConsultationHistory((prev) => [
          {
            id: `consult-${Date.now()}`,
            question: trimmed,
            answer: fallbackReply,
            model: "محرك التحليل المالي الفوري (Meta Ads Engine)",
            timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
          },
          ...prev,
        ]);
      } finally {
        setIsConsulting(false);
      }
    },
    [isConsulting, consultationHistory, buildLocalStructuredFallback],
  );

  // Trigger initial executive consultation first time dialog opens
  React.useEffect(() => {
    if (open && consultationHistory.length === 0 && !isConsulting) {
      void runConsultation(MARKETING_CONSULT_PROMPTS[0].prompt);
    }
  }, [open, consultationHistory.length, isConsulting, runConsultation]);

  const totalOrdersCount = campaigns.reduce((acc, c) => acc + c.totalOrders, 0);
  const overallCpaDzd = totals.adSpend > 0 && totalOrdersCount > 0 ? Math.round(totals.adSpend / totalOrdersCount) : 0;
  const overallRoas = totals.adSpend > 0 ? (totals.revenue / totals.adSpend).toFixed(2) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[96vw] flex-col gap-0 overflow-hidden p-0 text-right sm:max-w-4xl"
        dir="rtl"
      >
        <DialogHeader className="border-b bg-gradient-to-l from-emerald-500/10 via-primary/5 to-transparent px-6 py-4 text-right">
          <div className="flex flex-wrap items-center justify-between gap-3 pl-8">
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Bot className="size-5" />
              </span>
              <div>
                <DialogTitle className="flex items-center gap-2 font-bold text-base">
                  <span>مستشار التسويق الذكي وخبير Meta Ads</span>
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                    Meta Ads Expert Skill
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  يحلل أرقام الطلبيات الحية، تكاليف الإعلانات، هوامش المنتجات، ونسب تسليم Redex لتقديم توصيات تسويقية دقيقة.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Live Marketing KPI Strip */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border bg-background/80 p-2.5">
              <span className="block text-[10px] text-muted-foreground">إجمالي الإنفاق الإعلاني (Meta)</span>
              <span className="font-bold font-mono text-blue-600 text-sm tabular-nums dark:text-blue-400">
                {formatDzd(totals.adSpend)}
              </span>
              <span className="block text-[10px] text-muted-foreground">ROAS: {overallRoas}x</span>
            </div>
            <div className="rounded-lg border bg-background/80 p-2.5">
              <span className="block text-[10px] text-muted-foreground">متوسط تكلفة الطلب (CPA)</span>
              <span className="font-bold font-mono text-sm tabular-nums">{formatDzd(overallCpaDzd)}</span>
              <span className="block text-[10px] text-muted-foreground">{totalOrdersCount} طلبية إجمالية</span>
            </div>
            <div className="rounded-lg border bg-background/80 p-2.5">
              <span className="block text-[10px] text-muted-foreground">الإيراد المحصّل الفعلي</span>
              <span className="font-bold font-mono text-sm tabular-nums">{formatDzd(totals.revenue)}</span>
              <span className="block text-[10px] text-muted-foreground">{totals.delivered} مسلّم / {totals.returned} مرتجع</span>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
              <span className="block text-[10px] text-muted-foreground">صافي الربح بعد الإعلانات</span>
              <span
                className={`flex items-center gap-1 font-extrabold font-mono text-sm tabular-nums ${
                  totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {totals.netProfit >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {formatDzd(totals.netProfit)}
              </span>
              <span className="block text-[10px] text-muted-foreground">بعد خصم COGS والمرتجعات</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2">
            <Button
              type="button"
              size="xs"
              variant={activeTab === "consultant" ? "default" : "outline"}
              onClick={() => setActiveTab("consultant")}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="size-3.5" />
              استشارات الوكيل التسويقية
            </Button>
            <Button
              type="button"
              size="xs"
              variant={activeTab === "economics" ? "default" : "outline"}
              onClick={() => setActiveTab("economics")}
              className="gap-1.5 text-xs"
            >
              <ShieldCheck className="size-3.5" />
              حدود الأمان وربحية المنتجات (Break-Even CPA)
            </Button>
            <Button
              type="button"
              size="xs"
              variant={activeTab === "wilayas" ? "default" : "outline"}
              onClick={() => setActiveTab("wilayas")}
              className="gap-1.5 text-xs"
            >
              <MapPin className="size-3.5" />
              كفاءة استهداف الولايات ({wilayaEfficiency.length})
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 text-xs">
          {activeTab === "consultant" && (
            <div className="space-y-4">
              {/* Quick Consultation Pills */}
              <div className="space-y-2">
                <div className="font-semibold text-muted-foreground text-xs">
                  اختر نوع الاستشارة التسويقية المطلوبة أو اكتب سؤالك المخصص:
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {MARKETING_CONSULT_PROMPTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isConsulting}
                      onClick={() => void runConsultation(item.prompt)}
                      className="flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-right font-medium text-xs transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-50 cursor-pointer"
                    >
                      <span>{item.label}</span>
                      <Target className="size-3.5 shrink-0 text-emerald-600" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Question Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runConsultation(customQuestion);
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="اسأل المستشار التسويقي: مثلاً كم أقصى CPA لباك كراون؟ أو كيف أرفع ROAS الحملة؟"
                  disabled={isConsulting}
                  className="h-9 flex-1 text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isConsulting || !customQuestion.trim()}
                  className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {isConsulting ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
                  <span>استشارة</span>
                </Button>
              </form>

              {/* Loading State */}
              {isConsulting && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs">
                  <Loader2 className="size-4 animate-spin text-emerald-600" />
                  <span>يقوم الوكيل الذكي بتحليل أرقام الحملات والمنتجات ونسب التسليم لإعداد الاستشارة التسويقية...</span>
                </div>
              )}

              {/* Consultation Results */}
              <div className="space-y-3">
                {consultationHistory.map((item) => (
                  <div key={item.id} className="space-y-2 rounded-xl border bg-card p-4 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <Megaphone className="size-3.5 text-primary" />
                        <span>{item.question}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {item.model && <Badge variant="secondary" className="text-[10px]">{item.model}</Badge>}
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-foreground text-xs">
                      {item.answer}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "economics" && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <strong>كيف يقرأ المستشار جدول حدود الأمان (Break-Even CPA)؟</strong>
                <p className="mt-1 text-muted-foreground">
                  الحد الأقصى الآمن لتكلفة الإعلان للطلب (Break-Even CPA) هو هامش ربح القطعة مطروحاً منه احتياطي المرتجعات. طالما أن تكلفة التسويق الفعلية للطلب أقل من هذا الحد، فالحملة تحقق ربحاً صافياً ويمكن توسيع ميزانيتها (Scale).
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right">المنتج / العرض</TableHead>
                      <TableHead className="text-right">سعر البيع</TableHead>
                      <TableHead className="text-right">تكلفة الشراء</TableHead>
                      <TableHead className="text-right">هامش القطعة</TableHead>
                      <TableHead className="text-right">تكلفة الإعلان للطلب (CPA)</TableHead>
                      <TableHead className="text-right">الحد الأقصى الآمن (Break-Even)</TableHead>
                      <TableHead className="text-right">صافي ربح الطلب</TableHead>
                      <TableHead className="text-center">توصية الميزانية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((prod) => {
                      const unitMargin = computeUnitMargin(prod.sellingPrice, prod.purchaseCost);
                      const cpa =
                        prod.metaAdsLink?.enabled && prod.metaAdsLink.computedCpaDzd > 0
                          ? prod.metaAdsLink.computedCpaDzd
                          : prod.marketingCostPerOrder || 850;
                      const netOrderProfit = computeEstimatedOrderProfit(
                        prod.sellingPrice,
                        prod.purchaseCost,
                        cpa,
                        1,
                      );
                      const breakEvenCpa = Math.max(0, unitMargin - 200);
                      const isHealthy = cpa <= breakEvenCpa && netOrderProfit > 0;

                      return (
                        <TableRow key={prod.id}>
                          <TableCell className="font-semibold text-xs">
                            <div>{prod.title}</div>
                            {prod.metaAdsLink?.enabled && (
                              <Badge variant="outline" className="mt-0.5 border-blue-500/30 text-[10px] text-blue-600">
                                مربوط بـ: {prod.metaAdsLink.campaignName || prod.metaAdsLink.adName || "Meta Ad"}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{formatDzd(prod.sellingPrice)}</TableCell>
                          <TableCell className="font-mono text-xs text-amber-600">{formatDzd(prod.purchaseCost)}</TableCell>
                          <TableCell className="font-mono font-semibold text-xs">{formatDzd(unitMargin)}</TableCell>
                          <TableCell className="font-mono font-bold text-blue-600 text-xs">{formatDzd(cpa)}</TableCell>
                          <TableCell className="font-mono text-xs">{formatDzd(breakEvenCpa)}</TableCell>
                          <TableCell
                            className={`font-bold font-mono text-xs ${
                              netOrderProfit > 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {formatDzd(netOrderProfit)}
                          </TableCell>
                          <TableCell className="text-center">
                            {isHealthy ? (
                              <Badge className="bg-emerald-600 text-[10px] text-white">
                                <CheckCircle2 className="ml-1 size-3" />
                                جاهز للتوسيع (Scale)
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                خفّض CPA أو ارفع السعر
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {activeTab === "wilayas" && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right">الولاية</TableHead>
                      <TableHead className="text-center">إجمالي الطلبات</TableHead>
                      <TableHead className="text-center">المسلّم</TableHead>
                      <TableHead className="text-center">المرتجع</TableHead>
                      <TableHead className="text-center">نسبة التسليم</TableHead>
                      <TableHead className="text-center">توصية استهداف Meta Ads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wilayaEfficiency.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                          جارٍ تحميل إحصائيات الولايات...
                        </TableCell>
                      </TableRow>
                    ) : (
                      wilayaEfficiency.map((w) => (
                        <TableRow key={w.wilaya}>
                          <TableCell className="font-semibold text-xs">{w.wilaya}</TableCell>
                          <TableCell className="text-center font-mono text-xs">{w.totalOrders}</TableCell>
                          <TableCell className="text-center font-mono text-emerald-600 text-xs">
                            {w.deliveredOrders}
                          </TableCell>
                          <TableCell className="text-center font-mono text-orange-600 text-xs">
                            {w.returnedOrders}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">{w.deliveryRatePct}%</TableCell>
                          <TableCell className="text-center">
                            {w.recommendation === "SCALE" ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700">
                                ركّز الاستهداف (تسليم ممتاز)
                              </Badge>
                            ) : w.recommendation === "HOLD" ? (
                              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-[10px] text-blue-700">
                                استهداف مستقر (Hold)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700">
                                شدّد التأكيد الهاتفي قبل الشحن
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
