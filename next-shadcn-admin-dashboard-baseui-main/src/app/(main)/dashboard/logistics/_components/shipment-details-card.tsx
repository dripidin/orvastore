"use strict";
"use client";

import * as React from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  CornerUpLeft,
  Navigation,
  RefreshCw,
  Truck,
  User,
  Warehouse,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractSwitchedOrderDetails } from "@/data/geoalgeria/geo-helper";

interface OrderItem {
  id: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType?: string;
  status: string;
  total: string;
  shippingFee?: string;
  priceNum?: number;
  in_redex?: boolean;
  redex_tracking_code?: string;
  remarks?: any;
  conversions?: any[];
  isSwitched?: boolean;
}

interface ShipmentDetailsCardProps {
  order: OrderItem | null;
  onClose: () => void;
  onOpenSwitch?: (order: OrderItem) => void;
}

export function ShipmentDetailsCard({ order, onClose, onOpenSwitch }: ShipmentDetailsCardProps) {
  const [copied, setCopied] = React.useState(false);

  // All Hooks MUST be called unconditionally at the top of the component (Rules of Hooks)
  const switchedRoute = React.useMemo(() => {
    if (!order) return null;
    return extractSwitchedOrderDetails(order);
  }, [order]);

  const handleCopyTracking = React.useCallback(() => {
    if (!order?.redex_tracking_code) return;
    navigator.clipboard.writeText(order.redex_tracking_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [order?.redex_tracking_code]);

  if (!order) {
    return (
      <Card className="border-border shadow-xs h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground" dir="ltr">
        <Navigation className="size-10 text-muted-foreground/40 mb-2" />
        <span className="font-bold text-sm text-foreground">حدد شحنة من الجدول أو الخريطة</span>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
          انقر على أي ولاية على الخريطة أو اختر طلبية من جدول الشحن بالأسفل لعرض مسار الشحنة من بسكرة وحساب المسافة التقديرية والتسعيرة.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-xs text-right h-full flex flex-col" dir="ltr">
      <CardHeader className="p-4 pb-3 border-b flex flex-row items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs px-2">
              {order.id}
            </Badge>
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
              className="text-[10px] capitalize"
            >
              {order.status}
            </Badge>
            {order.isSwitched && (
              <Badge variant="outline" className="text-[10px] border-purple-500 text-purple-700 bg-purple-500/10 font-semibold">
                محوّلة (Switched)
              </Badge>
            )}
          </div>
          <CardTitle className="text-sm font-bold text-foreground pt-1">
            Shipment Route Details
          </CardTitle>
        </div>

        <Button size="icon" variant="ghost" onClick={onClose} className="size-7">
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="p-4 space-y-4 text-xs flex-1 overflow-y-auto">
        {/* Switched Order 3-Point Audit Section */}
        {switchedRoute && (
          <div className="rounded-lg border border-purple-500/40 bg-purple-500/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-purple-500/20 pb-1.5">
              <span className="font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1.5 text-xs">
                <ArrowLeftRight className="size-3.5" />
                <span>مسار التحويل الجغرافي (3 نقاط)</span>
              </span>
              <Badge variant="outline" className="border-purple-500/40 text-purple-700 text-[10px] font-mono">
                تسلسل #{switchedRoute.conversionSequence}
              </Badge>
            </div>

            <div className="space-y-1.5 text-[11px]">
              {/* Point 1 */}
              <div className="flex justify-between items-center bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                <span className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1">
                  <Warehouse className="size-3 text-amber-600" />
                  <span>1. مركز الانطلاق:</span>
                </span>
                <span className="font-bold font-mono text-amber-700 dark:text-amber-400">
                  {switchedRoute.originHub.label}
                </span>
              </div>

              {/* Point 2 */}
              {switchedRoute.previousDestination && (
                <div className="flex flex-col bg-orange-500/10 p-1.5 rounded border border-orange-500/20 space-y-0.5">
                  <div className="flex justify-between items-center">
                    <span className="text-orange-800 dark:text-orange-300 font-semibold flex items-center gap-1">
                      <CornerUpLeft className="size-3 text-orange-600" />
                      <span>2. الوجهة السابقة (قبل التحويل):</span>
                    </span>
                    <span className="font-mono text-[10px] text-orange-700 font-bold">
                      ~{switchedRoute.distanceHubToPrevKm} كم من Hub
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground pr-4">
                    <span>{switchedRoute.previousDestination.recipientName ?? "مستلم سابق"}</span>
                    <span>
                      {switchedRoute.previousDestination.wilayaName}{" "}
                      {switchedRoute.previousDestination.communeName ? `(${switchedRoute.previousDestination.communeName})` : ""}
                    </span>
                  </div>
                </div>
              )}

              {/* Point 3 */}
              <div className="flex flex-col bg-emerald-500/10 p-1.5 rounded border border-emerald-500/20 space-y-0.5">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-1">
                    <Truck className="size-3 text-emerald-600" />
                    <span>3. الوجهة الجديدة (الحالية):</span>
                  </span>
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">
                    ~{switchedRoute.distanceHubToNewKm} كم من Hub
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground pr-4">
                  <span>{switchedRoute.currentDestination.recipientName}</span>
                  <span>
                    {switchedRoute.currentDestination.wilayaName}{" "}
                    {switchedRoute.currentDestination.communeName ? `(${switchedRoute.currentDestination.communeName})` : ""}
                  </span>
                </div>
              </div>

              {/* Transition Distance & Reason */}
              <div className="border-t border-purple-500/20 pt-1.5 mt-1 space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مسافة التحويل بين الوجهتين:</span>
                  <span className="font-mono font-bold text-foreground">~{switchedRoute.distancePrevToNewKm} كم</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المسؤول عن التحويل:</span>
                  <span className="font-medium text-foreground">{switchedRoute.operator}</span>
                </div>
                <div className="bg-background/80 p-1.5 rounded border text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground">سبب التحويل:</span> {switchedRoute.reason}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recipient info */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex justify-between items-center text-muted-foreground border-b pb-1">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <User className="size-3.5 text-primary" />
              <span>بيانات المستلم</span>
            </span>
            <span className="text-[11px]">{order.deliveryType ?? "غير مسجل"}</span>
          </div>

          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الاسم الكامل:</span>
              <span className="font-semibold text-foreground">{order.customer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم الهاتف:</span>
              <span className="font-mono text-foreground">{order.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الولاية والبلدية:</span>
              <span className="font-medium text-foreground">
                {order.wilaya} {order.commune ? `— ${order.commune}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Financial & Courier Tracking */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-[11px]">
          <span className="font-bold text-foreground block">البيانات المالية وبوليصة التوصيل:</span>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">رسوم الشحن المعتمدة:</span>
              <span className="font-semibold text-foreground">{order.shippingFee ?? "غير متوفر"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">إجمالي التحصيل عند الاستلام (COD):</span>
              <span className="font-bold text-foreground font-mono">{order.total}</span>
            </div>

            {order.redex_tracking_code ? (
              <div className="flex items-center justify-between border-t pt-1.5 mt-1">
                <span className="text-muted-foreground">كود تتبع Redex:</span>
                <div className="flex items-center gap-1.5 font-mono font-bold text-primary">
                  <span>{order.redex_tracking_code}</span>
                  <button
                    type="button"
                    onClick={handleCopyTracking}
                    className="p-1 hover:bg-muted rounded"
                    title="نسخ كود التتبع"
                  >
                    {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-t pt-1.5 mt-1 text-muted-foreground text-[10px]">
                لم يتم إدخال كود تتبع Redex لهذه الشحنة بعد (إدخال يدوي).
              </div>
            )}
          </div>
        </div>

        {/* Quick Action Button */}
        {onOpenSwitch && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenSwitch(order)}
            className="w-full gap-1.5 font-semibold text-xs h-8"
          >
            <RefreshCw className="size-3.5 text-primary" />
            <span>تحويل الطلبية لعنوان آخر (Switch Order)</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
