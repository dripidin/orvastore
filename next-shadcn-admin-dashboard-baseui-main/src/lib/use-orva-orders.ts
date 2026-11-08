"use client";

import * as React from "react";

import { fetchOrvaOrders, type OrvaOrder } from "@/lib/orva-api";

interface UseOrvaOrdersOptions {
  pollingIntervalMs?: number;
}

export function useOrvaOrders({ pollingIntervalMs = 0 }: UseOrvaOrdersOptions = {}) {
  const [state, setState] = React.useState({
    orders: [] as OrvaOrder[],
    isLoading: true,
    isRefreshing: false,
    hasLoaded: false,
    lastUpdated: null as Date | null,
    error: null as string | null,
  });
  const latestRequestId = React.useRef(0);

  const refresh = React.useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setState((current) => ({
      ...current,
      isLoading: !current.hasLoaded,
      isRefreshing: current.hasLoaded,
      error: null,
    }));

    try {
      const orders = await fetchOrvaOrders();
      if (requestId !== latestRequestId.current) return;

      setState((current) => ({
        ...current,
        orders,
        hasLoaded: true,
        lastUpdated: new Date(),
        error: null,
      }));
    } catch (reason) {
      if (requestId !== latestRequestId.current) return;

      setState((current) => ({
        ...current,
        error: reason instanceof Error ? reason.message : "تعذر تحميل بيانات الطلبات.",
      }));
    } finally {
      if (requestId === latestRequestId.current) {
        setState((current) => ({ ...current, isLoading: false, isRefreshing: false }));
      }
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleSync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh();
      }, 50);
    };
    window.addEventListener("orva:orders-updated", handleSync);
    window.addEventListener("orva:repository-mode-changed", handleSync);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("orva:orders-updated", handleSync);
      window.removeEventListener("orva:repository-mode-changed", handleSync);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (pollingIntervalMs <= 0) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const intervalId = window.setInterval(refreshWhenVisible, pollingIntervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [pollingIntervalMs, refresh]);


  return { ...state, refresh };
}
