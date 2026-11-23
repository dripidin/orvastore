"use client";

import * as React from "react";

import {
  AlertCircle,
  ArrowDown,
  Bot,
  Check,
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  User,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CodAccountingReport } from "@/lib/analytics/accounting-report";
import { orvaFetch } from "@/lib/orva-api";
import type { ReconciliationRunSummary } from "@/lib/reconciliation/reconciliation-engine";
import { cn } from "@/lib/utils";

interface AiDiscrepancySummaryPanelProps {
  couriers: Array<{ id: string; name: string }>;
  accounting: CodAccountingReport | null;
  runResult?: ReconciliationRunSummary | null;
}

interface ReconChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string | null;
  truncated?: boolean;
  usedFallback?: boolean;
}

const RECON_QUICK_PROMPTS = [
  {
    label: "تقرير التدقيق الشامل",
    prompt: "قدّم تقرير تدقيق ومطابقة محاسبي كامل وشامل للنطاق المحدد مع أهم التوصيات.",
  },
  {
    label: "خسائر المرتجعات (tarif_retour)",
    prompt: "فصّل لي خسائر المرتجعات الحالية والمرتجعات الخارجية غير المسجلة في المتجر مع خطة لتقليلها.",
  },
  {
    label: "الطلبيات غير المتزامنة والمكررة",
    prompt: "اشرح الطلبيات غير المتزامنة والمكررة في الملفات وما الإجراء المناسب لكل فئة.",
  },
  {
    label: "الأموال العالقة والمحصلة",
    prompt: "كم لدينا من أموال عالقة عند شركات التوصيل، وما الجاهز للدفع، وما المحصل فعلياً؟",
  },
  {
    label: "أكثر الولايات مرتجعاً",
    prompt: "ما هي أكثر الولايات ارتجعاً وخسارةً حسب البيانات الحالية وكيف نتعامل معها؟",
  },
] as const;

