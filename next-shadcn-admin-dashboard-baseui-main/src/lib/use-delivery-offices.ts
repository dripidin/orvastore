"use client";

import * as React from "react";

export interface DeliveryOfficeCommune {
  ar: string;
  fr: string;
}

export type DeliveryOfficesState =
  | { status: "loading"; offices: DeliveryOfficeCommune[] }
  | { status: "ready"; offices: DeliveryOfficeCommune[] }
  /** EcoTrack data unavailable: callers fall back to the wilaya-level stop-desk rule. */
  | { status: "unknown"; offices: DeliveryOfficeCommune[] };

const clientCache = new Map<number, DeliveryOfficeCommune[] | null>();

/** Loads the communes of a wilaya that have a delivery office (EcoTrack stop-desk). */
export function useDeliveryOffices(wilayaCode: number): DeliveryOfficesState & {
  hasOffice: (communeAr: string) => boolean | null;
} {
  const [state, setState] = React.useState<DeliveryOfficesState>({ status: "loading", offices: [] });

  React.useEffect(() => {
    if (!wilayaCode) return;
    const cached = clientCache.get(wilayaCode);
    if (cached !== undefined) {
      setState(cached ? { status: "ready", offices: cached } : { status: "unknown", offices: [] });
      return;
    }

    let cancelled = false;
    setState({ status: "loading", offices: [] });
    fetch(`/api/delivery-offices?wilaya=${wilayaCode}`)
      .then((r) => r.json())
      .then((d) => {
        const offices: DeliveryOfficeCommune[] | null = d?.success && Array.isArray(d.offices) ? d.offices : null;
        clientCache.set(wilayaCode, offices);
        if (!cancelled) setState(offices ? { status: "ready", offices } : { status: "unknown", offices: [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unknown", offices: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [wilayaCode]);

  const officeSet = React.useMemo(() => new Set(state.offices.map((o) => o.ar.trim())), [state.offices]);

  const hasOffice = React.useCallback(
    (communeAr: string): boolean | null => {
      if (state.status !== "ready") return null;
      return officeSet.has(communeAr.trim());
    },
    [state.status, officeSet],
  );

  return { ...state, hasOffice };
}
