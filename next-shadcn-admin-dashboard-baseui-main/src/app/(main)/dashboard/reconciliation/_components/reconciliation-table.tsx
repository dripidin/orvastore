"use client";

import * as React from "react";

import { CheckCircle2, CopyCheck, Loader2, PlusCircle, RefreshCw, RotateCcw, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReconciledRowItem, ReconciliationBucket } from "@/lib/reconciliation/reconciliation-engine";

interface ReconciliationTableProps {
  rows: ReconciledRowItem[];
  counts: Record<ReconciliationBucket, number> & {
    storeOwnedReturnsCount?: number;
    totalReturnLossDzd?: number;
  };
  busyRowId: string | null;
  onRowAction: (
    action:
      | "sync_status"
      | "import_to_store"
      | "push_to_courier"
      | "resolve_duplicate"
      | "manual_override_status"
      | "live_refresh_via_api",
    items: ReconciledRowItem[],
    extra?: Record<string, unknown>,
  ) => Promise<void>;
}

const BUCKET_META: Array<{ key: ReconciliationBucket | "all"; label: string }> = [
  { key: "matched_unsynced", label: "غير متزامنة" },
  { key: "courier_only", label: "في التوصيل فقط (إضافة للمتجر)" },
  { key: "store_only", label: "في المتجر فقط" },
  { key: "duplicate", label: "مكررة" },
  { key: "matched_synced", label: "متطابقة ومتزامنة" },
  { key: "all", label: "الكل" },
];

