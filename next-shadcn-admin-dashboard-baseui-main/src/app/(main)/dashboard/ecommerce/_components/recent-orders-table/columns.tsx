"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Subscribe } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  MoreHorizontal,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataTableFeatures } from "@/lib/data-table-features";
import { maskDemoPhone } from "@/lib/phone-utils";

import type { OrderRow } from "./schema";

const allowedStatusTransitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "pending"],
  pushed: ["cancelled", "delivered", "returned"],
  redex_station: ["cancelled", "delivered", "returned"],
  shipped: ["cancelled", "delivered", "returned"],
  cancelled: ["pending"],
  returned: ["pending"],
};

function formatOrderDate(date: string) {
  try {
    if (!date) return "-";
    const d = typeof date === "string" ? parseISO(date) : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return format(d, "dd MMM yyyy, HH:mm");
  } catch (e) {
    return String(date || "-");
  }
}

function OperationalStatusBadge({
  status,
  inRedex,
  carrierStatus,
}: {
  status: string;
  inRedex?: boolean;
  carrierStatus?: string | null;
}) {
  const s = (status || "").toLowerCase();
  const cs = (carrierStatus || "").toLowerCase();

  if (s === "delivered") {
    return (
      <Badge
        variant="outline"
        className="border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-300 font-semibold gap-1 text-[11px]"
      >
        <span className="size-1.5 rounded-full bg-green-600" />
        مسلّمة (Delivered)
      </Badge>
    );
  }

  if (s === "cancelled" || s === "canceled" || s === "deleted") {
    return (
      <Badge
        variant="outline"
        className="border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300 font-semibold gap-1 text-[11px]"
      >
        <XCircle className="size-3" />
        Canceled
      </Badge>
    );
  }

  if (s === "returned") {
    return (
      <Badge
        variant="outline"
        className="border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 font-semibold gap-1 text-[11px]"
      >
        <RotateCcw className="size-3" />
        مرتجعة / مرفوضة (Returned)
      </Badge>
    );
  }

  if (s === "redex_station" || cs === "vers_station" || cs === "vers_hub") {
    return (
      <Badge
        variant="outline"
        className="border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold gap-1 text-[11px]"
      >
        <Truck className="size-3" />
        Redex Station
      </Badge>
    );
  }

  if (
    s === "shipped" ||
    cs === "en_ramassage" ||
    cs === "picked" ||
    cs === "accepted_by_carrier" ||
    cs === "en_hub" ||
    cs === "vers_wilaya" ||
    cs === "en_preparation" ||
    cs === "en_livraison" ||
    cs === "dispatched_to_driver"
  ) {
    return (
      <Badge
        variant="outline"
        className="border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold gap-1 text-[11px]"
      >
        <Truck className="size-3" />
        مشحونة (Shipped)
      </Badge>
    );
  }

  if (
    s === "pushed" ||
    inRedex ||
    cs === "prete_a_expedier" ||
    cs === "order_information_received_by_carrier" ||
    cs === "notification_on_order"
  ) {
    return (
      <Badge
        variant="outline"
        className="border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold gap-1 text-[11px]"
      >
        <Truck className="size-3" />
        Pushed to Redex
      </Badge>
    );
  }

  if (s === "confirmed") {
    return (
      <Badge
        variant="outline"
        className="border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold gap-1 text-[11px]"
      >
        <CheckCircle2 className="size-3" />
        Confirmed not pushed
      </Badge>
    );
  }

  if (s === "review" || s === "قيد المراجعة") {
    return (
      <Badge
        variant="outline"
        className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold gap-1 text-[11px]"
      >
        <AlertCircle className="size-3 text-amber-600" />
        قيد المراجعة (Review)
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold gap-1 text-[11px]"
    >
      <span className="size-1.5 rounded-full bg-amber-500" />
      قيد الانتظار (Pending)
    </Badge>
  );
}

function SwitchStatusBadge({ isSwitched, count }: { isSwitched: boolean; count: number }) {
  if (isSwitched) {
    return (
      <Badge
        variant="outline"
        className="border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold gap-1 text-[11px]"
      >
        <RefreshCw className="size-3" />
        محوّل (#{count})
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-border text-muted-foreground text-[10px] py-0">
      أصلي
    </Badge>
  );
}

export function createRecentOrdersColumns(
  onViewDetails?: (order: OrderRow) => void,
  onSwitchOrder?: (order: OrderRow) => void,
  onUpdateStatus?: (orderId: string, newStatus: string) => void,
  pendingStatusById: Record<string, boolean> = {},
  onCopyOrderId?: (orderId: string) => void,
  onPushOrder?: (order: OrderRow) => void,
  onViewRisk?: (order: OrderRow) => void,
): ColumnDef<DataTableFeatures, OrderRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="w-8">
          <Subscribe source={table.atoms.rowSelection}>
            {() => (
              <Checkbox
                aria-label="Select all orders"
                checked={table.getIsAllPageRowsSelected()}
                indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
              />
            )}
          </Subscribe>
        </div>
      ),
      cell: ({ row }) => (
        <div className="w-8">
          <Subscribe source={row.table.atoms.rowSelection} selector={(selection) => Boolean(selection?.[row.id])}>
            {(checked) => (
              <Checkbox
                aria-label={`Select order ${row.original.id}`}
                checked={checked}
                onCheckedChange={(value) => row.toggleSelected(value)}
              />
            )}
          </Subscribe>
        </div>
      ),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "id",
      header: "رقم الطلبية (Order ID)",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <div className="font-mono font-bold text-xs flex items-center gap-1.5 text-foreground">
            <button
              type="button"
              className="cursor-pointer hover:underline text-primary"
              onClick={() => onViewDetails && onViewDetails(row.original)}
              title="عرض التفاصيل"
            >
              {row.original.id}
            </button>
          </div>
          <div className="text-muted-foreground text-[11px] truncate max-w-[140px]" title={row.original.items}>
            {row.original.items}
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: "customer",
      header: "الزبون والاتصال (Customer)",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <div className="font-semibold text-xs text-foreground">{row.original.customer}</div>
          <div className="text-muted-foreground font-mono text-[11px] flex items-center gap-1.5">
            <a
              href={row.original.phone ? `tel:${row.original.phone}` : undefined}
              className="text-primary hover:underline font-mono font-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.phone || "—"}
            </a>
          </div>
        </div>
      ),
    },
    {
      id: "location",
      header: "الولاية والبلدية (Location)",
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium text-foreground">{row.original.wilaya || "-"}</span>
          <span className="text-[11px] text-muted-foreground">{row.original.commune || "-"}</span>
        </div>
      ),
    },
    {
      id: "statusSummary",
      header: "الحالة والتحويل (Status & Switch)",
      cell: ({ row }) => {
        const score = row.original.riskScore || 0;
        const decision = row.original.riskDecision || "ALLOW";
        const riskHot =
          score >= 40 ||
          row.original.riskLevel === "HIGH" ||
          decision === "BLOCK" ||
          decision === "REVIEW";
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <OperationalStatusBadge
              status={row.original.status}
              inRedex={row.original.in_redex}
              carrierStatus={row.original.carrier_status}
            />
            <SwitchStatusBadge
              isSwitched={row.original.isSwitched}
              count={row.original.conversionCount}
            />
            <button
              type="button"
              className="inline-flex"
              onClick={() => onViewRisk?.(row.original)}
              title={(row.original.riskReasons || []).join(" · ") || "Risk score"}
            >
              <Badge
                variant="outline"
                className={
                  riskHot
                    ? "border-rose-300 bg-rose-50 text-rose-700 text-[10px] cursor-pointer"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] cursor-pointer"
                }
              >
                {riskHot ? `⚠ ${score}/100` : `✓ ${score || 0}`}
              </Badge>
            </button>
          </div>
        );
      },
      filterFn: (row, _columnId, value) => {
        if (!value || value === "All") return true;
        const s = (row.original.status || "").toLowerCase();
        const score = row.original.riskScore || 0;

        if (value === "Pending") return s === "pending" || s === "review" || s === "قيد الانتظار" || s === "قيد المراجعة";
        if (value === "Confirmed") return s === "confirmed" && !row.original.in_redex;
        if (value === "Pushed to Redex") {
          const cs = (row.original.carrier_status || "").toLowerCase();
          return (
            s === "pushed" ||
            (Boolean(row.original.in_redex) &&
              s !== "redex_station" &&
              cs !== "vers_station" &&
              cs !== "vers_hub" &&
              s !== "shipped" &&
              s !== "delivered" &&
              s !== "returned" &&
              s !== "cancelled")
          );
        }
        if (value === "Redex Station") {
          const cs = (row.original.carrier_status || "").toLowerCase();
          return s === "redex_station" || cs === "vers_station" || cs === "vers_hub";
        }
        if (value === "Shipped") return s === "shipped" || Boolean(row.original.in_redex);
        if (value === "Delivered") return s === "delivered";
        if (value === "Cancelled") return s === "cancelled" || s === "deleted";
        if (value === "Switched Only") return row.original.isSwitched;
        if (value === "Risk") {
          return (
            score >= 40 ||
            row.original.riskLevel === "HIGH" ||
            row.original.riskDecision === "BLOCK" ||
            row.original.riskDecision === "REVIEW" ||
            s === "review"
          );
        }

        return true;
      },
    },
    {
      accessorKey: "total",
      header: () => <div className="text-left w-24">المبلغ (Total)</div>,
      cell: ({ row }) => (
        <div className="w-24 text-left font-bold text-xs tabular-nums text-foreground">
          {row.original.total}
        </div>
      ),
    },
    {
      accessorKey: "date",
      header: () => <div className="w-36">التاريخ (Date)</div>,
      cell: ({ row }) => (
        <div className="w-36 text-muted-foreground text-[11px]">{formatOrderDate(row.original.date)}</div>
      ),
    },
    {
      id: "actions",
      header: () => <div className="flex w-full justify-end">الإجراءات</div>,
      cell: ({ row }) => {
        const isTerminal = ["delivered", "deleted", "reconciled"].includes(
          (row.original.status || "").toLowerCase()
        );
        const availableStatuses = allowedStatusTransitions[row.original.status] ?? [];
        const isUpdating = Boolean(pendingStatusById[row.original.id]);

        return (
          <div className="flex w-full justify-end items-center gap-1">
            {/* Direct Switch Order Button in Row */}
            <Button
              size="xs"
              variant="outline"
              onClick={() => onSwitchOrder && onSwitchOrder(row.original)}
              disabled={isTerminal || isUpdating}
              className={`gap-1 font-medium text-[11px] h-7 px-2 ${
                isTerminal
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-primary/10 hover:text-primary hover:border-primary/40 text-foreground"
              }`}
              title={isTerminal ? "لا يمكن تحويل الطلبات المسلّمة نهائياً" : "تحويل مسار الطلبية (تحويل الطلبية)"}
            >
              <RefreshCw className="size-3 text-primary" />
              <span>تحويل</span>
            </Button>

            {/* Direct Push / Expedition Button in Row beside Switch Button */}
            <Button
              size="xs"
              variant={row.original.in_redex || row.original.redex_tracking_code ? "secondary" : "outline"}
              onClick={() => onPushOrder && onPushOrder(row.original)}
              disabled={isTerminal || isUpdating}
              className={`gap-1 font-medium text-[11px] h-7 px-2 ${
                isTerminal
                  ? "opacity-40 cursor-not-allowed"
                  : row.original.in_redex || row.original.redex_tracking_code
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                    : "hover:bg-emerald-500/10 hover:text-emerald-600 hover:border-emerald-500/40 text-foreground"
              }`}
              title={
                row.original.redex_tracking_code
                  ? `مرسل لشركة التوصيل (${row.original.redex_tracking_code})`
                  : isTerminal
                    ? "لا يمكن إرسال الطلبات الملغاة"
                    : "إرسال الطلبية لشركة التوصيل عبر API (Push Order)"
              }
            >
              <Truck className={`size-3 ${row.original.in_redex || row.original.redex_tracking_code ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-500"}`} />
              <span>{row.original.in_redex || row.original.redex_tracking_code ? "مُرسل" : "Push"}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button aria-label="Open order actions" size="icon-xs" variant="ghost" className="h-7 w-7" />}>
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 text-right" dir="ltr">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">Order Actions</DropdownMenuLabel>
                  {onViewDetails && (
                    <DropdownMenuItem
                      onClick={() => onViewDetails(row.original)}
                      className="cursor-pointer font-medium flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="size-3.5 text-primary" />
                        <span>View Order Details</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {onUpdateStatus && availableStatuses.includes("confirmed") && (
                    <DropdownMenuItem
                      onClick={() => onUpdateStatus(row.original.id, "confirmed")}
                      disabled={isUpdating}
                      className="cursor-pointer font-semibold flex items-center justify-between text-xs text-blue-700 dark:text-blue-300"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-blue-600" />
                        <span>تأكيد الطلبية (Confirm)</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {onUpdateStatus && availableStatuses.includes("cancelled") && (
                    <DropdownMenuItem
                      onClick={() => onUpdateStatus(row.original.id, "cancelled")}
                      disabled={isUpdating}
                      className="cursor-pointer font-semibold flex items-center justify-between text-xs text-red-700 dark:text-red-300"
                    >
                      <div className="flex items-center gap-2">
                        <XCircle className="size-3.5 text-red-600" />
                        <span>إلغاء الطلبية (Cancel)</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {onUpdateStatus && availableStatuses.includes("pending") && (
                    <DropdownMenuItem
                      onClick={() => onUpdateStatus(row.original.id, "pending")}
                      disabled={isUpdating}
                      className="cursor-pointer flex items-center justify-between text-xs text-amber-700 dark:text-amber-300"
                    >
                      <div className="flex items-center gap-2">
                        <RotateCcw className="size-3.5 text-amber-600" />
                        <span>إعادة لقيد الانتظار (Pending)</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {onUpdateStatus && availableStatuses.includes("delivered") && (
                    <DropdownMenuItem
                      onClick={() => onUpdateStatus(row.original.id, "delivered")}
                      disabled={isUpdating}
                      className="cursor-pointer font-semibold flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        <span>مستلمة (Received)</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  {onUpdateStatus && availableStatuses.includes("returned") && (
                    <DropdownMenuItem
                      onClick={() => onUpdateStatus(row.original.id, "returned")}
                      disabled={isUpdating}
                      className="cursor-pointer font-semibold flex items-center justify-between text-xs text-orange-700 dark:text-orange-300"
                    >
                      <div className="flex items-center gap-2">
                        <RotateCcw className="size-3.5 text-orange-600" />
                        <span>مرتجعة (Returned)</span>
                      </div>
                    </DropdownMenuItem>
                  )}
                  {row.original.redex_tracking_code && (
                    <DropdownMenuItem
                      onClick={() => window.open(`/api/delivery?action=label_pdf&tracking=${encodeURIComponent(row.original.redex_tracking_code!)}`, '_blank')}
                      className="cursor-pointer font-semibold text-purple-600 dark:text-purple-400 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Printer className="size-3.5" />
                        <span>طباعة بوليصة الشحن (PDF)</span>
                      </div>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => onCopyOrderId?.(row.original.id)}
                    disabled={!onCopyOrderId}
                    className="cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Copy className="size-3.5" />
                      <span>نسخ رقم الطلبية</span>
                    </div>
                  </DropdownMenuItem>

                  {row.original.phone && (
                    <DropdownMenuItem
                      onClick={() => window.open(`tel:${row.original.phone}`)}
                      className="cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Phone className="size-3.5" />
                        <span>اتصال بالزبون</span>
                      </div>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableHiding: false,
      enableSorting: false,
    },
  ];
}

export const recentOrdersColumns = createRecentOrdersColumns();
