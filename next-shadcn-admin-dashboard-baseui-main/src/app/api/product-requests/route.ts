import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { isValidAlgerianPhone, normalizeAlgerianPhone } from "@/lib/types/checkout";
import {
  addProductRequest,
  deleteProductRequest,
  listProductRequests,
  markProductRequestsRead,
} from "@/lib/product-requests-store";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

// Simple per-IP throttle for the public form (5 requests / 10 min per instance).
const hits: Map<string, number[]> =
  (globalThis as { __orvaReqHits?: Map<string, number[]> }).__orvaReqHits ??
  ((globalThis as { __orvaReqHits?: Map<string, number[]> }).__orvaReqHits = new Map());

function throttled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Public: a customer asks for a product we do not sell yet. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (clean(body.website, 50)) return NextResponse.json({ success: true }); // honeypot: silently drop bots

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (throttled(ip)) return fail("أرسلت عدة طلبات، حاول بعد قليل.", 429);

  const customerName = clean(body.customerName, 80);
  const productWanted = clean(body.productWanted, 200);
  const phoneRaw = clean(body.phone, 20);
  if (customerName.length < 2) return fail("يرجى كتابة الاسم.");
  if (productWanted.length < 3) return fail("يرجى كتابة المنتج الذي تبحث عنه.");
  if (phoneRaw && !isValidAlgerianPhone(phoneRaw)) return fail("رقم الهاتف غير صحيح.");

  try {
    await addProductRequest({
      customer_name: customerName,
      phone: phoneRaw ? normalizeAlgerianPhone(phoneRaw) : null,
      wilaya: clean(body.wilaya, 60) || null,
      product_wanted: productWanted,
      message: clean(body.message, 1000) || null,
    });
  } catch (err) {
    console.error("[product-requests] save failed:", err);
    return fail("تعذر إرسال طلبك حالياً، حاول لاحقاً.", 500);
  }
  return NextResponse.json({ success: true });
}

/** Admin: list requests (newest first) with the unread count. ?count=1 returns only the count. */
export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return fail("Unauthorized", 401);
  const onlyCount = new URL(request.url).searchParams.get("count") === "1";
  try {
    const data = await listProductRequests();
    const unread = data.filter((r) => !r.is_read).length;
    if (onlyCount) return NextResponse.json({ success: true, unread });
    return NextResponse.json({ success: true, unread, data });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Lookup failed", 500);
  }
}

/** Admin: mark requests as read ({ all: true } or { ids: [...] }). */
export async function PATCH(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return fail("Unauthorized", 401);
  const body = (await request.json().catch(() => ({}))) as { all?: boolean; ids?: string[] };
  try {
    await markProductRequestsRead(body.all ? "all" : (body.ids ?? []));
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Update failed", 500);
  }
  return NextResponse.json({ success: true });
}

/** Admin: delete one request (?id=...). */
export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return fail("Unauthorized", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("id required");
  try {
    await deleteProductRequest(id);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Delete failed", 500);
  }
  return NextResponse.json({ success: true });
}