export function AiDiscrepancySummaryPanel({ couriers, accounting, runResult }: AiDiscrepancySummaryPanelProps) {
  const [scope, setScope] = React.useState("all");
  const [messages, setMessages] = React.useState<ReconChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingLabel, setLoadingLabel] = React.useState("جارٍ تحليل المفارقات والتقرير المحاسبي...");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [liveAccounting, setLiveAccounting] = React.useState<CodAccountingReport | null>(accounting);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = React.useRef(true);
  const messagesRef = React.useRef<ReconChatMessage[]>([]);

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    if (accounting) setLiveAccounting(accounting);
  }, [accounting]);

  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    isNearBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  React.useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom(messages.length > 1);
    }
  }, [messages, loading, scrollToBottom]);

  const handleViewportScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    isNearBottomRef.current = nearBottom;
    setShowScrollBottom(!nearBottom && messages.length > 0);
  };

  const buildRunContext = React.useCallback(() => {
    if (!runResult) return undefined;
    const discrepancySamples = runResult.rows
      .filter((r) => r.bucket !== "matched_synced")
      .slice(0, 40)
      .map((r) => ({
        bucket: r.bucket,
        courierId: r.courierId,
        courier: r.courierName,
        tracking: r.trackingCode,
        orderRef: r.reference || r.storeOrderId,
        customer: r.customerName,
        wilaya: r.wilayaName,
        montantDzd: r.montantDzd,
        returnFeeDzd: r.returnFeeDzd,
        store: r.storeOrderStatus,
        courierStatus: r.courierStatusAr,
        financialStage: r.financialStatus,
        reason: r.discrepancyReason,
      }));
    return {
      counts: runResult.counts,
      discrepancySamples,
    };
  }, [runResult]);

  const nowTime = () =>
    new Date().toLocaleTimeString("ar-DZ", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const callReconAi = async (options: { mode: "summary" | "chat"; userMessage?: string }) => {
    if (loading) return;
    const trimmed = (options.userMessage ?? "").trim();
    if (options.mode === "chat" && !trimmed) return;

    const historyPayload = messagesRef.current.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setErrorMsg(null);
    if (options.mode === "chat") {
      const userMsg: ReconChatMessage = {
        id: `recon-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: nowTime(),
      };
      isNearBottomRef.current = true;
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoadingLabel("الوكيل يراجع الأرقام ويكتب الرد...");
    } else {
      isNearBottomRef.current = true;
      setLoadingLabel("جارٍ توليد تقرير التدقيق والمحاسبة الكامل...");
    }

    setLoading(true);
    try {
      const res = await orvaFetch("/api/reconciliation/ai-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          courierId: scope,
          message: options.mode === "chat" ? trimmed : undefined,
          history: historyPayload,
          runContext: buildRunContext(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "تعذّر الحصول على رد من الوكيل المحاسبي.");
      }
      if (data.accounting) {
        setLiveAccounting(data.accounting);
      }

      const replyText = String(data.reply || data.summaryText || "").trim();
      if (replyText) {
        const assistantMsg: ReconChatMessage = {
          id: `recon-ai-${Date.now()}`,
          role: "assistant",
          content: replyText,
          timestamp: nowTime(),
          model: data.model ?? null,
          truncated: Boolean(data.truncated),
          usedFallback: Boolean(data.usedFallback),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      if (data.aiWarning) {
        setErrorMsg(String(data.aiWarning));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "حدث خطأ أثناء التواصل مع الوكيل الذكي.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    void callReconAi({ mode: "chat", userMessage: input });
  };

  const handleCopyMessage = async (msg: ReconChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => setCopiedId((curr) => (curr === msg.id ? null : curr)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Bot className="size-4 text-emerald-600" />
              ملخص الوكيل الذكي للمفارقات والتقرير المحاسبي (COD Accounting)
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              يحلّل الفوارق والمرتجعات المسجلة وغير المسجلة ويحسب المبالغ العالقة والمحصلة وخسائر الارتجاع لكل شركة أو
              لجميع الشركات معاً مع دردشة مباشرة مع الوكيل.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={scope}
              onValueChange={(v) => {
                if (v) setScope(v);
              }}
            >
              <SelectTrigger className="h-8 w-44 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع شركات التوصيل (الكل)</SelectItem>
                {couriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void callReconAi({ mode: "summary" })} disabled={loading}>
              {loading ? (
                <Loader2 className="me-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="me-1.5 size-3.5" />
              )}
              توليد ملخص الوكيل
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        {liveAccounting && (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
            <div className="rounded-lg border bg-background p-2.5">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Wallet className="size-3" /> إجمالي المسلّم COD
              </div>
              <div className="mt-0.5 text-sm font-bold tabular-nums">
                {liveAccounting.grossDeliveredCodDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-emerald-600">نسبة التسليم {liveAccounting.deliveryRatePct}%</div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">أموال عالقة / بانتظار الدفع</div>
              <div className="mt-0.5 text-sm font-bold text-amber-600 tabular-nums">
                {liveAccounting.courierCashStages.pendingReceivableDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-muted-foreground">
                جاهز للدفع: {liveAccounting.courierCashStages.payoutReadyDzd.toLocaleString()} د.ج
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">محصّل ومدفوع للتاجر</div>
              <div className="mt-0.5 text-sm font-bold text-emerald-600 tabular-nums">
                {liveAccounting.courierCashStages.settledPaidDzd.toLocaleString()} د.ج
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">خسائر الإرجاع (tarif_retour)</div>
              <div className="mt-0.5 text-sm font-bold text-rose-600 tabular-nums">
                {liveAccounting.totalReturnLossDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-muted-foreground">
                منها {liveAccounting.capturedExternalReturnsCount} مرتجع خارجي
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">صافي الربح التشغيلي المقدر</div>
              <div
                className={cn(
                  "mt-0.5 text-sm font-bold tabular-nums",
                  liveAccounting.netRealizedProfitDzd >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {liveAccounting.netRealizedProfitDzd.toLocaleString()} د.ج
              </div>
              {liveAccounting.breakEvenRoas && (
                <Badge variant="outline" className="mt-0.5 text-[10px]">
                  Break-Even ROAS: {liveAccounting.breakEvenRoas}x
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Dedicated Embedded Scrollable AI Chat + Always-Ready Bottom Composer */}
        <div
          className={cn(
            "relative flex flex-col overflow-hidden rounded-xl border border-emerald-500/25 bg-background shadow-xs transition-[height] duration-200",
            isExpanded ? "h-[680px]" : "h-[480px]",
          )}
        >
          {/* Chat Header Bar */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/35 px-3.5 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate font-semibold text-xs text-foreground">
                محادثة الوكيل المحاسبي ({scope === "all" ? "كل الشركات" : scope})
              </span>
              {lastMessage?.model && (
                <Badge variant="outline" className="hidden font-mono text-[10px] text-emerald-600 sm:inline-flex">
                  {lastMessage.model}
                </Badge>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setMessages([]);
                    setErrorMsg(null);
                  }}
                  title="مسح المحادثة وبدء من جديد"
                >
                  <RotateCcw className="me-1 size-3" />
                  <span>محادثة جديدة</span>
                </Button>
              )}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? "تصغير الصندوق" : "توسيع الصندوق للقراءة المريحة"}
                aria-label={isExpanded ? "تصغير الصندوق" : "توسيع الصندوق"}
              >
                {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </Button>
            </div>
          </div>

          {/* Scrollable Messages Viewport */}
          <div
            ref={scrollContainerRef}
            onScroll={handleViewportScroll}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-3.5 sm:p-4"
          >
            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <Bot className="size-5" />
                </div>
                <div className="text-xs font-semibold text-foreground">
                  الوكيل المحاسبي جاهز للرد على أسئلتك وتوليد التقرير الكامل
                </div>
                <p className="max-w-md text-[11px] leading-relaxed">
                  اضغط على «توليد ملخص الوكيل» للحصول على التقرير المفصل بالكامل، أو اكتب سؤالك مباشرة في الصندوق
                  بالأسفل للاستفسار عن أي شركة، ولاية، طلبية، أو خسارة مرتجعات.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex min-w-0 flex-col gap-1", msg.role === "user" ? "items-start" : "items-end")}
              >
                <div
                  className={cn(
                    "group relative flex min-w-0 max-w-[94%] items-start gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-xs",
                    msg.role === "user"
                      ? "rounded-tr-xs bg-primary text-primary-foreground"
                      : "rounded-tl-xs border bg-muted/50 text-foreground",
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="mt-1 size-3.5 shrink-0 opacity-85" />
                  ) : (
                    <Bot className="mt-1 size-4 shrink-0 text-emerald-600" />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div dir="auto" className="whitespace-pre-wrap break-words text-xs leading-7 sm:text-[13px]">
                      {msg.content}
                    </div>

                    {msg.role === "assistant" && (msg.truncated || msg.usedFallback) && (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                        {msg.usedFallback && (
                          <Badge variant="outline" className="text-[10px] text-amber-600">
                            ملخص حسابي تلقائي (Gemini غير متاح حالياً)
                          </Badge>
                        )}
                        {msg.truncated && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={loading}
                            onClick={() =>
                              void callReconAi({
                                mode: "chat",
                                userMessage: "أكمل بقية التقرير من حيث توقفت دون تكرار ما سبق.",
                              })
                            }
                            className="h-6 text-[11px]"
                          >
                            <Sparkles className="me-1 size-3 text-emerald-600" />
                            متابعة إكمال التقرير
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === "assistant" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void handleCopyMessage(msg)}
                      title="نسخ النص"
                      className="shrink-0 opacity-70 hover:opacity-100"
                    >
                      {copiedId === msg.id ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                  )}
                </div>

                <span className="px-1 font-mono text-[10px] text-muted-foreground">{msg.timestamp}</span>
              </div>
            ))}

            {loading && (
              <div className="flex w-fit max-w-full items-center gap-2 rounded-2xl border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-600" />
                <span>{loadingLabel}</span>
              </div>
            )}

            {errorMsg && (
              <Alert variant="destructive" className="rounded-xl py-2.5">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs font-bold">تنبيه الاتصال بالوكيل</AlertTitle>
                <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Scroll to bottom floating pill when user scrolls up */}
          {showScrollBottom && (
            <div className="pointer-events-none flex justify-center pb-1.5">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => scrollToBottom(true)}
                className="pointer-events-auto h-6 rounded-full border shadow-sm text-[11px]"
              >
                <ArrowDown className="me-1 size-3" />
                النزول لآخر رسالة
              </Button>
            </div>
          )}

          {/* Always-Ready Bottom Input Composer */}
          <div className="shrink-0 space-y-2 border-t bg-muted/30 p-3">
            <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5">
              {RECON_QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={loading}
                  onClick={() => void callReconAi({ mode: "chat", userMessage: item.prompt })}
                  className="shrink-0 cursor-pointer rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
              <Input
                dir="auto"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اسأل الوكيل المحاسبي أو اطلب تفصيلاً إضافياً (مثلاً: حلّل لي خسائر ولاية 16 أو قارن الشركات)..."
                disabled={loading}
                className="h-9 flex-1 bg-background text-xs"
              />
              <Button
                type="submit"
                size="sm"
                disabled={loading || !input.trim()}
                className="h-9 shrink-0 gap-1.5 bg-emerald-600 px-3.5 text-white hover:bg-emerald-500"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />}
                <span>إرسال</span>
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
