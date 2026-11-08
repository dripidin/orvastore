"use client";

import * as React from "react";
import { OrderRerouteDialog } from "@/components/dashboard/orders/order-reroute-dialog";
import type { OrderRow } from "./recent-orders-table/schema";

export interface OrderSwitchDialogProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderSwitched?: (updatedOrder: OrderRow, redexComment: string) => void;
  allOrders?: OrderRow[];
}

export function OrderSwitchDialog({
  order,
  open,
  onOpenChange,
  onOrderSwitched,
}: OrderSwitchDialogProps) {
  return (
    <OrderRerouteDialog
      order={order}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={(result) => {
        if (onOrderSwitched && order) {
          const updated: OrderRow = {
            ...order,
            isSwitched: true,
            conversionCount: (order.conversionCount || 0) + 1,
            conversions: [
              ...(order.conversions || []),
              {
                event: "ORDER_CONVERSION",
                switch_status: "switched",
                conversion_sequence: result.sequence,
                timestamp_utc: result.timestampUtc,
                operator: "Admin",
                reason: "تحويل مسار الطلبية (تحويل الطلبية)",
              },
            ],
          };
          onOrderSwitched(updated, result.formattedCourierNote);
        }
      }}
    />
  );
}
