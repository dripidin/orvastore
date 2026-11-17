"use client";

import { useState } from "react";

import { Bot, Sparkles, X } from "lucide-react";

import { AIChatCard } from "@/components/ui/ai-chat-card";
import { Button } from "@/components/ui/button";

export function FloatingAIChat() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="fade-in slide-in-from-bottom-4 w-[calc(100vw-2.5rem)] max-w-md animate-in duration-200">
          <AIChatCard onClose={() => setIsOpen(false)} />
        </div>
      )}

      <Button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex h-12 items-center gap-2.5 rounded-full border border-emerald-400/30 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-white shadow-xl transition-all hover:scale-105 hover:from-emerald-500 hover:to-teal-500"
        aria-label="فتح مساعد Orva Agent AI"
      >
        {isOpen ? (
          <>
            <X className="size-4" />
            <span className="font-bold text-xs">إغلاق Orva Agent AI</span>
          </>
        ) : (
          <>
            <div className="relative flex items-center justify-center">
              <Bot className="size-5" />
              <Sparkles className="absolute -top-1 -right-1 size-3 text-amber-300" />
            </div>
            <span className="font-bold text-xs">Orva Agent AI</span>
          </>
        )}
      </Button>
    </div>
  );
}
