"use client";

import { Suspense, useEffect } from "react";

import { usePathname, useSearchParams } from "next/navigation";

import { captureAttributionFromUrl } from "@/lib/analytics/attribution-tracker";

function AttributionCaptureInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    captureAttributionFromUrl(query ? `?${query}` : undefined, pathname);
  }, [pathname, searchParams]);

  return null;
}

export function AttributionCapture() {
  return (
    <Suspense fallback={null}>
      <AttributionCaptureInner />
    </Suspense>
  );
}
