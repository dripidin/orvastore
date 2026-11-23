"use client";

import * as React from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Layers } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReconciledRowItem, ReconciliationRunSummary } from "@/lib/reconciliation/reconciliation-engine";

import { AiDiscrepancySummaryPanel } from "./ai-discrepancy-summary-panel";
import { ExcelUploadMapperCard, type StagedUploadFile } from "./excel-upload-mapper-card";
import { ReconciliationTable } from "./reconciliation-table";

export function ReconciliationWorkspace() {
  const [couriers, setCouriers] = React.useState<any[]>([]);
  const [catalog, setCatalog] = React.useState<any[]>([]);
  const [runResult, setRunResult] = React.useState<ReconciliationRunSummary | null>(null);
  const [isRunning, setIsRunning] = React.useState(false);
  const [busyRowId, setBusyRowId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadInitial = React.useCallback(async () => {
    try {
      const res = await fetch("/api/reconciliation", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCouriers(data.couriers ?? []);
        setCatalog(data.catalog ?? []);
        if (data.latestRun) setRunResult(data.latestRun);
      }
    } catch {
      // handled cleanly
    }
  }, []);

  React.useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const handleRunExcelReconciliation = async (stagedFiles: StagedUploadFile[], includeStoreOnly: boolean) => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("includeStoreOnly", String(includeStoreOnly));

      const metadata = stagedFiles.map((item) => ({
        courierId:
          item.courierId === "__new__"
            ? item.customCourierName
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_") || "external"
            : item.courierId,
        courierName: item.courierId === "__new__" ? item.customCourierName.trim() || "شركة خارجية" : item.courierName,
      }));
      fd.set("metadata", JSON.stringify(metadata));
      for (const item of stagedFiles) {
        fd.append("files", item.file);
      }

      const res = await fetch("/api/reconciliation", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "تعذرت معالجة ملفات Excel للمطابقة");
      }
      setRunResult(data.result);
      setFeedback({
        type: "success",
        message: `اكتملت المطابقة الشاملة: فُحصت ${data.result.counts.totalExternalRows} طلبية من ${data.result.couriersProcessed.length} ملف/شركة مقابل ${data.result.counts.totalStoreOrders} طلبية بالمتجر.`,
      });
      await loadInitial();
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ أثناء المطابقة" });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunApiReconciliation = async (courierIds: string[], includeStoreOnly: boolean) => {
    setIsRunning(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "api_sync",
          courierIds,
          includeStoreOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشل سحب الطلبيات عبر API");
      }
      setRunResult(data.result);
      setFeedback({
        type: "success",
        message: `تمت المطابقة الحية عبر API Token (${courierIds.join(", ")}): ${data.result.counts.totalExternalRows} شحنة.`,
      });
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "فشل السحب عبر API" });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRowAction = async (
    action:
      | "sync_status"
      | "import_to_store"
      | "push_to_courier"
      | "resolve_duplicate"
      | "manual_override_status"
      | "live_refresh_via_api",
    items: ReconciledRowItem[],
    extra?: Record<string, unknown>,
  ) => {
    setBusyRowId(items.length === 1 ? items[0].id : "bulk");
    setFeedback(null);
    try {
      const res = await fetch("/api/reconciliation/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, items, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "تعذر تنفيذ الإجراء");
      }
      setFeedback({
        type: "success",
        message: `تم تنفيذ الإجراء بنجاح على ${data.successCount ?? 0} عنصر من أصل ${data.processed ?? items.length}.`,
      });
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ أثناء التنفيذ" });
    } finally {
      setBusyRowId(null);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="size-6 text-primary" />
            مركز مطابقة الطلبيات وشركات التوصيل (Excel &amp; API)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            فرز تلقائي للمتطابقة، غير المتزامنة، المكررة عبر الملفات، المسجلة في المتجر فقط أو عند الناقل فقط، مع التقاط
            المرتجعات وإجراءات المعاينة والتحكم الشاملة.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <Layers className="size-3.5" />
          69 ولاية • دعم متعدد الشركات
        </Badge>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          {feedback.type === "error" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
          <AlertTitle className="text-xs font-bold">{feedback.type === "error" ? "تنبيه" : "نتيجة العملية"}</AlertTitle>
          <AlertDescription className="text-xs">{feedback.message}</AlertDescription>
        </Alert>
      )}

      <ExcelUploadMapperCard
        couriers={couriers}
        catalog={catalog}
        isRunning={isRunning}
        freshnessAlerts={runResult?.couriersProcessed ?? []}
        onRunExcelReconciliation={handleRunExcelReconciliation}
        onRunApiReconciliation={handleRunApiReconciliation}
      />

      {runResult && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] text-muted-foreground">متطابقة ومتزامنة</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3 text-xl font-bold text-emerald-600 tabular-nums">
                {runResult.counts.matched_synced}
              </CardContent>
            </Card>
            <Card className="border-amber-500/30">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] text-muted-foreground">غير متزامنة</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3 text-xl font-bold text-amber-600 tabular-nums">
                {runResult.counts.matched_unsynced}
              </CardContent>
            </Card>
            <Card className="border-blue-500/30">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] text-muted-foreground">في شركة التوصيل فقط</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3 text-xl font-bold text-blue-600 tabular-nums">
                {runResult.counts.courier_only}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] text-muted-foreground">في المتجر فقط</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3 text-xl font-bold tabular-nums">
                {runResult.counts.store_only}
              </CardContent>
            </Card>
            <Card className="border-rose-500/30">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-[11px] text-muted-foreground">حالات مكررة</CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3 text-xl font-bold text-rose-600 tabular-nums">
                {runResult.counts.duplicate}
              </CardContent>
            </Card>
          </div>

          <ReconciliationTable
            rows={runResult.rows}
            counts={runResult.counts}
            busyRowId={busyRowId}
            onRowAction={handleRowAction}
          />
        </>
      )}

      <AiDiscrepancySummaryPanel
        couriers={couriers.map((c) => ({ id: c.id, name: c.nameAr || c.name }))}
        accounting={runResult?.accounting ?? null}
      />
    </div>
  );
}
