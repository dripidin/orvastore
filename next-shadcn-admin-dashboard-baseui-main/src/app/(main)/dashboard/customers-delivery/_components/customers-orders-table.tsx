"use client";

import * as React from "react";
import {
  RefreshCw,
  Copy,
  Clock,
  Eye,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrvaOrder } from "@/lib/repository/types";
import type { CourierTrackingResult } from "@/lib/delivery/delivery-tracking-types";
import { resolveOrderTrackingCode } from "@/lib/delivery/delivery-metrics-calculator";
import {
  mapExternalCourierStatus,
  getReceiptClassificationBadge,
} from "@/lib/delivery/courier-status-mapper";
import { maskDemoPhone } from "@/lib/phone-utils";

interface CustomersOrdersTableProps {
  orders: OrvaOrder[];
  trackingMap: Map<string, CourierTrackingResult>;
  onSelectOrderTimeline: (order: OrvaOrder) => void;
  onSelectCustomerDetails: (order: OrvaOrder) => void;
  onRefreshTracking: (orderId: string) => Promise<void>;
  syncingOrderId: string | null;
  isSyncingBulk: boolean;
}

export function CustomersOrdersTable({
  orders,
  trackingMap,
  onSelectOrderTimeline,
  onSelectCustomerDetails,
  onRefreshTracking,
  syncingOrderId,
  isSyncingBulk,
}: CustomersOrdersTableProps) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 12;

  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, currentPage]);

  const handleCopyCode = (code: string) => {
    if (!code || code === "—") return;
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="bg-card rounded-xl border shadow-xs overflow-hidden" dir="ltr">
      <div className="overflow-x-auto">
        <Table className="w-full text-xs">
          <TableHeader className="bg-muted/50 border-b">
            <TableRow>
              <TableHead className="text-right font-bold py-3 text-foreground w-40">اسم الزبون</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-28">رقم الهاتف</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-28">رقم الطلب</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground">المنتج</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-36">الولاية / البلدية</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-24">التاريخ</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-24">المبلغ (COD)</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-24">حالة ORVA</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-36">حالة الناقل (Courier)</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-28">الناقل</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-32">رمز التتبع</TableHead>
              <TableHead className="text-right font-bold py-3 text-foreground w-28">آخر مزامنة</TableHead>
              <TableHead className="text-center font-bold py-3 text-foreground w-32">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-10 text-muted-foreground text-xs">
                  لا توجد طلبات مطابقة لمعايير البحث والفلاتر المحددة.
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrders.map((order) => {
                const tracking = trackingMap.get(order.id);
                const trackingCode = resolveOrderTrackingCode(order) || "—";
                const courierStatusInfo = mapExternalCourierStatus(tracking?.externalStatusCode);
                const isThisSyncing = syncingOrderId === order.id || isSyncingBulk;

                return (
                  <TableRow key={order.id} className="hover:bg-muted/40 transition-colors">
                    {/* Customer Name */}
                    <TableCell className="font-semibold text-foreground py-2.5">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => onSelectCustomerDetails(order)}
                          className="text-right font-semibold text-foreground hover:text-primary transition-colors cursor-pointer text-xs"
                        >
                          {order.customer || "عميل غير معروف"}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {order.deliveryType || "توصيل للمنزل"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Customer Phone */}
                    <TableCell className="font-mono text-foreground text-[11px] py-2.5 whitespace-nowrap">
                      <a href={order.phone ? `tel:${order.phone}` : undefined} className="text-primary hover:underline font-semibold">
                        {order.phone || "—"}
                      </a>
                    </TableCell>

                    {/* Order ID */}
                    <TableCell className="font-mono font-bold text-foreground text-xs py-2.5 whitespace-nowrap">
                      {order.id}
                    </TableCell>

                    {/* Product */}
                    <TableCell className="text-xs py-2.5 max-w-[150px] truncate" title={order.productName || "—"}>
                      {order.productName || "—"}
                    </TableCell>

                    {/* Wilaya / Commune */}
                    <TableCell className="text-xs py-2.5">
                      <div className="truncate max-w-[130px]" title={`${order.wilaya || "—"} - ${order.commune || "—"}`}>
                        <span className="font-medium">{order.wilaya || "—"}</span>
                        <span className="text-[10px] text-muted-foreground block">{order.commune || "—"}</span>
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="text-[11px] text-muted-foreground py-2.5 whitespace-nowrap font-mono">
                      {order.createdAt ? order.createdAt.slice(0, 10) : "—"}
                    </TableCell>

                    {/* COD Amount */}
                    <TableCell className="text-xs font-bold py-2.5 whitespace-nowrap">
                      {order.grandTotalDzd ? `${order.grandTotalDzd.toLocaleString()} دج` : "—"}
                    </TableCell>

                    {/* Internal ORVA Status */}
                    <TableCell className="py-2.5 whitespace-nowrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold bg-secondary/80 text-secondary-foreground">
                        {order.status}
                      </span>
                    </TableCell>

                    {/* External Courier Status */}
                    <TableCell className="py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${courierStatusInfo.badgeClass}`}>
                        {courierStatusInfo.labelAr}
                      </span>
                    </TableCell>

                    {/* Courier Name */}
                    <TableCell className="text-xs font-medium py-2.5 whitespace-nowrap">
                      {tracking?.courierName || (trackingCode.startsWith("RDX") ? "Redex DZ" : trackingCode.startsWith("ECO") ? "Ecotrack DZ" : "—")}
                    </TableCell>

                    {/* Tracking Code */}
                    <TableCell className="py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="font-semibold">{trackingCode}</span>
                        {trackingCode !== "—" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleCopyCode(trackingCode)}
                            title="نسخ رمز التتبع"
                            className="size-5"
                          >
                            <Copy className="size-2.5" />
                          </Button>
                        )}
                        {copiedId === trackingCode && (
                          <span className="text-[9px] text-emerald-600 font-bold">نسخ!</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Last Sync */}
                    <TableCell className="text-[10px] text-muted-foreground py-2.5 whitespace-nowrap font-mono">
                      {tracking?.lastSyncedAt ? tracking.lastSyncedAt.slice(11, 19) : "—"}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onSelectCustomerDetails(order)}
                          title="عرض تفاصيل العميل والطلبات"
                          className="size-7 text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="size-3.5" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onSelectOrderTimeline(order)}
                          title="عرض المخطط الزمني للتسليم"
                          className="size-7 text-primary hover:bg-primary/10"
                        >
                          <Truck className="size-3.5" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRefreshTracking(order.id)}
                          disabled={isThisSyncing}
                          title="تحديث حالة التتبع (Mock Sync)"
                          className="size-7 text-muted-foreground hover:text-foreground"
                        >
                          <RefreshCw className={`size-3.5 ${isThisSyncing ? "animate-spin text-primary" : ""}`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground">
          <span>
            الصفحة {currentPage} من أصل {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronRight className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronLeft className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
