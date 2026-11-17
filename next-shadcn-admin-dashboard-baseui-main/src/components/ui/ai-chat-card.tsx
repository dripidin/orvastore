"use client";

import {
  Bot,
  Loader2,
  Package,
  RotateCcw,
  Search,
  SendHorizontal,
  Sparkles,
  Truck,
  User,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
    label: "📊 التقرير الأخير للطلبيات والمتجر",
    prompt: "أعطني التقرير الأخير لعدد الطلبيات وتوزيع حالاتها والتقرير العام لأداء المتجر والمبيعات.",
  },
  {
    label: "📦 حالة المنتجات والمخزون",
    prompt: "اعرض لي تقرير المنتجات الأكثر طلباً وحالة المخزون والأسعار الحالية.",
  },
  {
    label: "🚚 شحنات Redex والتوصيل",
    prompt: "كم عدد الطلبيات المربوطة بشركة التوصيل Redex وما هي نسبة التسليم والمرتجعات؟",
  },
] as const;

export interface AIChatCardProps {
  className?: string;
  onClose?: () => void;
}

export function AIChatCard({ className, onClose }: AIChatCardProps) {
  const [agentName, setAgentName] = useState("Orva Agent AI");
  const [projectNumber, setProjectNumber] = useState("347934146406");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "مرحباً بك في Orva Agent AI! يمكنني تزويدك بالتقارير الأخيرة لعدد الطلبيات، التقارير العامة للمتجر والمخزون، أو البحث الفوري عن أي طلبية برقمها (مثل PACK1-...) أو برقم هاتف الزبون.",
      timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const sendMessage = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        };
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("orva_admin_token");
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        const historyPayload = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/ai-agent", {
          method: "POST",
          headers,
          credentials: "same-origin",
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
          }),
        });

        const data = (await res.json()) as {
          success?: boolean;
          reply?: string;
          error?: string;
          agentName?: string;
          projectNumber?: string;
          matchedOrders?: MatchedOrderItem[];
        };

        if (data.agentName) setAgentName(data.agentName);
        if (data.projectNumber) setProjectNumber(data.projectNumber);

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content:
            res.ok && data.success && data.reply
              ? data.reply
              : (data.error ?? "تعذر الحصول على رد من Orva Agent AI حالياً."),
          timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
          matchedOrders: data.matchedOrders,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "تعذر الاتصال بخادم Orva Agent AI. يرجى التحقق من الشبكة والمحاولة مرة أخرى.",
            timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const handleReset = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "تمت إعادة تعيين المحادثة. اكتب رقم طلبية، رقم هاتف زبون، أو اطلب التقرير الأخير للطلبيات والتقرير العام للمتجر.",
        timestamp: new Date().toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setInput("");
  };

  return (
    <Card
      dir="rtl"
      className={cn(
        "flex h-[540px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-card/95 shadow-2xl backdrop-blur-xl",
        className,
      )}
    >
      {/* Spectrum UI AI Chat Card Header */}
      <CardHeader className="border-b bg-gradient-to-l from-emerald-500/10 via-primary/5 to-transparent px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="relative flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30">
              <Sparkles className="size-4" />
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
            </div>
            <div>
              <CardTitle className="flex items-center gap-1.5 font-bold text-sm">
                <span>{agentName}</span>
                <Badge variant="outline" className="border-emerald-500/30 px-1.5 py-0 font-mono text-[10px] text-emerald-500">
                  Gemini Flash
                </Badge>
              </CardTitle>
              <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                projects/{projectNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
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
      <CardContent ref={scrollContainerRef} className="flex-1 space-y-3 overflow-y-auto p-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn("flex flex-col gap-1.5", msg.role === "user" ? "items-start" : "items-end")}
          >
            <div
              className={cn(
                "flex max-w-[90%] items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs",
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
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>

            {/* Matched Orders Instant Lookup Cards */}
            {msg.matchedOrders && msg.matchedOrders.length > 0 && (
              <div className="w-full max-w-[92%] space-y-1.5 pt-1">
                {msg.matchedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">#{order.id}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {order.status}
                      </Badge>
                    </div>
                    <div className="text-foreground">
                      {order.customer} • <span className="font-mono">{order.phone}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Package className="size-3" />
                        {order.productName}
                      </span>
                      <span className="font-bold font-mono text-foreground">
                        {order.totalDzd.toLocaleString("fr-DZ")} د.ج
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {order.wilaya} — {order.commune}
                      </span>
                      {order.redexTrackingId && (
                        <span className="flex items-center gap-1 font-mono text-purple-500">
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
          <div className="flex items-center gap-2 rounded-2xl border bg-muted/40 px-3.5 py-2.5 text-muted-foreground text-xs w-fit">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" />
            <span>جاري تحليل بيانات الطلبيات والمتجر...</span>
          </div>
        )}
      </CardContent>

      {/* Quick Action Prompts & Input Composer */}
      <CardFooter className="flex flex-col gap-2 border-t bg-background/80 p-3">
        <div className="flex w-full gap-1.5 overflow-x-auto pb-1">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isLoading}
              onClick={() => void sendMessage(item.prompt)}
              className="shrink-0 cursor-pointer rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ابحث برقم طلبية، هاتف زبون، أو اطلب تقريراً..."
              disabled={isLoading}
              className="h-9 pr-8 text-xs"
            />
          </div>
          <Button
            type="submit"
            size="icon-sm"
            disabled={isLoading || !input.trim()}
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
