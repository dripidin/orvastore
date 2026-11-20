import { NextRequest, NextResponse } from "next/server";

import { listPublishedProducts } from "@/lib/catalog/server";
import { getDeliveryFees } from "@/lib/delivery-fees";
import {
  ORVA_CANONICAL_ORIGIN,
  ORVA_CONTACT_EMAIL,
  ORVA_CONTACT_PHONE,
  ORVA_WHATSAPP_URL,
} from "@/lib/seo/storefront-schema";
import { ALGERIA_58_WILAYAS } from "@/lib/types/checkout";

export const dynamic = "force-dynamic";

const MCP_SERVER_INFO = {
  name: "orva-store-mcp",
  title: "ORVA Store Algeria Catalog & Delivery MCP Server",
  version: "1.0.0",
};

const MCP_TOOLS = [
  {
    name: "list_orva_products",
    description:
      "List all published workshop tool packs and hardware kits on ORVA Store Algeria (orva-store.com) with prices in DZD and canonical URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional keyword filter (e.g., CROWN, pack1, welding).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_wilaya_delivery_fees",
    description:
      "Look up Cash-on-Delivery (COD) home delivery (Domicile) and office pickup (Stop Desk) shipping fees in DZD for Algerian wilayas (01 to 58).",
    inputSchema: {
      type: "object",
      properties: {
        wilayaCode: {
          type: "integer",
          minimum: 1,
          maximum: 58,
          description: "Algerian wilaya number (1-58), e.g., 16 for Algiers.",
        },
      },
      required: ["wilayaCode"],
      additionalProperties: false,
    },
  },
  {
    name: "get_store_contact_info",
    description: "Retrieve official business contact details, customer support hours, and policy URLs for ORVA Store Algeria.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

export async function GET() {
  return NextResponse.json({
    name: MCP_SERVER_INFO.name,
    version: MCP_SERVER_INFO.version,
    endpoint: `${ORVA_CANONICAL_ORIGIN}/api/mcp/`,
    transport: "streamable-http",
    authentication: { required: false },
    capabilities: { tools: { listChanged: false } },
    tools: MCP_TOOLS,
  });
}

export async function POST(request: NextRequest) {
  let body: {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: Record<string, unknown>;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  const id = body.id ?? null;
  const method = body.method ?? "";

  if (method === "initialize") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: MCP_SERVER_INFO,
      },
    });
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 202 });
  }

  if (method === "tools/list") {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: MCP_TOOLS,
      },
    });
  }

  if (method === "tools/call") {
    const toolName = String(body.params?.name ?? "");
    const args =
      body.params?.arguments && typeof body.params.arguments === "object"
        ? (body.params.arguments as Record<string, unknown>)
        : {};

    if (toolName === "list_orva_products") {
      const q = String(args.query ?? "")
        .trim()
        .toLowerCase();
      const all = await listPublishedProducts();
      const filtered = q
        ? all.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q) ||
              p.slug.toLowerCase().includes(q),
          )
        : all;

      const items = filtered.map((p) => ({
        id: p.packId,
        slug: p.slug,
        title: p.title,
        priceDzd: p.priceDzd,
        inStock: !p.showOutOfStock && p.stockQuantity > 0,
        url: `${ORVA_CANONICAL_ORIGIN}${p.route}`,
      }));

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ count: items.length, products: items }, null, 2) }],
          structuredContent: { count: items.length, products: items },
        },
      });
    }

    if (toolName === "get_wilaya_delivery_fees") {
      const codeNum = Number(args.wilayaCode);
      if (!Number.isInteger(codeNum) || codeNum < 1 || codeNum > 58) {
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: "Invalid wilayaCode. Provide an integer from 1 to 58." }],
          },
        });
      }
      const feesResult = await getDeliveryFees(false);
      const wilayaInfo = ALGERIA_58_WILAYAS.find((w) => w.code === codeNum);
      const feeEntry = feesResult.fees?.[codeNum];
      const payload = {
        wilayaCode: codeNum,
        wilayaNameAr: wilayaInfo?.nameAr ?? null,
        domicileDzd: feeEntry?.domicile ?? 800,
        stopDeskDzd: feeEntry?.stopdesk ?? 450,
        currency: "DZD",
      };
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        },
      });
    }

    if (toolName === "get_store_contact_info") {
      const payload = {
        name: "ORVA Store Algeria | متجر أورفا",
        website: `${ORVA_CANONICAL_ORIGIN}/`,
        telephone: ORVA_CONTACT_PHONE,
        email: ORVA_CONTACT_EMAIL,
        whatsapp: ORVA_WHATSAPP_URL,
        pages: {
          about: `${ORVA_CANONICAL_ORIGIN}/about/`,
          contact: `${ORVA_CANONICAL_ORIGIN}/contact/`,
          terms: `${ORVA_CANONICAL_ORIGIN}/terms/`,
          shop: `${ORVA_CANONICAL_ORIGIN}/shop/`,
        },
      };
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        },
      });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: `Unknown tool: ${toolName}` },
    });
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}
