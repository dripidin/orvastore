import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Customer product requests storage.
 * Primary: public.product_requests table (migration 20261111_000004).
 * Fallback: JSON files in a private Supabase Storage bucket, used automatically when the table
 * is missing, so the storefront form never fails because a migration was not run.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ProductRequestRecord {
  id: string;
  customer_name: string;
  phone: string | null;
  wilaya: string | null;
  product_wanted: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export type NewProductRequest = Omit<ProductRequestRecord, "id" | "is_read" | "created_at">;

const TABLE = "product_requests";
const BUCKET = "product-requests";
const FOLDER = "requests";

function db(): any {
  return getSupabaseServerClient() as any;
}

function isMissingTable(error: any): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    /does not exist|schema cache|could not find the table/i.test(msg)
  );
}

// ── Storage fallback ─────────────────────────────────────────────────────────

async function ensureBucket(): Promise<void> {
  const storage = db().storage;
  const { data } = await storage.getBucket(BUCKET);
  if (!data) await storage.createBucket(BUCKET, { public: false }).catch(() => undefined);
}

function fileName(r: ProductRequestRecord): string {
  return `${FOLDER}/${r.id}.json`;
}

async function writeFile(r: ProductRequestRecord): Promise<void> {
  await ensureBucket();
  const body = new Blob([JSON.stringify(r)], { type: "application/json" });
  const { error } = await db().storage.from(BUCKET).upload(fileName(r), body, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

async function readFiles(): Promise<ProductRequestRecord[]> {
  try {
    const storage = db().storage.from(BUCKET);
    const { data: files, error } = await storage.list(FOLDER, { limit: 500, sortBy: { column: "name", order: "desc" } });
    if (error || !files) return [];
    const out: ProductRequestRecord[] = [];
    for (const f of files) {
      if (!f.name.endsWith(".json")) continue;
      const { data } = await storage.download(`${FOLDER}/${f.name}`);
      if (!data) continue;
      try {
        out.push(JSON.parse(await data.text()) as ProductRequestRecord);
      } catch {
        // skip unreadable file
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function addProductRequest(input: NewProductRequest): Promise<void> {
  const { error } = await db().from(TABLE).insert(input);
  if (!error) return;
  if (!isMissingTable(error)) {
    console.error("[product-requests] table insert failed, using storage fallback:", error.message);
  }
  await writeFile({
    ...input,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    is_read: false,
    created_at: new Date().toISOString(),
  });
}

export async function listProductRequests(): Promise<ProductRequestRecord[]> {
  let rows: ProductRequestRecord[] = [];
  const { data, error } = await db().from(TABLE).select("*").order("created_at", { ascending: false }).limit(500);
  if (!error && data) rows = data as ProductRequestRecord[];
  const files = await readFiles();
  return [...rows, ...files].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function countUnreadProductRequests(): Promise<number> {
  return (await listProductRequests()).filter((r) => !r.is_read).length;
}

export async function markProductRequestsRead(ids: string[] | "all"): Promise<void> {
  const tableQuery = db().from(TABLE).update({ is_read: true });
  await (ids === "all" ? tableQuery.eq("is_read", false) : tableQuery.in("id", ids));
  for (const f of await readFiles()) {
    if (!f.is_read && (ids === "all" || ids.includes(f.id))) await writeFile({ ...f, is_read: true });
  }
}

export async function deleteProductRequest(id: string): Promise<void> {
  await db().from(TABLE).delete().eq("id", id);
  await db().storage.from(BUCKET).remove([`${FOLDER}/${id}.json`]).catch(() => undefined);
}
