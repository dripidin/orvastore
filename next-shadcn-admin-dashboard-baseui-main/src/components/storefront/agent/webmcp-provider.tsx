"use client";

import { useEffect } from "react";

import type { NavProduct } from "@/lib/catalog/types";

interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

interface NavigatorModelContext {
  registerTool?: (tool: WebMcpToolDefinition) => void;
  unregisterTool?: (name: string) => void;
}

declare global {
  interface Navigator {
    modelContext?: NavigatorModelContext;
  }
}

const REGISTERED_TOOLS_KEY = "__orva_webmcp_registered__";

/**
 * Registers public storefront read-only WebMCP tools when the visitor's browser
 * exposes navigator.modelContext (WebMCP API).
 */
export function WebMcpProvider({ products = [] }: { products?: NavProduct[] }) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    const modelContext = navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== "function") return;

    const regWindow = window as unknown as Record<string, boolean | undefined>;
    if (regWindow[REGISTERED_TOOLS_KEY]) return;

    const catalogSnapshot = products.map((p) => ({
      id: p.id,
      title: p.title,
      priceDzd: p.priceDzd,
      url: `https://orva-store.com${p.route}`,
    }));

    const tools: WebMcpToolDefinition[] = [
      {
        name: "list_orva_products",
        description: "List ORVA Store Algeria workshop tool packs with live DZD prices and product page URLs.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Optional filter keyword for product title.",
            },
          },
        },
        execute: async (input) => {
          const q = String(input.query ?? "")
            .trim()
            .toLowerCase();
          const filtered = q ? catalogSnapshot.filter((item) => item.title.toLowerCase().includes(q)) : catalogSnapshot;
          return {
            content: [{ type: "text", text: JSON.stringify({ count: filtered.length, products: filtered }) }],
          };
        },
      },
      {
        name: "get_wilaya_delivery_fees",
        description: "Get Cash-on-Delivery shipping fee in DZD (home Domicile and Stop Desk) for an Algerian wilaya (1-58).",
        inputSchema: {
          type: "object",
          properties: {
            wilayaCode: {
              type: "integer",
              minimum: 1,
              maximum: 58,
              description: "Wilaya number between 1 and 58.",
            },
          },
          required: ["wilayaCode"],
        },
        execute: async (input) => {
          const code = Number(input.wilayaCode);
          const res = await fetch("/api/delivery-fees");
          const data = (await res.json()) as { fees?: Record<string, { domicile?: number; stopdesk?: number }> };
          const fee = data.fees?.[String(code)] ?? null;
          return {
            content: [{ type: "text", text: JSON.stringify({ wilayaCode: code, fee }) }],
          };
        },
      },
      {
        name: "submit_product_request",
        description: "Submit a customer request to source a workshop tool or hardware product not yet listed on ORVA Store.",
        inputSchema: {
          type: "object",
          properties: {
            customerName: { type: "string", description: "Customer name" },
            productWanted: { type: "string", description: "Requested product or tool" },
            phone: { type: "string", description: "Optional Algerian phone number" },
            wilaya: { type: "string", description: "Optional wilaya" },
          },
          required: ["customerName", "productWanted"],
        },
        execute: async (input) => {
          const res = await fetch("/api/product-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const json = await res.json();
          return {
            content: [{ type: "text", text: JSON.stringify(json) }],
          };
        },
      },
    ];

    try {
      for (const tool of tools) {
        modelContext.registerTool(tool);
      }
      regWindow[REGISTERED_TOOLS_KEY] = true;
    } catch {
      // Fail safely if browser extension/host partially implements modelContext
    }

    return () => {
      if (typeof modelContext.unregisterTool === "function") {
        for (const tool of tools) {
          try {
            modelContext.unregisterTool(tool.name);
          } catch {
            // Ignore cleanup errors
          }
        }
        regWindow[REGISTERED_TOOLS_KEY] = false;
      }
    };
  }, [products]);

  return null;
}
