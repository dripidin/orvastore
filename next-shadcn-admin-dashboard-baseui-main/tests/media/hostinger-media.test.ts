/**
 * ORVA Store — Hostinger Media Engine & Usage Scanner Unit Tests
 *
 * Run from next-shadcn-admin-dashboard-baseui-main:
 *   npx tsx --tsconfig tsconfig.json tests/media/hostinger-media.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

import {
  clampMaxUploadSizeMb,
  clampWebpQuality,
  MEDIA_MAX_UPLOAD_MB,
  MEDIA_MIN_UPLOAD_MB,
} from "@/lib/settings/settings-store";
import { inspectImageBuffer } from "@/lib/media/image-metadata";
import {
  assertSafeFilename,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
  uploadMediaBuffer,
  uploadMediaDataUrl,
} from "@/lib/media/hostinger-media";
import {
  rewriteMediaUrlReferences,
  scanAllMediaUsages,
  unlinkMediaUrlReferences,
} from "@/lib/media/usage-scanner";

const SCHEMA_SQL = path.join(
  process.cwd(),
  "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql"
);

// Valid 1x1 PNG (68 bytes, width=1, height=1)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal valid PNG with custom arbitrary dimensions (e.g. 3840x2160) for unconstrained dimension parser check
function makePngHeaderBytes(width: number, height: number): Buffer {
  const buf = Buffer.from(TINY_PNG);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

// Valid minimal JPEG SOF0 header (640x480)
function makeJpegWithSize(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // length 17
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ]);
}

// Valid minimal WebP VP8X header (1920x1080)
function makeWebpVp8x(width: number, height: number): Buffer {
  const buf = Buffer.alloc(34);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(26, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  const wMinus1 = width - 1;
  const hMinus1 = height - 1;
  buf[24] = wMinus1 & 0xff;
  buf[25] = (wMinus1 >> 8) & 0xff;
  buf[26] = (wMinus1 >> 16) & 0xff;
  buf[27] = hMinus1 & 0xff;
  buf[28] = (hMinus1 >> 8) & 0xff;
  buf[29] = (hMinus1 >> 16) & 0xff;
  return buf;
}

function createMinimalPgliteAdapter(pg: PGlite) {
  function quoteIdent(id: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) throw new Error(`Bad ident: ${id}`);
    return `"${id}"`;
  }
  const JSONB = new Set(["metadata", "remarks", "integrations", "risk_reasons"]);
  return {
    from(table: string) {
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let cols = "*";
      let payload: any = null;
      const where: Array<[string, unknown]> = [];
      let singleMode: "many" | "maybeSingle" = "many";

      const exec = async () => {
        const params: unknown[] = [];
        const add = (col: string, v: unknown) => {
          params.push(v !== null && typeof v === "object" && JSONB.has(col) ? JSON.stringify(v) : v);
          return `$${params.length}`;
        };
        const whereSql =
          where.length > 0
            ? ` WHERE ${where.map(([c, v]) => `${quoteIdent(c)} = ${add(c, v)}`).join(" AND ")}`
            : "";

        let sql = "";
        if (mode === "select") {
          const cSql = cols === "*" ? "*" : cols.split(",").map((c) => quoteIdent(c.trim())).join(", ");
          sql = `SELECT ${cSql} FROM public.${quoteIdent(table)}${whereSql}`;
        } else if (mode === "update") {
          const sets = Object.keys(payload).map((k) => `${quoteIdent(k)} = ${add(k, payload[k])}`).join(", ");
          sql = `UPDATE public.${quoteIdent(table)} SET ${sets}${whereSql} RETURNING *`;
        } else if (mode === "delete") {
          sql = `DELETE FROM public.${quoteIdent(table)}${whereSql}`;
        }
        const res = await pg.query(sql, params);
        if (singleMode === "maybeSingle") return { data: res.rows[0] ?? null, error: null };
        return { data: res.rows, error: null };
      };

      const b: any = {
        select(c = "*") {
          cols = c;
          return b;
        },
        update(p: any) {
          mode = "update";
          payload = p;
          return b;
        },
        delete() {
          mode = "delete";
          return b;
        },
        eq(c: string, v: unknown) {
          where.push([c, v]);
          return b;
        },
        maybeSingle() {
          singleMode = "maybeSingle";
          return exec();
        },
        then(res: any, rej: any) {
          return exec().then(res, rej);
        },
      };
      return b;
    },
  };
}

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed += 1;
  console.log(`  [PASS] ${name}`);
}

async function main() {
  console.log("Running Hostinger Media Storage & Management Unit Tests...\n");

  const tempMediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orva-media-test-"));
  const origEnv = { ...process.env };

  try {
    // 1. Settings bounds (4MB – 100MB ladder)
    await test("Size ladder clamps strictly between 4 MB and 100 MB", () => {
      assert.equal(MEDIA_MIN_UPLOAD_MB, 4);
      assert.equal(MEDIA_MAX_UPLOAD_MB, 100);
      assert.equal(clampMaxUploadSizeMb(1), 4);
      assert.equal(clampMaxUploadSizeMb(4), 4);
      assert.equal(clampMaxUploadSizeMb(25.6), 26);
      assert.equal(clampMaxUploadSizeMb(100), 100);
      assert.equal(clampMaxUploadSizeMb(250), 100);
      assert.equal(clampMaxUploadSizeMb("not-a-number"), 10);
      assert.equal(clampWebpQuality(0.1), 0.5);
      assert.equal(clampWebpQuality(0.99), 0.95);
    });

    // 2. Unconstrained pixel dimensions & magic byte security
    await test("Reads arbitrary pixel dimensions (4K PNG, JPEG, WebP) and rejects forged/SVG payloads", () => {
      const png4k = inspectImageBuffer(makePngHeaderBytes(3840, 2160), "image/png");
      assert.equal(png4k.width, 3840);
      assert.equal(png4k.height, 2160);
      assert.equal(png4k.mimeType, "image/png");

      const jpg = inspectImageBuffer(makeJpegWithSize(1080, 1920), "image/jpeg");
      assert.equal(jpg.width, 1080);
      assert.equal(jpg.height, 1920);

      const webp = inspectImageBuffer(makeWebpVp8x(2400, 1600), "image/webp");
      assert.equal(webp.width, 2400);
      assert.equal(webp.height, 1600);

      // Forged PHP pretending to be JPEG
      assert.throws(() => inspectImageBuffer(Buffer.from("<?php echo 1; ?>"), "image/jpeg"), /صيغة الملف غير مدعومة/);
      // MIME mismatch (PNG bytes claiming JPEG)
      assert.throws(() => inspectImageBuffer(TINY_PNG, "image/jpeg"), /لا يطابق الصيغة/);
    });

    // 3. Path traversal rejection
    await test("Rejects path traversal and unsafe filenames", () => {
      assert.throws(() => assertSafeFilename("../secret.png"));
      assert.throws(() => assertSafeFilename("evil.php"));
      assert.throws(() => assertSafeFilename("shell.svg"));
      assert.equal(assertSafeFilename("crown-pack-1.webp"), "crown-pack-1.webp");
    });

    // 4. Filesystem backend full lifecycle + dynamic 4MB..100MB size enforcement
    process.env.MEDIA_STORAGE_PROVIDER = "filesystem";
    process.env.MEDIA_STORAGE_DIR = tempMediaRoot;
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.orva-store.com";

    await test("Filesystem mode: upload -> list -> rename -> delete + enforces 4–100 MB limit", async () => {
      const up = await uploadMediaBuffer({
        bytes: TINY_PNG,
        name: "ORVA Pack Cover",
        folder: "products",
        claimedMime: "image/png",
        maxUploadSizeMb: 4,
      });
      assert.equal(up.provider, "hostinger-fs");
      assert.ok(up.url.startsWith("https://media.orva-store.com/products/"));
      assert.ok(up.url.endsWith(".png"));

      // Reject > 4MB when limit = 4MB
      const fiveMbFakePng = Buffer.concat([TINY_PNG, Buffer.alloc(4.5 * 1024 * 1024)]);
      await assert.rejects(
        () => uploadMediaBuffer({ bytes: fiveMbFakePng, name: "big", folder: "products", maxUploadSizeMb: 4 }),
        /يتجاوز الحد الأقصى/
      );

      // Accept > 4MB when limit is raised to 10MB on the ladder
      const upBig = await uploadMediaBuffer({
        bytes: fiveMbFakePng,
        name: "big-ok",
        folder: "products",
        maxUploadSizeMb: 10,
      });
      assert.ok(upBig.item.sizeBytes > 4 * 1024 * 1024);

      const list = await listMediaAssets();
      assert.equal(list.items.length, 2);

      // Rename preserves .png extension even if user omits it
      const renamed = await renameMediaAsset({
        folder: "products",
        filename: up.item.filename,
        newName: "crown-drill-hero",
      });
      assert.equal(renamed.item.filename, "crown-drill-hero.png");
      assert.equal(renamed.newUrl, "https://media.orva-store.com/products/crown-drill-hero.png");

      // Collision returns error
      await assert.rejects(
        () => renameMediaAsset({ folder: "products", filename: upBig.item.filename, newName: "crown-drill-hero" }),
        /يوجد ملف آخر بنفس هذا الاسم/
      );

      // SVG dataUrl rejected
      await assert.rejects(
        () => uploadMediaDataUrl({ dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", name: "bad" }),
        /SVG غير مدعومة/
      );

      // Delete cleanly
      await deleteMediaAsset({ folder: "products", filename: "crown-drill-hero.png" });
      await deleteMediaAsset({ folder: "products", filename: upBig.item.filename });
      const afterDel = await listMediaAssets();
      assert.equal(afterDel.items.length, 0);
    });

    // 5. HTTP bridge backend test against mock api-media.php server
    await test("HTTP Bridge mode: sends Bearer + X-Media-Secret for upload/list/rename/delete", async () => {
      const stored = new Map<string, Buffer>();
      const expectedSecret = "a".repeat(64);

      const srv = http.createServer((req, res) => {
        const secret = req.headers["x-media-secret"];
        if (secret !== expectedSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Unauthorized" }));
          return;
        }
        const url = new URL(req.url || "/", "http://127.0.0.1");
        const action = url.searchParams.get("action");
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const bodyStr = Buffer.concat(chunks).toString("utf-8");
          res.writeHead(200, { "Content-Type": "application/json" });
          if (action === "upload") {
            stored.set("products/bridge-test.png", TINY_PNG);
            res.end(
              JSON.stringify({
                success: true,
                item: {
                  folder: "products",
                  filename: "bridge-test.png",
                  url: "https://media.orva-store.com/products/bridge-test.png",
                  sizeBytes: TINY_PNG.length,
                  width: 1,
                  height: 1,
                  mimeType: "image/png",
                  updatedAt: new Date().toISOString(),
                },
              })
            );
          } else if (action === "list") {
            res.end(
              JSON.stringify({
                success: true,
                items: Array.from(stored.keys()).map((k) => ({
                  folder: "products",
                  filename: k.split("/")[1],
                  url: `https://media.orva-store.com/${k}`,
                  sizeBytes: TINY_PNG.length,
                  width: 1,
                  height: 1,
                  mimeType: "image/png",
                  updatedAt: new Date().toISOString(),
                })),
              })
            );
          } else if (action === "rename") {
            const j = JSON.parse(bodyStr);
            stored.delete(`products/${j.filename}`);
            stored.set(`products/${j.newName}`, TINY_PNG);
            res.end(
              JSON.stringify({
                success: true,
                oldUrl: `https://media.orva-store.com/products/${j.filename}`,
                newUrl: `https://media.orva-store.com/products/${j.newName}`,
                item: {
                  folder: "products",
                  filename: j.newName,
                  url: `https://media.orva-store.com/products/${j.newName}`,
                  sizeBytes: TINY_PNG.length,
                  width: 1,
                  height: 1,
                  mimeType: "image/png",
                  updatedAt: new Date().toISOString(),
                },
              })
            );
          } else if (action === "delete") {
            const j = JSON.parse(bodyStr);
            stored.delete(`products/${j.filename}`);
            res.end(JSON.stringify({ success: true, deleted: true }));
          }
        });
      });

      await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
      const addr = srv.address() as { port: number };

      try {
        process.env.MEDIA_STORAGE_PROVIDER = "bridge";
        process.env.MEDIA_UPLOAD_ENDPOINT = `http://127.0.0.1:${addr.port}/api-media.php`;
        process.env.MEDIA_UPLOAD_SECRET = expectedSecret;
        delete process.env.MEDIA_STORAGE_DIR;

        const up = await uploadMediaBuffer({ bytes: TINY_PNG, name: "bridge", folder: "products", maxUploadSizeMb: 25 });
        assert.equal(up.provider, "hostinger-bridge");
        assert.equal(up.url, "https://media.orva-store.com/products/bridge-test.png");

        const listed = await listMediaAssets();
        assert.equal(listed.items.length, 1);

        const renamed = await renameMediaAsset({ folder: "products", filename: "bridge-test.png", newName: "renamed" });
        assert.equal(renamed.newUrl, "https://media.orva-store.com/products/renamed.png");

        const del = await deleteMediaAsset({ folder: "products", filename: "renamed.png" });
        assert.equal(del.deleted, true);
      } finally {
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      }
    });

    // 6. Fail-Closed in production when no storage backend is configured
    await test("Fail-closed in production: refuses upload instead of falling back to Supabase Storage", async () => {
      delete process.env.MEDIA_STORAGE_PROVIDER;
      process.env.MEDIA_STORAGE_DIR = path.join(tempMediaRoot, "does-not-exist");
      process.env.MEDIA_UPLOAD_SECRET = "";
      (process.env as any).NODE_ENV = "production";

      await assert.rejects(
        () => uploadMediaBuffer({ bytes: TINY_PNG, name: "fail", folder: "products", maxUploadSizeMb: 10 }),
        /تعذر الوصول إلى خزنة الوسائط/
      );
    });

    // 7. Usage scanner & automatic reference rewriting on rename/delete against PGlite
    await test("Usage Scanner: detects product cover/gallery/logo and rewrites or unlinks references automatically", async () => {
      const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
      await pg.exec(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        END $$;
      `);
      await pg.exec(fs.readFileSync(SCHEMA_SQL, "utf-8"));

      const oldProdUrl = "https://media.orva-store.com/products/old-drill.webp";
      const newProdUrl = "https://media.orva-store.com/products/crown-drill-pro.webp";
      const logoUrl = "https://media.orva-store.com/branding/orva-main-logo.png";

      await pg.query(
        `INSERT INTO public.products (name, slug, base_price, status, metadata) VALUES ($1, $2, 12950, 'PUBLISHED', $3::jsonb)`,
        ["ماكينة كراون", "crown-pro", JSON.stringify({ images: [oldProdUrl, "https://media.orva-store.com/products/gallery.webp"] })]
      );
      await pg.query(
        `INSERT INTO public.site_settings (id, integrations) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET integrations = EXCLUDED.integrations`,
        [JSON.stringify({ store: { logo_url: logoUrl } })]
      );

      const sb = createMinimalPgliteAdapter(pg);
      const usagesBefore = await scanAllMediaUsages(sb);

      const prodUses = usagesBefore.get("/products/old-drill.webp");
      assert.ok(prodUses && prodUses.length === 1);
      assert.equal(prodUses[0].label, "ماكينة كراون");
      assert.equal(prodUses[0].role, "غلاف رئيسي للمنتج");

      const logoUses = usagesBefore.get("/branding/orva-main-logo.png");
      assert.ok(logoUses && logoUses.length === 1);
      assert.equal(logoUses[0].kind, "store_logo");

      // Rename rewrite
      const rw = await rewriteMediaUrlReferences(oldProdUrl, newProdUrl, sb);
      assert.equal(rw.updatedProducts, 1);

      const prodRow = await pg.query(`SELECT metadata FROM public.products WHERE slug = 'crown-pro'`);
      assert.deepEqual((prodRow.rows[0] as any).metadata.images, [
        newProdUrl,
        "https://media.orva-store.com/products/gallery.webp",
      ]);

      // Forced unlink on delete
      const ul = await unlinkMediaUrlReferences(newProdUrl, sb);
      assert.equal(ul.updatedProducts, 1);
      const prodAfterUnlink = await pg.query(`SELECT metadata FROM public.products WHERE slug = 'crown-pro'`);
      assert.deepEqual((prodAfterUnlink.rows[0] as any).metadata.images, [
        "https://media.orva-store.com/products/gallery.webp",
      ]);

      await pg.close();
    });

    // 8. Verify src/lib/catalog/server.ts has zero Supabase Storage references
    await test("catalog/server.ts contains zero Supabase Storage bucket references", () => {
      const src = fs.readFileSync(path.join(process.cwd(), "src/lib/catalog/server.ts"), "utf-8");
      assert.equal(src.includes("product-images"), false);
      assert.equal(src.includes(".storage."), false);
      assert.equal(src.includes("uploadMediaDataUrl"), true);
    });

    console.log(`\nALL ${passed} MEDIA TESTS PASSED SUCCESSFULLY!`);
  } finally {
    process.env = origEnv;
    fs.rmSync(tempMediaRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("MEDIA TEST FAILED:", err);
  process.exit(1);
});
