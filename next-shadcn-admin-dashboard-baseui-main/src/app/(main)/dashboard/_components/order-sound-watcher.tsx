"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";
import {
  playNewOrderNotificationSound,
  readSessionKnownOrderIds,
  unlockOrderNotificationAudio,
  writeSessionKnownOrderIds,
} from "@/lib/notifications/order-sound-notifier";
import { fetchOrvaOrders, type OrvaOrder } from "@/lib/orva-api";

/**
 * Watches for genuinely new orders arriving while the admin is logged in.
 * - On initial login / first fetch, silently records all existing order IDs without playing any sound.
 * - On subsequent polls or BroadcastChannel events, plays a single chime if 1+ unseen orders arrive.
 */
export function OrderSoundWatcher() {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const baselineMaxTimestampRef = useRef<number>(0);

  useEffect(() => {
    const handleUserGesture = () => {
      unlockOrderNotificationAudio();
    };
    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let hasSeededBaseline = false;
    knownIdsRef.current = readSessionKnownOrderIds();

    const checkOrders = async () => {
      try {
        const orders: OrvaOrder[] = await fetchOrvaOrders();
        if (!isMounted) return;

        // First fetch on admin login / session mount: silently seed all existing orders
        if (!hasSeededBaseline) {
          let maxTs = baselineMaxTimestampRef.current;
          for (const order of orders) {
            if (order.id) {
              knownIdsRef.current.add(order.id);
            }
            const createdMs = order.createdAt ? new Date(order.createdAt).getTime() : 0;
            if (Number.isFinite(createdMs) && createdMs > maxTs) {
              maxTs = createdMs;
            }
          }
          baselineMaxTimestampRef.current = maxTs || Date.now();
          writeSessionKnownOrderIds(knownIdsRef.current);
          hasSeededBaseline = true;
          return;
        }

        // Subsequent polls after baseline is seeded: detect genuinely new orders
        const newlyArrived: OrvaOrder[] = [];
        for (const order of orders) {
          if (!order.id || knownIdsRef.current.has(order.id)) continue;
          knownIdsRef.current.add(order.id);

          if (order.status !== "deleted" && order.status !== "cancelled") {
            newlyArrived.push(order);
          }
        }

        if (newlyArrived.length > 0) {
          writeSessionKnownOrderIds(knownIdsRef.current);
          playNewOrderNotificationSound();

          const newest = newlyArrived[0];
          const customer = newest.customer ? newest.customer : "زبون جديد";
          const wilaya = newest.wilaya ? newest.wilaya : "";
          const productName = newest.productName ? newest.productName : "";
          toast.add({
            title:
              newlyArrived.length === 1 ? `طلبية جديدة #${newest.id}` : `${newlyArrived.length} طلبيات جديدة وصلت الآن`,
            description:
              newlyArrived.length === 1
                ? `${customer} — ${wilaya} (${productName})`
                : `آخر طلبية: #${newest.id} (${customer})`,
            type: "success",
          });
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    void checkOrders();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void checkOrders();
      }
    }, 15_000);

    const handleSyncEvent = () => {
      void checkOrders();
    };
    window.addEventListener("orva:orders-updated", handleSyncEvent);

    let channel: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        channel = new BroadcastChannel("orva_orders_channel");
        channel.onmessage = (event) => {
          if (event.data?.type === "ORDER_CREATED") {
            void checkOrders();
          }
        };
      }
    } catch {
      // BroadcastChannel unsupported
    }

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("orva:orders-updated", handleSyncEvent);
      if (channel) {
        try {
          channel.close();
        } catch {
          // Ignore close error
        }
      }
    };
  }, []);

  return null;
}
