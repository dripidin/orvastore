"use client";

import type { ReactNode } from "react";
import { MapPin, Package, Phone, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SelectedShipmentSummaryProps {
  order: {
    id: string;
    customer: string;
    phone: string;
    wilaya: string;
    commune: string;
    deliveryType?: string;
    status: string;
    total: string;
    shippingFee?: string;
    redex_tracking_code?: string;
    isSwitched?: boolean;
  };
}

export function SelectedShipmentSummary({ order }: SelectedShipmentSummaryProps) {
  const statusVariant = order.status === "delivered" ? "default" : order.status === "returned" ? "destructive" : "secondary";

  return (
    <Card aria-live="polite" className="border-primary/30 bg-primary/5 text-right" dir="ltr">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Package aria-hidden="true" className="size-4 text-primary" />
            Selected Shipment Summary
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            {order.id} · {order.customer || "الاسم غير متوفر"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={statusVariant} className="capitalize">
            {order.status}
          </Badge>
          {order.isSwitched && <Badge variant="outline">محوّل</Badge>}
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <SummaryField icon={<Phone aria-hidden="true" className="size-3.5" />} label="الهاتف">
          {order.phone ? <a className="font-medium text-primary hover:underline" href={`tel:${order.phone.replace(/[^+\d]/g, "")}`}>{order.phone}</a> : "غير متوفر"}
        </SummaryField>
        <SummaryField icon={<MapPin aria-hidden="true" className="size-3.5" />} label="الوجهة">
          {[order.wilaya, order.commune].filter(Boolean).join(" — ") || "غير متوفرة"}
        </SummaryField>
        <SummaryField icon={<Truck aria-hidden="true" className="size-3.5" />} label="التوصيل والشحن">
          {[order.deliveryType, order.shippingFee].filter(Boolean).join(" · ") || "غير متوفر"}
        </SummaryField>
        <SummaryField icon={<Package aria-hidden="true" className="size-3.5" />} label="التحصيل / Redex">
          <span>{order.total || "غير متوفر"}</span>
          {order.redex_tracking_code && <span className="block font-mono text-primary">{order.redex_tracking_code}</span>}
        </SummaryField>
      </CardContent>
    </Card>
  );
}

function SummaryField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="break-words font-medium text-foreground">{children}</div>
    </div>
  );
}
