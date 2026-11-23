"use client";

import * as React from "react";

import { Bot, Loader2, Sparkles, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CodAccountingReport } from "@/lib/analytics/accounting-report";

interface AiDiscrepancySummaryPanelProps {
  couriers: Array<{ id: string; name: string }>;
  accounting: CodAccountingReport | null;
}

export function AiDiscrepancySummaryPanel({ couriers, accounting }: AiDiscrepancySummaryPanelProps) {
  const [scope, setScope] = React.useState("all");
  const [loading, setLoading] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState<string | null>(null);
  const [liveAccounting, setLiveAccounting] = React.useState<CodAccountingReport | null>(accounting);

  React.useEffect(() => {
    if (accounting) setLiveAccounting(accounting);
  }, [accounting]);

  const generateSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reconciliation/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: scope }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSummaryText(data.summaryText);
        if (data.accounting) setLiveAccounting(data.accounting);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Bot className="size-4 text-emerald-600" />
              ملخص الوكيل الذكي للمفارقات والتقرير المحاسبي (COD Accounting)
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              يحلّل الفوارق والمرتجعات المسجلة وغير المسجلة ويحسب المبالغ العالقة والمحصلة وخسائر الارتجاع لكل شركة أو
              لجميع الشركات معاً.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={scope}
              onValueChange={(v) => {
                if (v) setScope(v);
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs bg-background">
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
            <Button size="sm" onClick={() => void generateSummary()} disabled={loading}>
              {loading ? (
                <Loader2 className="size-3.5 me-1.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 me-1.5" />
              )}
              توليد ملخص الوكيل
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        {liveAccounting && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Wallet className="size-3" /> إجمالي المسلّم COD
              </div>
              <div className="font-bold text-sm mt-0.5 tabular-nums">
                {liveAccounting.grossDeliveredCodDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-emerald-600">نسبة التسليم {liveAccounting.deliveryRatePct}%</div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">أموال عالقة / بانتظار الدفع</div>
              <div className="font-bold text-sm mt-0.5 text-amber-600 tabular-nums">
                {liveAccounting.courierCashStages.pendingReceivableDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-muted-foreground">
                جاهز للدفع: {liveAccounting.courierCashStages.payoutReadyDzd.toLocaleString()} د.ج
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">محصّل ومدفوع للتاجر</div>
              <div className="font-bold text-sm mt-0.5 text-emerald-600 tabular-nums">
                {liveAccounting.courierCashStages.settledPaidDzd.toLocaleString()} د.ج
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">خسائر الإرجاع (tarif_retour)</div>
              <div className="font-bold text-sm mt-0.5 text-rose-600 tabular-nums">
                {liveAccounting.totalReturnLossDzd.toLocaleString()} د.ج
              </div>
              <div className="text-[10px] text-muted-foreground">
                منها {liveAccounting.capturedExternalReturnsCount} مرتجع خارجي
              </div>
            </div>

            <div className="rounded-lg border bg-background p-2.5">
              <div className="text-[11px] text-muted-foreground">صافي الربح التشغيلي المقدر</div>
              <div
                className={`font-bold text-sm mt-0.5 tabular-nums ${
                  liveAccounting.netRealizedProfitDzd >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {liveAccounting.netRealizedProfitDzd.toLocaleString()} د.ج
              </div>
              {liveAccounting.breakEvenRoas && (
                <Badge variant="outline" className="text-[10px] mt-0.5">
                  Break-Even ROAS: {liveAccounting.breakEvenRoas}x
                </Badge>
              )}
            </div>
          </div>
        )}

        {summaryText && (
          <div className="rounded-xl border bg-background p-3.5 whitespace-pre-wrap leading-relaxed text-xs">
            {summaryText}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
