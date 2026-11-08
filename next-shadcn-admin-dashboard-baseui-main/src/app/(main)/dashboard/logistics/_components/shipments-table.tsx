"use strict";
"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  Truck,
  User,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ALGERIA_WILAYAS } from "@/data/algeria-locations";
import { extractWilayaCode } from "@/data/geoalgeria/geo-helper";

interface OrderItem {
  id: string;
  date?: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType?: string;
  status: string;
  total: string;
  shippingFee?: string;
  in_redex?: boolean;
  redex_tracking_code?: string;
  isSwitched?: boolean;
}

interface ShipmentsTableProps {
  orders: OrderItem[];
  selectedOrderId: string | null;
  onSelectOrder: (order: OrderItem) => void;
  selectedWilayaCode: number | null;
  onSelectWilaya: (code: number | null) => void;
}

export function ShipmentsTable({
  orders,
  selectedOrderId,
  onSelectOrder,
  selectedWilayaCode,
  onSelectWilaya,
}: ShipmentsTableProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [redexFilter, setRedexFilter] = React.useState("all");
  const [page, setPage] = React.useState(0);
  const pageSize = 10;
  const selectedWilaya = React.useMemo(
    () => ALGERIA_WILAYAS.find((wilaya) => Number(wilaya.id) === selectedWilayaCode),
    [selectedWilayaCode],
  );

  React.useEffect(() => {
    if (selectedWilayaCode === null) return;
    setSearchQuery("");
    setStatusFilter("all");
    setRedexFilter("all");
    setPage(0);
  }, [selectedWilayaCode]);

  // Filtered orders list
  const filteredOrders = React.useMemo(() => {
    return orders.filter((o) => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mId = (o.id || "").toLowerCase().includes(q);
        const mName = (o.customer || "").toLowerCase().includes(q);
        const mPhone = (o.phone || "").includes(q);
        const mWilaya = (o.wilaya || "").toLowerCase().includes(q);
        const mCommune = (o.commune || "").toLowerCase().includes(q);
        const mTrack = (o.redex_tracking_code || "").toLowerCase().includes(q);
        if (!mId && !mName && !mPhone && !mWilaya && !mCommune && !mTrack) {
          return false;
        }
      }

      // 2. Wilaya Code Filter (e.g. from Map click or dropdown)
      if (selectedWilayaCode !== null) {
        const c = extractWilayaCode(o.wilaya);
        if (c !== selectedWilayaCode) return false;
      }

      // 3. Status Filter
      if (statusFilter !== "all") {
        if (statusFilter === "switched") {
          if (!o.isSwitched) return false;
        } else {
          const s = (o.status || "").toLowerCase();
          if (statusFilter === "pending" && s !== "pending") return false;
          if (statusFilter === "confirmed" && s !== "confirmed") return false;
          if (statusFilter === "shipped" && s !== "shipped" && !o.in_redex) return false;
          if (statusFilter === "delivered" && s !== "delivered") return false;
          if (statusFilter === "returned" && s !== "returned" && !s.includes("مرتجع") && !s.includes("refus")) return false;
        }
      }

      // 4. Redex Filter
      if (redexFilter === "in_redex" && !o.in_redex && !o.redex_tracking_code) return false;
      if (redexFilter === "not_in_redex" && (o.in_redex || o.redex_tracking_code)) return false;

      return true;
    });
  }, [orders, searchQuery, selectedWilayaCode, statusFilter, redexFilter]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const pageOrders = filteredOrders.slice(page * pageSize, (page + 1) * pageSize);
  const filterKey = `${searchQuery}\u0000${selectedWilayaCode ?? "all"}\u0000${statusFilter}\u0000${redexFilter}`;

  // Reset page when filters change
  React.useEffect(() => {
    if (filterKey) setPage(0);
  }, [filterKey]);

  return (
    <Card className="border-border shadow-xs text-right" dir="ltr">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                <span>Shipments &amp; Delivery Orders</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedWilaya
                  ? `طلبات ولاية ${selectedWilaya.arName} تظهر هنا تلقائيًا عند اختيارها من الخريطة أو القائمة.`
                  : "متابعة وجهات التوصيل، والتسعيرة، وبوليصات Redex، مع ربط كل شحنة بموقعها الجغرافي على الخريطة."}
              </CardDescription>
            </div>

            <span className="text-xs text-muted-foreground font-mono">
              عرض {filteredOrders.length} من أصل {orders.length} شحنة
            </span>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="ابحث بالرقم، الاسم، أو الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Wilaya Filter Dropdown */}
            <div className="w-full sm:w-52">
              <Select
                value={selectedWilayaCode ? String(selectedWilayaCode) : "all"}
                onValueChange={(val) => {
                  if (!val) return;
                  onSelectWilaya(val === "all" ? null : parseInt(val, 10));
                }}
              >
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="تصفية حسب الولاية..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all" className="text-xs font-semibold">
                    جميع الولايات (58 ولاية)
                  </SelectItem>
                  {ALGERIA_WILAYAS.map((w) => (
                    <SelectItem key={w.id} value={w.id} className="text-xs">
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg text-xs overflow-x-auto">
              {[
                { id: "all", label: "الكل" },
                { id: "confirmed", label: "مؤكدة" },
                { id: "shipped", label: "مشحونة" },
                { id: "delivered", label: "مسلّمة" },
                { id: "returned", label: "مرتجعة" },
                { id: "switched", label: "محوّلة (3 نقاط)" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    statusFilter === st.id
                      ? "bg-background text-primary font-bold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Redex Filter */}
            <div className="w-full sm:w-44">
              <Select value={redexFilter} onValueChange={(value) => { if (value) setRedexFilter(value); }}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="حالة بوليصة Redex..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    جميع الشحنات
                  </SelectItem>
                  <SelectItem value="in_redex" className="text-xs">
                    مسجلة لدى Redex
                  </SelectItem>
                  <SelectItem value="not_in_redex" className="text-xs">
                    غير مسجلة بعد
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button if any filter active */}
            {(selectedWilayaCode !== null || searchQuery.trim() !== "" || statusFilter !== "all" || redexFilter !== "all") && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setRedexFilter("all");
                  onSelectWilaya(null);
                }}
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
                <span>مسح الفلاتر</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="text-right">
            <TableHeader className="bg-muted/40 text-xs">
              <TableRow>
                <TableHead className="text-right font-bold py-2.5 px-3">رقم الطلب</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">المستلم والهاتف</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">وجهة التوصيل</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">نقطة الانطلاق</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">نوع التوصيل</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">الحالة التشغيلية</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">بوليصة Redex</TableHead>
                <TableHead className="text-right font-bold py-2.5 px-3">رسوم الشحن</TableHead>
                <TableHead className="text-center font-bold py-2.5 px-3">الخريطة</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="text-xs">
              {pageOrders.length > 0 ? (
                pageOrders.map((order) => {
                  const isSelected = selectedOrderId === order.id;

                  return (
                    <TableRow
                      key={order.id}
                      className={`hover:bg-muted/40 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/10 border-l-4 border-l-primary" : ""
                      }`}
                      onClick={() => onSelectOrder(order)}
                    >
                      <TableCell className="py-2.5 px-3 font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <span>{order.id}</span>
                          {order.isSwitched && (
                            <Badge variant="outline" className="text-[9px] py-0 border-purple-500 text-purple-700 bg-purple-500/10 font-bold">
                              محوّلة (3 نقاط)
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground block">{order.customer}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">{order.phone}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <div className="space-y-0.5">
                          <span className="font-medium text-foreground block">{order.wilaya}</span>
                          {order.commune && (
                            <span className="text-[11px] text-muted-foreground">{order.commune}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <Badge variant="secondary" className="text-[10px] py-0 font-medium">
                          بسكرة (07 - Hub)
                        </Badge>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-[11px]">
                        {order.deliveryType || "توصيل للمنزل"}
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <Badge
                          variant={
                            order.status === "delivered"
                              ? "default"
                              : order.status === "shipped"
                              ? "secondary"
                              : order.status === "returned"
                              ? "destructive"
                              : "outline"
                          }
                          className="text-[10px] py-0 capitalize"
                        >
                          {order.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono text-[11px]">
                        {order.redex_tracking_code ? (
                          <Badge variant="outline" className="text-[10px] py-0 font-mono text-primary border-primary/40">
                            {order.redex_tracking_code}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">يدوي / غير مدخل</span>
                        )}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono font-bold">
                        {order.shippingFee || "غير متوفر"}
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-center">
                        <Button
                          size="xs"
                          variant={isSelected ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOrder(order);
                          }}
                          className="h-7 text-xs gap-1 font-semibold"
                        >
                          <MapPin className="size-3" />
                          <span>{isSelected ? "محدد" : "تحديد"}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-28 text-center text-muted-foreground text-xs">
                    لم يتم العثور على أي شحنات تطابق الفلاتر المحددة.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t text-xs text-muted-foreground">
          <span>
            صفحة {page + 1} من {totalPages}
          </span>

          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-7 text-xs gap-1"
            >
              <ChevronRight className="size-3.5" />
              <span>السابق</span>
            </Button>

            <span className="font-mono text-foreground font-semibold px-2">
              {page + 1} / {totalPages}
            </span>

            <Button
              size="xs"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="h-7 text-xs gap-1"
            >
              <span>التالي</span>
              <ChevronLeft className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
