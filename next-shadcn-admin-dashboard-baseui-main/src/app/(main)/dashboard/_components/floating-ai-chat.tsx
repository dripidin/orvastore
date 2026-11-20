"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Bot, GripVertical, Sparkles, X } from "lucide-react";

import { AIChatCard } from "@/components/ui/ai-chat-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WidgetOffset {
  right: number;
  bottom: number;
}

const DEFAULT_OFFSET: WidgetOffset = { right: 20, bottom: 20 };
const STORAGE_KEY = "orva_ai_widget_offset_v1";
const VIEWPORT_MARGIN = 12;
const DRAG_THRESHOLD_PX = 6;

export function FloatingAIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [offset, setOffset] = useState<WidgetOffset>(DEFAULT_OFFSET);
  const [isDragging, setIsDragging] = useState(false);
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<WidgetOffset>(offset);
  const dragSessionRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const clampOffset = useCallback((candidate: WidgetOffset): WidgetOffset => {
    if (typeof window === "undefined") return candidate;
    const rect = containerRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 160;
    const height = rect?.height ?? 48;

    const maxRight = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const maxBottom = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);

    return {
      right: Math.min(Math.max(VIEWPORT_MARGIN, candidate.right), maxRight),
      bottom: Math.min(Math.max(VIEWPORT_MARGIN, candidate.bottom), maxBottom),
    };
  }, []);

  // Load persisted position once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WidgetOffset>;
        if (typeof parsed.right === "number" && typeof parsed.bottom === "number") {
          setOffset(clampOffset({ right: parsed.right, bottom: parsed.bottom }));
        }
      }
    } catch {
      // Ignore storage read errors
    } finally {
      setHasLoadedStorage(true);
    }
  }, [clampOffset]);

  // Keep the widget inside the viewport whenever size/open-state/window changes
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const syncClamp = () => {
      setOffset((prev) => {
        const clamped = clampOffset(prev);
        if (clamped.right === prev.right && clamped.bottom === prev.bottom) return prev;
        return clamped;
      });
    };

    syncClamp();

    const el = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => syncClamp());
      observer.observe(el);
    }

    window.addEventListener("resize", syncClamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncClamp);
    };
  }, [isOpen, clampOffset]);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-drag='true']")) return;

      dragSessionRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startRight: offsetRef.current.right,
        startBottom: offsetRef.current.bottom,
        moved: false,
      };
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        session.moved = true;
      }

      if (session.moved) {
        const next = clampOffset({
          right: session.startRight - dx,
          bottom: session.startBottom - dy,
        });
        setOffset(next);
      }
    };

    const finishDrag = () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      setIsDragging(false);

      if (session?.moved) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 80);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(offsetRef.current));
        } catch {
          // Ignore storage write errors
        }
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [isDragging, clampOffset]);

  const handleToggleOpen = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setIsOpen((prev) => !prev);
  };

  const handleResetPosition = useCallback(() => {
    const clamped = clampOffset(DEFAULT_OFFSET);
    setOffset(clamped);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, [clampOffset]);

  const isCustomPositioned =
    hasLoadedStorage && (offset.right !== DEFAULT_OFFSET.right || offset.bottom !== DEFAULT_OFFSET.bottom);

  return (
    <div
      ref={containerRef}
      style={{
        right: `${offset.right}px`,
        bottom: `${offset.bottom}px`,
      }}
      className={cn(
        "fixed z-50 flex flex-col items-end gap-2.5 max-w-[calc(100vw-1.5rem)]",
        isDragging ? "transition-none" : "transition-[right,bottom] duration-150 ease-out",
      )}
    >
      {isOpen && (
        <div className="fade-in slide-in-from-bottom-4 max-w-full animate-in duration-200">
          <AIChatCard
            onClose={() => setIsOpen(false)}
            onHeaderPointerDown={startDrag}
            onResetPosition={handleResetPosition}
            isDragging={isDragging}
            isCustomPositioned={isCustomPositioned}
          />
        </div>
      )}

      <Button
        type="button"
        onPointerDown={startDrag}
        onClick={handleToggleOpen}
        className={cn(
          "group relative flex h-11 sm:h-12 touch-none select-none items-center gap-2 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 sm:px-4 text-white shadow-xl transition-transform hover:from-emerald-500 hover:to-teal-500",
          isDragging ? "cursor-grabbing scale-105 shadow-2xl" : "cursor-grab hover:scale-[1.03]",
        )}
        aria-label="فتح أو تحريك مساعد Orva Agent AI"
        title="انقر لفتح المحادثة أو اسحب للتحريك بحرية على الشاشة"
      >
        <GripVertical className="size-3.5 shrink-0 opacity-70" />
        {isOpen ? (
          <>
            <X className="size-4 shrink-0" />
            <span className="font-bold text-xs whitespace-nowrap">إغلاق Orva Agent AI</span>
          </>
        ) : (
          <>
            <div className="relative flex items-center justify-center shrink-0">
              <Bot className="size-5" />
              <Sparkles className="absolute -top-1 -right-1 size-3 text-amber-300" />
            </div>
            <span className="font-bold text-xs whitespace-nowrap">Orva Agent AI</span>
          </>
        )}
      </Button>
    </div>
  );
}
