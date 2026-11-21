#!/usr/bin/env node
/**
 * ORVA Store — Safe Supabase Storage -> Hostinger Media Migration Script
 *
 * Modes:
 *   --dry-run                   (default) Scans Supabase DB & bucket, prints migration plan without mutating.
 *   --apply                     Downloads images from Supabase Storage, uploads to media.orva-store.com,
 *                               verifies HTTP 200, updates DB rows, and saves rollback manifest.
 *   --rollback <manifest.json>  Restores original DB URLs recorded in the manifest.
 *   --cleanup-supabase-bucket   Deletes objects from Supabase `product-images` bucket ONLY after verifying
 *                               no DB rows still point to Supabase Storage.
 */

import fs from "node:fs";
import path from "node:path";

const SUPABASE_STORAGE_RE = /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[^\s"'`<>]+/gi;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = val;
  }
}

// Match Next.js env priority (.env.local overrides .env; caller process.env always wins)
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), "..", ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(process.cwd(), "..", ".env"));

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const MEDIA_PUBLIC_BASE_URL = (process.env.MEDIA_PUBLIC_BASE_URL || "https://media.orva-store.com").replace(/\/+$/, "");
const MEDIA_ENDPOINT = (process.env.MEDIA_UPLOAD_ENDPOINT || "https://media.orva-store.com/api-media.php").trim();
const MEDIA_SECRET = (process.env.MEDIA_UPLOAD_SECRET || "").trim();

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const cleanup = args.includes("--cleanup-supabase-bucket");
  const rbIdx = args.indexOf("--rollback");
  const rollbackPath = rbIdx !== -1 ? args[rbIdx + 1] : null;
  return { apply, cleanup, rollbackPath, dryRun: !apply && !cleanup && !rollbackPath };
}

