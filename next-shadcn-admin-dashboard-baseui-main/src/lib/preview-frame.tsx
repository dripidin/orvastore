"use client";

import * as React from "react";

interface PreviewFrameContextValue {
  inPreview: boolean;
  portalContainer: HTMLElement | null;
}

const PreviewFrameContext = React.createContext<PreviewFrameContextValue>({
  inPreview: false,
  portalContainer: null,
});

export function PreviewFrameProvider({
  inPreview = true,
  portalContainer = null,
  children,
}: {
  inPreview?: boolean;
  portalContainer?: HTMLElement | null;
  children: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ inPreview, portalContainer }),
    [inPreview, portalContainer],
  );
  return <PreviewFrameContext.Provider value={value}>{children}</PreviewFrameContext.Provider>;
}

export function usePreviewFrame(): boolean {
  return React.useContext(PreviewFrameContext).inPreview;
}

export function usePreviewPortal(): HTMLElement | null {
  return React.useContext(PreviewFrameContext).portalContainer;
}
