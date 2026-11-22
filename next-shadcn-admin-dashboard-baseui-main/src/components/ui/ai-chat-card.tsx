"use client";

import Link from "next/link";
import {
  AlertCircle,
  Bot,
  GripHorizontal,
  Loader2,
  Maximize2,
  Minimize2,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  SendHorizontal,
  Settings2,
  Sparkles,
  Truck,
  User,
  X,
} from "lucide-react";
import { type FormEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  getDashboardSettingsFallbackAction,
  probeAiChatConnectionFallbackAction,
  sendAiChatMessageFallbackAction,
} from "@/app/actions/ai-agent";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MatchedOrderItem {
  id: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  productName: string;
  totalDzd: number;
  status: string;
  redexTrackingId: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  matchedOrders?: MatchedOrderItem[];
}

const QUICK_PROMPTS = [
  {
    label: "📈 استشارة تسويقية وتحليل ربحية Meta Ads",
    prompt:
      "بصفتك مستشار تسويق خبير في Meta Ads، حلّل أرقام الحملات والمنتجات الحالية في المتجر وأعطني استشارة تسويقية شاملة: تكلفة الإعلانات، ROAS، CPA، حدود الأمان للمنتجات، وأي حملة نوسع ميزانيتها (Scale)؟",
  },
  {
    label: "🗺️ أفضل الولايات للاستهداف الإعلاني",
    prompt:
      "بناءً على نسب التسليم والمرتجعات في المتجر، ما هي أفضل الولايات الجزائرية لاستهدافها في إعلانات Meta Ads لتعظيم صافي الربح؟",
  },
  {
    label: "📊 التقرير الأخير للطلبيات والمتجر",
    prompt: "أعطني التقرير الأخير لعدد الطلبيات وتوزيع حالاتها والتقرير العام لأداء المتجر والمبيعات.",
  },
  {
    label: "📦 حالة المنتجات والمخزون",
    prompt: "اعرض لي تقرير المنتجات الأكثر طلباً وحالة المخزون والأسعار الحالية.",
  },
] as const;

export interface AIChatCardProps {
  className?: string;
  onClose?: () => void;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onResetPosition?: () => void;
  isDragging?: boolean;
  isCustomPositioned?: boolean;
}