async function sbFetch(relPath, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${relPath}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`Supabase ${relPath} failed (${res.status}): ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  return json;
}

async function sbPatch(relPath, payload) {
  const updated = await sbFetch(relPath, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!Array.isArray(updated) || updated.length === 0) {
    throw new Error(`Supabase PATCH ${relPath} updated 0 rows (check RLS/service_role key or row existence).`);
  }
  return updated;
}

function collectSupabaseUrls(val, found = new Set()) {
  if (typeof val === "string") {
    const matches = val.match(SUPABASE_STORAGE_RE);
    if (matches) matches.forEach((m) => found.add(m));
  } else if (Array.isArray(val)) {
    val.forEach((item) => collectSupabaseUrls(item, found));
  } else if (val && typeof val === "object") {
    Object.values(val).forEach((v) => collectSupabaseUrls(v, found));
  }
  return found;
}

function replaceUrls(val, mapping) {
  if (typeof val === "string") {
    let out = val;
    let changed = false;
    for (const [oldUrl, newUrl] of Object.entries(mapping)) {
      if (out.includes(oldUrl)) {
        out = out.split(oldUrl).join(newUrl);
        changed = true;
      }
    }
    return { changed, next: out };
  }
  if (Array.isArray(val)) {
    let any = false;
    const next = val.map((item) => {
      const r = replaceUrls(item, mapping);
      if (r.changed) any = true;
      return r.next;
    });
    return { changed: any, next };
  }
  if (val && typeof val === "object") {
    let any = false;
    const next = {};
    for (const [k, v] of Object.entries(val)) {
      const r = replaceUrls(v, mapping);
      if (r.changed) any = true;
      next[k] = r.next;
    }
    return { changed: any, next };
  }
  return { changed: false, next: val };
}

function safeNameFromUrl(rawUrl) {
  const pathname = new URL(rawUrl).pathname;
  const base = path.basename(pathname).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return /^[a-z0-9]/.test(base) ? base : `migrated-${base}`;
}

async function uploadToHostingerBridge(bytes, mimeType, filename, folder = "products") {
  const candidateUrl = `${MEDIA_PUBLIC_BASE_URL}/${folder}/${encodeURIComponent(filename)}`;
  const existingHead = await fetch(candidateUrl, { method: "HEAD" }).catch(() => null);
  const existingLen = Number(existingHead?.headers.get("content-length") || 0);
  const existingType = (existingHead?.headers.get("content-type") || "").toLowerCase();
  if (existingHead?.ok && existingType.startsWith("image/") && existingLen === bytes.length) {
    return candidateUrl;
  }

  const form = new FormData();
  form.set("folder", folder);
  form.set("filename", filename);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), filename);

  const sep = MEDIA_ENDPOINT.includes("?") ? "&" : "?";
  const res = await fetch(`${MEDIA_ENDPOINT}${sep}action=upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MEDIA_SECRET}`,
      "X-Media-Secret": MEDIA_SECRET,
    },
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json.item?.url) {
    throw new Error(`Hostinger bridge upload failed (${res.status}): ${JSON.stringify(json)}`);
  }

  // Verify live public URL returns HTTP 200 and image content-type
  const headRes = await fetch(json.item.url, { method: "HEAD" });
  if (!headRes.ok) {
    throw new Error(`Uploaded file verification failed (${headRes.status}) at ${json.item.url}`);
  }
  return json.item.url;
}

async function main() {
  const opts = parseArgs();
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  if (SUPABASE_KEY.startsWith("sb_publishable_")) {
    const msg = "SUPABASE_SERVICE_ROLE_KEY is a publishable/anon key ('sb_publishable_...'). RLS would silently block PATCH writes. Set a real service_role key in .env.local.";
    if (!opts.dryRun) {
      throw new Error(msg);
    }
    console.warn(`[WARN] ${msg}`);
  }

  if (opts.rollbackPath) {
    const manifest = JSON.parse(fs.readFileSync(opts.rollbackPath, "utf-8"));
    console.log(`[ROLLBACK] Restoring ${manifest.products?.length || 0} products, ${manifest.productMedia?.length || 0} media rows, logo=${Boolean(manifest.siteSettingsOldLogo)}...`);
    for (const p of manifest.products || []) {
      await sbPatch(`/rest/v1/products?id=eq.${encodeURIComponent(p.id)}`, { metadata: p.oldMetadata });
    }
    for (const pm of manifest.productMedia || []) {
      await sbPatch(`/rest/v1/product_media?id=eq.${encodeURIComponent(pm.id)}`, { url: pm.oldUrl });
    }
    if (manifest.siteSettingsOldIntegrations) {
      await sbPatch(`/rest/v1/site_settings?id=eq.1`, { integrations: manifest.siteSettingsOldIntegrations });
    }
    console.log("[ROLLBACK] Completed.");
    return;
  }

  const products = await sbFetch("/rest/v1/products?select=id,slug,name,metadata");
  const productMedia = await sbFetch("/rest/v1/product_media?select=id,product_id,url").catch(() => []);
  const siteSettingsRows = await sbFetch("/rest/v1/site_settings?select=id,integrations&id=eq.1").catch(() => []);
  const bucketObjects = await sbFetch("/storage/v1/object/list/product-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000 }),
  }).catch(() => []);

  const referencedUrls = new Set();
  for (const p of products) collectSupabaseUrls(p.metadata, referencedUrls);
  for (const pm of productMedia) collectSupabaseUrls(pm.url, referencedUrls);
  for (const ss of siteSettingsRows) collectSupabaseUrls(ss.integrations, referencedUrls);

  console.log("=== Supabase -> Hostinger Media Migration Scan ===");
  console.log(`Products scanned: ${products.length}`);
  console.log(`Supabase URLs referenced in DB: ${referencedUrls.size}`);
  for (const u of referencedUrls) console.log(`  - ${u}`);
  console.log(`Objects in Supabase 'product-images' bucket: ${Array.isArray(bucketObjects) ? bucketObjects.length : 0}`);
  for (const obj of Array.isArray(bucketObjects) ? bucketObjects : []) {
    console.log(`  * ${obj.name} (${obj.metadata?.size || 0} bytes)`);
  }

  if (opts.cleanup) {
    if (referencedUrls.size > 0) {
      throw new Error(`Refusing bucket cleanup: ${referencedUrls.size} DB references still point to Supabase Storage. Run --apply first.`);
    }
    const names = (Array.isArray(bucketObjects) ? bucketObjects : []).map((o) => o.name).filter(Boolean);
    if (names.length === 0) {
      console.log("[CLEANUP] Bucket 'product-images' is already empty.");
      return;
    }
    for (const name of names) {
      await sbFetch(`/storage/v1/object/product-images/${encodeURIComponent(name)}`, { method: "DELETE" });
      console.log(`[CLEANUP] Deleted bucket object: ${name}`);
    }
    console.log(`[CLEANUP] Removed ${names.length} objects from Supabase Storage.`);
    return;
  }

  if (opts.dryRun) {
    console.log("\n[DRY-RUN] No modifications made. Run with --apply to migrate.");
    return;
  }

  if (!MEDIA_SECRET || MEDIA_SECRET.length < 32) {
    throw new Error("MEDIA_UPLOAD_SECRET missing or too short for --apply.");
  }

  const urlMap = {};
  for (const oldUrl of referencedUrls) {
    console.log(`[MIGRATE] Downloading ${oldUrl}...`);
    const dl = await fetch(oldUrl);
    if (!dl.ok) throw new Error(`Failed to download ${oldUrl} (${dl.status})`);
    const mime = dl.headers.get("content-type") || "image/webp";
    const bytes = Buffer.from(await dl.arrayBuffer());
    const filename = safeNameFromUrl(oldUrl);
    const newUrl = await uploadToHostingerBridge(bytes, mime, filename, "products");
    urlMap[oldUrl] = newUrl;
    console.log(`[MIGRATE] Verified live on Hostinger: ${newUrl}`);
  }

  const manifest = {
    migratedAt: new Date().toISOString(),
    urlMap,
    products: [],
    productMedia: [],
    siteSettingsOldIntegrations: null,
  };

  for (const p of products) {
    const res = replaceUrls(p.metadata, urlMap);
    if (res.changed) {
      manifest.products.push({ id: p.id, slug: p.slug, oldMetadata: p.metadata });
      await sbPatch(`/rest/v1/products?id=eq.${encodeURIComponent(p.id)}`, {
        metadata: res.next,
        updated_at: new Date().toISOString(),
      });
      console.log(`[DB] Updated product ${p.slug} (${p.id})`);
    }
  }

  for (const pm of productMedia) {
    if (urlMap[pm.url]) {
      manifest.productMedia.push({ id: pm.id, oldUrl: pm.url });
      await sbPatch(`/rest/v1/product_media?id=eq.${encodeURIComponent(pm.id)}`, { url: urlMap[pm.url] });
      console.log(`[DB] Updated product_media ${pm.id}`);
    }
  }

  if (siteSettingsRows[0]?.integrations) {
    const res = replaceUrls(siteSettingsRows[0].integrations, urlMap);
    if (res.changed) {
      manifest.siteSettingsOldIntegrations = siteSettingsRows[0].integrations;
      await sbPatch(`/rest/v1/site_settings?id=eq.1`, {
        integrations: res.next,
        updated_at: new Date().toISOString(),
      });
      console.log("[DB] Updated site_settings integrations");
    }
  }

  const manifestPath = path.resolve(
    process.cwd(),
    `migration-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\n[DONE] Migration completed! Rollback manifest saved at: ${manifestPath}`);
}

main().catch((err) => {
  console.error("[MIGRATION ERROR]", err);
  process.exit(1);
});