export function ReconciliationTable({ rows, counts, busyRowId, onRowAction }: ReconciliationTableProps) {
  const [activeBucket, setActiveBucket] = React.useState<ReconciliationBucket | "all">("matched_unsynced");
  const [courierFilter, setCourierFilter] = React.useState<string>("all");
  const [selectedIds, setSelectedIds] = React.useState<Record<string, boolean>>({});
  const [manualStatusChoice, setManualStatusChoice] = React.useState("CONFIRMED");

  const couriersInResult = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.courierId, r.courierName);
    }
    return Array.from(map.entries());
  }, [rows]);

  const filteredRows = React.useMemo(() => {
    return rows.filter((r) => {
      if (activeBucket !== "all" && r.bucket !== activeBucket) return false;
      if (courierFilter !== "all" && r.courierId !== courierFilter) return false;
      return true;
    });
  }, [rows, activeBucket, courierFilter]);

  const selectedItems = React.useMemo(() => filteredRows.filter((r) => selectedIds[r.id]), [filteredRows, selectedIds]);

  const toggleAllVisible = (checked: boolean) => {
    const next = { ...selectedIds };
    for (const r of filteredRows.slice(0, 200)) {
      if (checked) next[r.id] = true;
      else delete next[r.id];
    }
    setSelectedIds(next);
  };

  return (
    <div className="space-y-3">
      {/* Bucket Tabs + Courier Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={activeBucket}
          onValueChange={(v) => {
            if (v) setActiveBucket(v as ReconciliationBucket | "all");
          }}
        >
          <TabsList className="flex flex-wrap h-auto">
            {BUCKET_META.map((b) => {
              const cnt = b.key === "all" ? rows.length : (counts[b.key] ?? 0);
              return (
                <TabsTrigger key={b.key} value={b.key} className="text-xs gap-1.5">
                  <span>{b.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {cnt}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <Select
          value={courierFilter}
          onValueChange={(val) => {
            if (val) setCourierFilter(val);
          }}
        >
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="فلتر شركة التوصيل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع شركات التوصيل</SelectItem>
            {couriersInResult.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Store-owned returned parcels notice */}
      {(counts.storeOwnedReturnsCount ?? 0) > 0 && (
        <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="size-4 text-orange-600 shrink-0" />
            <span>
              تم رصد <strong>{counts.storeOwnedReturnsCount}</strong> طرد مرتجع غير مسجل في قاعدة المتجر لكنه يحمل
              معرّفات المتجر (بتكلفة ارتجاع إجمالية{" "}
              <strong>{(counts.totalReturnLossDzd ?? 0).toLocaleString()} د.ج</strong>).
            </span>
          </div>
          <Button
            size="xs"
            variant="outline"
            className="border-orange-500/50 text-orange-800 dark:text-orange-200"
            onClick={() => {
              const retItems = rows.filter((r) => r.bucket === "courier_only" && r.isStoreOwnedReturn);
              void onRowAction("import_to_store", retItems);
            }}
          >
            <PlusCircle className="size-3.5 me-1" />
            التقاط وتسجيل كافة المرتجعات للمتجر
          </Button>
        </div>
      )}

      {/* Bulk Controls Bar */}
      {selectedItems.length > 0 && (
        <div className="rounded-lg border bg-primary/5 border-primary/20 p-2.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="default">{selectedItems.length} عنصر محدد</Badge>
          <Button size="xs" variant="outline" onClick={() => void onRowAction("sync_status", selectedItems)}>
            <RefreshCw className="size-3 me-1" />
            مزامنة الحالة إلى المتجر
          </Button>
          <Button size="xs" variant="outline" onClick={() => void onRowAction("import_to_store", selectedItems)}>
            <PlusCircle className="size-3 me-1" />
            إضافة للمتجر
          </Button>
          <Button size="xs" variant="outline" onClick={() => void onRowAction("push_to_courier", selectedItems)}>
            <Send className="size-3 me-1" />
            دفع للشحن (API)
          </Button>
          <Button size="xs" variant="outline" onClick={() => void onRowAction("live_refresh_via_api", selectedItems)}>
            <CopyCheck className="size-3 me-1" />
            فحص حي عبر API Token
          </Button>
          <div className="flex items-center gap-1">
            <Select
              value={manualStatusChoice}
              onValueChange={(v) => {
                if (v) setManualStatusChoice(v);
              }}
            >
              <SelectTrigger className="h-7 w-28 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CONFIRMED">مؤكدة</SelectItem>
                <SelectItem value="DELIVERED">مستلمة</SelectItem>
                <SelectItem value="RETURNED">مرتجعة</SelectItem>
                <SelectItem value="CANCELLED">ملغاة</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="xs"
              variant="secondary"
              onClick={() =>
                void onRowAction("manual_override_status", selectedItems, {
                  manualStatus: manualStatusChoice,
                })
              }
            >
              تطبيق يدوي
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="rounded-xl border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="w-8">
                <Checkbox
                  checked={filteredRows.length > 0 && selectedItems.length === Math.min(filteredRows.length, 200)}
                  onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                />
              </TableHead>
              <TableHead>شركة التوصيل</TableHead>
              <TableHead>التتبع / المرجع</TableHead>
              <TableHead>الزبون والهاتف</TableHead>
              <TableHead>الولاية / السائق</TableHead>
              <TableHead>المبلغ / الارتجاع</TableHead>
              <TableHead>حالة المتجر ⇄ التوصيل</TableHead>
              <TableHead>الملاحظة / التضارب</TableHead>
              <TableHead>إجراءات يدوية</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">
                  لا توجد سجلات في هذا التصنيف.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.slice(0, 200).map((r) => {
                const isBusy = busyRowId === r.id || busyRowId === "bulk";
                return (
                  <TableRow key={r.id} className="text-xs align-top">
                    <TableCell>
                      <Checkbox
                        checked={Boolean(selectedIds[r.id])}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) => {
                            const next = { ...prev };
                            if (v) next[r.id] = true;
                            else delete next[r.id];
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-semibold">
                        {r.courierName}
                      </Badge>
                      {r.sourceFileName && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[110px]">
                          {r.sourceFileName}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]" dir="ltr">
                      <div className="font-bold text-primary">{r.trackingCode || "—"}</div>
                      <div className="text-muted-foreground">{r.storeOrderId || r.reference || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{r.customerName}</div>
                      {r.customerPhone && (
                        <a
                          href={`tel:${r.customerPhone}`}
                          className="font-mono text-[11px] text-primary hover:underline"
                          dir="ltr"
                        >
                          {r.customerPhone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{r.wilayaName}</div>
                      {r.driverName && (
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                          🚚 {r.driverName} {r.driverPhone ? `(${r.driverPhone})` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <div className="font-bold">{r.montantDzd.toLocaleString()} د.ج</div>
                      {r.returnFeeDzd > 0 && (
                        <div className="text-[10px] text-rose-600">ارتجاع: {r.returnFeeDzd} د.ج</div>
                      )}
                    </TableCell>
                    <TableCell className="space-y-1">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          متجر: {r.storeOrderStatus || "غير مسجل"}
                        </Badge>
                        {r.courierStatusAr && (
                          <Badge variant="outline" className="text-[10px]">
                            ناقل: {r.courierStatusAr}
                          </Badge>
                        )}
                      </div>
                      {r.isStoreOwnedReturn && (
                        <Badge className="text-[10px] bg-orange-600 text-white">مرتجع خاص بالمتجر</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] text-[11px] text-muted-foreground">
                      {r.discrepancyReason || "متزامنة بالكامل"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.bucket === "matched_unsynced" && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => void onRowAction("sync_status", [r])}
                          >
                            {isBusy ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3 me-1" />
                            )}
                            مزامنة
                          </Button>
                        )}
                        {r.bucket === "courier_only" && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => void onRowAction("import_to_store", [r])}
                          >
                            <PlusCircle className="size-3 me-1" />
                            إضافة للمتجر
                          </Button>
                        )}
                        {r.bucket === "store_only" && !r.trackingCode && (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => void onRowAction("push_to_courier", [r])}
                          >
                            <Send className="size-3 me-1" />
                            إرسال للشحن
                          </Button>
                        )}
                        {r.trackingCode && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => void onRowAction("live_refresh_via_api", [r])}
                            title="تحديث حي عبر API Token"
                          >
                            <CheckCircle2 className="size-3.5 text-primary" />
                          </Button>
                        )}
                        {r.bucket === "duplicate" && r.storeOrderId && (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() =>
                              void onRowAction("resolve_duplicate", [r], {
                                resolution: "cancel_store_duplicate",
                              })
                            }
                          >
                            حل التكرار
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