export function AIChatCard({
  className,
  onClose,
  onHeaderPointerDown,
  onResetPosition,
  isDragging = false,
  isCustomPositioned = false,
}: AIChatCardProps) {
  const [agentName, setAgentName] = useState("Orva Agent AI");
  const [projectNumber, setProjectNumber] = useState("347934146406");
  const [activeModel, setActiveModel] = useState("Auto");
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "مرحباً بك في Orva Agent AI! يمكنني مساعدتك في استعراض تقارير الطلبيات، البحث برقم الطلب أو الهاتف، متابعة شحنات Redex، أو الدردشة معك مباشرة.",
      timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [disconnectedError, setDisconnectedError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const isDisconnected = Boolean(disconnectedError);

  const scrollToBottom = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, disconnectedError, isExpanded, scrollToBottom]);

  const buildAuthHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("orva_admin_token");
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const syncSettingsMetadata = useCallback(async () => {
    try {
      const data = await getDashboardSettingsFallbackAction();
      const g = data.settings.geminiAi;
      if (g.name) setAgentName(g.name);
      if (g.projectNumber) setProjectNumber(g.projectNumber);
      if (g.model) {
        setActiveModel(g.model.toLowerCase() === "auto" ? "Auto" : g.model);
      }
      if (!g.enabled) {
        setDisconnectedError("وكيل Orva Agent AI متوقف حالياً من إعدادات لوحة التحكم.");
      } else if (!g.isConfigured) {
        setDisconnectedError("تم إيقاف الدردشة مؤقتاً: مفتاح Gemini API غير مضبوط في الإعدادات.");
      } else {
        setDisconnectedError((prev) =>
          prev?.includes("متوقف حالياً من إعدادات") || prev?.includes("مفتاح Gemini API") ? null : prev,
        );
      }
    } catch {
      // Ignore metadata sync errors
    }
  }, []);

  useEffect(() => {
    void syncSettingsMetadata();
    if (typeof window !== "undefined") {
      const handler = () => void syncSettingsMetadata();
      window.addEventListener("orva:gemini-settings-updated", handler);
      return () => window.removeEventListener("orva:gemini-settings-updated", handler);
    }
    return undefined;
  }, [syncSettingsMetadata]);

  const sendMessage = useCallback(
    async (textToSend: string, options?: { skipUserAppend?: boolean }) => {
      const trimmed = textToSend.trim();
      if (!trimmed || isLoadingRef.current) return;

      const historyPayload = messagesRef.current
        .filter((m) => m.id !== "welcome-msg" && !m.id.startsWith("welcome-"))
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      if (!options?.skipUserAppend) {
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          content: trimmed,
          timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
      }

      isLoadingRef.current = true;
      setIsLoading(true);
      setDisconnectedError(null);

      try {
        const headers = buildAuthHeaders();

        const res = await fetch("/api/ai-agent", {
          method: "POST",
          headers,
          credentials: "same-origin",
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
          }),
        });

        let data: {
          success?: boolean;
          disconnected?: boolean;
          reply?: string;
          error?: string;
          agentName?: string;
          projectNumber?: string;
          model?: string;
          matchedOrders?: MatchedOrderItem[];
        };

        if (res.status === 401 || res.status === 403) {
          data = await sendAiChatMessageFallbackAction({
            message: trimmed,
            history: historyPayload,
          });
        } else {
          data = (await res.json()) as typeof data;
        }

        if (data.agentName) setAgentName(data.agentName);
        if (data.projectNumber) setProjectNumber(data.projectNumber);

        if (!data.success || !data.reply) {
          const errMessage =
            data.error ?? "تم إيقاف الدردشة مؤقتاً لتعذّر الاتصال بمحرك Google Gemini حالياً.";
          setDisconnectedError(errMessage);
          setLastFailedPrompt(trimmed);
          return;
        }

        if (data.model) setActiveModel(data.model);
        setLastFailedPrompt(null);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
          matchedOrders: data.matchedOrders && data.matchedOrders.length > 0 ? data.matchedOrders : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setDisconnectedError("تم إيقاف الدردشة مؤقتاً: تعذّر الاتصال بخادم Orva Agent AI. تحقق من الشبكة ثم أعد المحاولة.");
        setLastFailedPrompt(trimmed);
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [],
  );

  const handleReconnect = async () => {
    if (isReconnecting || isLoading) return;
    setIsReconnecting(true);
    try {
      const headers = buildAuthHeaders();
      const res = await fetch("/api/ai-agent?mode=probe", {
        method: "GET",
        headers,
        credentials: "same-origin",
      });

      const probe =
        res.status === 401 || res.status === 403
          ? await probeAiChatConnectionFallbackAction(true)
          : ((await res.json()) as {
              connected?: boolean;
              activeModel?: string | null;
              error?: string;
              enabled?: boolean;
            });

      if (probe.connected && probe.enabled !== false) {
        setDisconnectedError(null);
        if (probe.activeModel) setActiveModel(probe.activeModel);
        const pendingPrompt = lastFailedPrompt;
        setIsReconnecting(false);
        if (pendingPrompt) {
          await sendMessage(pendingPrompt, { skipUserAppend: true });
        }
        return;
      }

      setDisconnectedError(probe.error ?? "لا يزال الاتصال بمحرك Google Gemini متعذراً حالياً.");
    } catch {
      setDisconnectedError("تعذّر التحقق من الاتصال بمحرك Google Gemini حالياً.");
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDisconnected) return;
    void sendMessage(input);
  };

  const handleReset = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "تمت إعادة تعيين المحادثة. اكتب أي سؤال، أو ابحث برقم طلبية أو هاتف زبون، أو اطلب التقرير العام للمتجر.",
        timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInput("");
    setDisconnectedError(null);
    setLastFailedPrompt(null);
    void syncSettingsMetadata();
  };

  return (
    <Card
      dir="rtl"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-xl transition-[width,height,box-shadow] duration-200",
        isExpanded
          ? "h-[min(84dvh,680px)] w-[min(94vw,36rem)] min-h-[280px] max-h-[calc(100dvh-5rem)]"
          : "h-[min(74dvh,540px)] w-[min(92vw,26rem)] min-h-[240px] max-h-[calc(100dvh-5rem)]",
        isDragging && "select-none ring-2 ring-emerald-500/40 shadow-[0_20px_60px_-15px_rgba(16,185,129,0.35)]",
        isDisconnected ? "border-destructive/40" : "border-emerald-500/30",
        className,
      )}
    >
      {/* Spectrum UI AI Chat Card Header (Draggable Handle) */}
      <CardHeader
        onPointerDown={onHeaderPointerDown}
        title={onHeaderPointerDown ? "اسحب لتحريك نافذة المحادثة في أي مكان على الشاشة" : undefined}
        className={cn(
          "shrink-0 border-b bg-gradient-to-l px-3.5 py-2.5 sm:px-4 sm:py-3",
          onHeaderPointerDown && "cursor-grab active:cursor-grabbing touch-none select-none",
          isDisconnected
            ? "from-destructive/10 via-destructive/5 to-transparent"
            : "from-emerald-500/10 via-primary/5 to-transparent",
        )}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={cn(
                "relative flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
                isDisconnected
                  ? "bg-destructive/15 text-destructive ring-destructive/30"
                  : "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
              )}
            >
              <Sparkles className="size-4" />
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                {!isDisconnected && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    isDisconnected ? "bg-destructive" : "bg-emerald-500",
                  )}
                />
              </span>
            </div>
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-1.5 font-bold text-xs sm:text-sm">
                <span className="truncate">{agentName}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "max-w-[130px] truncate px-1.5 py-0 font-mono text-[10px]",
                    isDisconnected
                      ? "border-destructive/40 text-destructive"
                      : "border-emerald-500/30 text-emerald-500",
                  )}
                >
                  {isDisconnected ? "متوقف مؤقتاً" : activeModel}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {onHeaderPointerDown && <GripHorizontal className="size-3 shrink-0 opacity-70" />}
                <span className="truncate font-mono" dir="ltr">
                  projects/{projectNumber}
                </span>
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-0.5 sm:gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isCustomPositioned && onResetPosition && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onResetPosition}
                title="إرجاع المربع للزاوية الافتراضية"
                aria-label="إرجاع المربع للزاوية الافتراضية"
              >
                <GripHorizontal className="size-3.5 text-emerald-500" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setIsExpanded((prev) => !prev)}
              title={isExpanded ? "الحجم الافتراضي" : "توسيع نافذة الشات"}
              aria-label={isExpanded ? "الحجم الافتراضي" : "توسيع نافذة الشات"}
            >
              {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
            <Button
              type="button"
              nativeButton={false}
              variant="ghost"
              size="icon-xs"
              render={<Link prefetch={false} href="/dashboard/settings?tab=gemini" onClick={onClose} />}
              title="إعدادات تكامل Gemini API"
              aria-label="إعدادات تكامل Gemini API"
            >
              <Settings2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleReset}
              title="إعادة تعيين المحادثة"
              aria-label="إعادة تعيين المحادثة"
            >
              <RotateCcw className="size-3.5" />
            </Button>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                title="إغلاق"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Messages Stream */}
      <CardContent ref={scrollContainerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex min-w-0 flex-col gap-1.5", msg.role === "user" ? "items-start" : "items-end")}
          >
            <div
              className={cn(
                "flex min-w-0 max-w-[92%] items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs",
                msg.role === "user"
                  ? "rounded-tr-xs bg-primary text-primary-foreground"
                  : "rounded-tl-xs border bg-muted/60 text-foreground",
              )}
            >
              {msg.role === "user" ? (
                <User className="mt-0.5 size-3.5 shrink-0 opacity-80" />
              ) : (
                <Bot className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              )}
              <div dir="auto" className="min-w-0 flex-1 whitespace-pre-wrap break-words overflow-x-hidden">
                {msg.content}
              </div>
            </div>

            {/* Matched Orders Instant Lookup Cards */}
            {msg.matchedOrders && msg.matchedOrders.length > 0 && (
              <div className="w-full max-w-[94%] space-y-1.5 pt-1">
                {msg.matchedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 font-bold">
                      <span className="truncate font-mono text-emerald-600 dark:text-emerald-400">#{order.id}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {order.status}
                      </Badge>
                    </div>
                    <div className="truncate text-foreground">
                      {order.customer} • <span className="font-mono">{order.phone}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <Package className="size-3 shrink-0" />
                        <span className="truncate">{order.productName}</span>
                      </span>
                      <span className="shrink-0 font-bold font-mono text-foreground">
                        {order.totalDzd.toLocaleString("fr-DZ")} د.ج
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">
                        {order.wilaya} — {order.commune}
                      </span>
                      {order.redexTrackingId && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-purple-500">
                          <Truck className="size-3" />
                          {order.redexTrackingId}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <span className="px-1 font-mono text-[10px] text-muted-foreground">{msg.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex w-fit max-w-full items-center gap-2 rounded-2xl border bg-muted/40 px-3.5 py-2.5 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-500" />
            <span>جاري الاتصال بمحرك Google Gemini وتحليل الرد...</span>
          </div>
        )}

        {disconnectedError && (
          <Alert variant="destructive" className="rounded-xl border-destructive/40 bg-destructive/10 py-3">
            <AlertCircle className="size-4" />
            <AlertTitle className="font-bold text-xs">تم إيقاف الدردشة مؤقتاً (انقطاع اتصال Gemini)</AlertTitle>
            <AlertDescription className="mt-1 space-y-2.5 text-xs">
              <p className="leading-relaxed break-words">{disconnectedError}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleReconnect()}
                  disabled={isReconnecting}
                  className="h-7 gap-1.5 text-[11px]"
                >
                  <RefreshCw className={cn("size-3", isReconnecting && "animate-spin")} />
                  <span>{isReconnecting ? "جارٍ فحص الاتصال..." : "إعادة المحاولة الآن"}</span>
                </Button>
                <Button
                  type="button"
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  render={<Link prefetch={false} href="/dashboard/settings?tab=gemini" onClick={onClose} />}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Settings2 className="size-3" />
                  <span>إعدادات Gemini</span>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Quick Action Prompts & Input Composer */}
      <CardFooter className="shrink-0 flex flex-col gap-2 border-t bg-background/80 p-2.5 sm:p-3">
        <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isLoading || isDisconnected}
              onClick={() => void sendMessage(item.prompt)}
              className="shrink-0 cursor-pointer rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              dir="auto"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isDisconnected
                  ? "الدردشة متوقفة مؤقتاً حتى عودة الاتصال بـ Gemini..."
                  : "ابحث برقم طلبية، هاتف زبون، أو اكتب رسالتك..."
              }
              disabled={isLoading || isDisconnected}
              className="h-9 pr-8 text-xs"
            />
          </div>
          <Button
            type="submit"
            size="icon-sm"
            disabled={isLoading || isDisconnected || !input.trim()}
            className="size-9 shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
            aria-label="إرسال"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
