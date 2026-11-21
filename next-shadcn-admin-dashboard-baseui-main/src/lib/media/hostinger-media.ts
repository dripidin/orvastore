/**
 * ORVA Store — Hostinger Media Storage Engine (media.orva-store.com)
 *
 * Fail-Closed Media Architecture:
 * 1. Primary (Production on Hostinger): Direct atomic filesystem I/O inside
 *    `/home/u520776094/domains/media.orva-store.com/public_html` (same Linux user, isolated from Git deploys).
 * 2. Secondary / Local Dev Bridge: Authenticated HTTPS bridge `api-media.php` on `media.orva-store.com`.
 * 3. Local-dev fallback (only when NODE_ENV !== 'production' and no bridge secret is configured): `public/uploads/`.
 * 4. Strictly zero calls to Supabase Storage (eliminates Supabase Cached Egress completely).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { getMediaBridgeConfigAction, getMediaSettingsAction } from "@/app/actions/settings";
import { clampMaxUploadSizeMb } from "@/lib/settings/settings-store";
import { inspectImageBuffer } from "./image-metadata";

export type MediaFolder = "products" | "branding";
export type MediaProviderMode = "hostinger-fs" | "hostinger-bridge" | "local-dev";

export interface MediaAssetItem {
  folder: MediaFolder;
  filename: string;
  url: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  updatedAt: string;
}

export interface MediaUploadResult {
  item: MediaAssetItem;
  url: string;
  provider: MediaProviderMode;
}

const DEFAULT_HOSTINGER_MEDIA_DIR = "/home/u520776094/domains/media.orva-store.com/public_html";
const ALLOWED_FOLDERS = new Set<MediaFolder>(["products", "branding"]);
const ALLOWED_EXT_RE = /\.(jpg|jpeg|png|webp|gif|avif)$/i;
const SAFE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,115}\.(jpg|jpeg|png|webp|gif|avif)$/i;

export function sanitizeMediaFolder(value: unknown, fallback: MediaFolder = "products"): MediaFolder {
  const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (ALLOWED_FOLDERS.has(clean as MediaFolder)) {
    return clean as MediaFolder;
  }
  return fallback;
}

export function slugifyMediaStem(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "image";
}

export function assertSafeFilename(filename: string): string {
  const raw = String(filename || "").trim();
  if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw new Error("اسم الملف غير صالح.");
  }
  if (!SAFE_FILENAME_RE.test(raw)) {
    throw new Error("اسم الملف يحتوي على أحرف أو امتداد غير مسموح به.");
  }
  return raw;
}

export function buildMediaPublicUrl(publicBaseUrl: string, folder: MediaFolder, filename: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return `${base}/${folder}/${encodeURIComponent(filename)}`;
}

function getLocalDevUploadsDir(): string {
  const cwd = process.cwd();
  const inner = path.join(cwd, "next-shadcn-admin-dashboard-baseui-main", "public", "uploads");
  if (fs.existsSync(path.join(cwd, "next-shadcn-admin-dashboard-baseui-main", "public"))) {
    return inner;
  }
  return path.join(cwd, "public", "uploads");
}

function canReadWriteDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false;
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedMediaBackend {
  mode: MediaProviderMode;
  fsRootDir: string | null;
  publicBaseUrl: string;
  bridgeEndpoint: string;
  bridgeSecret: string;
}

export async function resolveMediaBackend(): Promise<ResolvedMediaBackend> {
  const bridge = await getMediaBridgeConfigAction().catch(() => ({
    publicBaseUrl: (process.env.MEDIA_PUBLIC_BASE_URL || "https://media.orva-store.com").replace(/\/+$/, ""),
    endpoint: (process.env.MEDIA_UPLOAD_ENDPOINT || "https://media.orva-store.com/api-media.php").trim(),
    secret: (process.env.MEDIA_UPLOAD_SECRET || "").trim(),
  }));

  const forced = (process.env.MEDIA_STORAGE_PROVIDER || "").trim().toLowerCase();
  const explicitFsDir = (process.env.MEDIA_STORAGE_DIR || "").trim();
  const candidateFsDir = explicitFsDir || DEFAULT_HOSTINGER_MEDIA_DIR;

  if (forced !== "bridge" && forced !== "local-dev" && canReadWriteDir(candidateFsDir)) {
    return {
      mode: "hostinger-fs",
      fsRootDir: candidateFsDir,
      publicBaseUrl: bridge.publicBaseUrl,
      bridgeEndpoint: bridge.endpoint,
      bridgeSecret: bridge.secret,
    };
  }

  if (forced !== "local-dev" && bridge.endpoint && bridge.secret.length >= 32) {
    return {
      mode: "hostinger-bridge",
      fsRootDir: null,
      publicBaseUrl: bridge.publicBaseUrl,
      bridgeEndpoint: bridge.endpoint,
      bridgeSecret: bridge.secret,
    };
  }

  if (process.env.NODE_ENV !== "production" || forced === "local-dev") {
    return {
      mode: "local-dev",
      fsRootDir: getLocalDevUploadsDir(),
      publicBaseUrl: "/uploads",
      bridgeEndpoint: "",
      bridgeSecret: "",
    };
  }

  throw new Error(
    "تعذر الوصول إلى خزنة الوسائط على Hostinger (media.orva-store.com). تأكد من صلاحيات المجلد أو إعدادات الجسر السري."
  );
}

async function resolveMaxUploadBytes(explicitMaxMb?: number): Promise<{ maxMb: number; maxBytes: number }> {
  if (explicitMaxMb !== undefined) {
    const clamped = clampMaxUploadSizeMb(explicitMaxMb);
    return { maxMb: clamped, maxBytes: clamped * 1024 * 1024 };
  }
  const settings = await getMediaSettingsAction().catch(() => ({
    maxUploadSizeMb: 10,
    webpCompressionEnabled: true,
    webpQuality: 0.85,
  }));
  const clamped = clampMaxUploadSizeMb(settings.maxUploadSizeMb);
  return { maxMb: clamped, maxBytes: clamped * 1024 * 1024 };
}

async function writeAtomicFsFile(
  rootDir: string,
  folder: MediaFolder,
  filename: string,
  bytes: Buffer,
  publicBaseUrl: string
): Promise<MediaAssetItem> {
  const folderDir = path.join(rootDir, folder);
  await fsp.mkdir(folderDir, { recursive: true });
  const targetPath = path.join(folderDir, filename);
  const stagePath = path.join(folderDir, `.tmp-${crypto.randomBytes(8).toString("hex")}-${filename}`);

  try {
    await fsp.writeFile(stagePath, bytes);
    await fsp.chmod(stagePath, 0o644).catch(() => undefined);
    await fsp.rename(stagePath, targetPath);
  } catch (err) {
    await fsp.unlink(stagePath).catch(() => undefined);
    throw err;
  }

  const stat = await fsp.stat(targetPath);
  const inspected = inspectImageBuffer(bytes);
  return {
    folder,
    filename,
    url: buildMediaPublicUrl(publicBaseUrl, folder, filename),
    sizeBytes: stat.size,
    width: inspected.width,
    height: inspected.height,
    mimeType: inspected.mimeType,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function uploadViaBridge(
  backend: ResolvedMediaBackend,
  folder: MediaFolder,
  filename: string,
  bytes: Buffer,
  mimeType: string,
  maxBytes: number
): Promise<MediaAssetItem> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  form.set("folder", folder);
  form.set("filename", filename);
  form.set("maxBytes", String(maxBytes));
  form.set("file", blob, filename);

  const separator = backend.bridgeEndpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${backend.bridgeEndpoint}${separator}action=upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backend.bridgeSecret}`,
      "X-Media-Secret": backend.bridgeSecret,
    },
    body: form,
    cache: "no-store",
  });

  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string; item?: MediaAssetItem } | null;
  if (!res.ok || !body?.success || !body.item) {
    throw new Error(body?.error || `فشل رفع الصورة إلى سيرفر الوسائط (HTTP ${res.status})`);
  }
  return body.item;
}

export async function uploadMediaBuffer(params: {
  bytes: Buffer;
  name?: string;
  folder?: MediaFolder;
  claimedMime?: string | null;
  maxUploadSizeMb?: number;
}): Promise<MediaUploadResult> {
  const folder = sanitizeMediaFolder(params.folder, "products");
  const { maxMb, maxBytes } = await resolveMaxUploadBytes(params.maxUploadSizeMb);

  if (!params.bytes || params.bytes.length === 0) {
    throw new Error("الملف المرفوع فارغ.");
  }
  if (params.bytes.length > maxBytes) {
    throw new Error(`حجم الصورة (${(params.bytes.length / (1024 * 1024)).toFixed(2)} MB) يتجاوز الحد الأقصى المضبوط في لوحة التحكم (${maxMb} MB).`);
  }

  const inspected = inspectImageBuffer(params.bytes, params.claimedMime);
  const stem = slugifyMediaStem(params.name || "image");
  const uniquePrefix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const filename = assertSafeFilename(`${uniquePrefix}-${stem}.${inspected.ext}`);

  const backend = await resolveMediaBackend();

  if (backend.mode === "hostinger-fs" && backend.fsRootDir) {
    try {
      const item = await writeAtomicFsFile(backend.fsRootDir, folder, filename, params.bytes, backend.publicBaseUrl);
      return { item, url: item.url, provider: "hostinger-fs" };
    } catch (fsErr) {
      if (backend.bridgeEndpoint && backend.bridgeSecret.length >= 32) {
        const item = await uploadViaBridge(backend, folder, filename, params.bytes, inspected.mimeType, maxBytes);
        return { item, url: item.url, provider: "hostinger-bridge" };
      }
      throw fsErr;
    }
  }

  if (backend.mode === "hostinger-bridge") {
    const item = await uploadViaBridge(backend, folder, filename, params.bytes, inspected.mimeType, maxBytes);
    return { item, url: item.url, provider: "hostinger-bridge" };
  }

  if (backend.mode === "local-dev" && backend.fsRootDir) {
    const item = await writeAtomicFsFile(backend.fsRootDir, folder, filename, params.bytes, backend.publicBaseUrl);
    return { item, url: item.url, provider: "local-dev" };
  }

  throw new Error("لا توجد قناة صالحة لتخزين الوسائط.");
}

export async function uploadMediaDataUrl(params: {
  dataUrl: string;
  name?: string;
  folder?: MediaFolder;
  maxUploadSizeMb?: number;
}): Promise<MediaUploadResult> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(params.dataUrl.trim());
  if (!match) {
    throw new Error("صيغة البيانات غير صالحة (يجب أن تكون صورة Base64).");
  }
  const [, claimedMime, base64Body] = match;
  if (claimedMime.toLowerCase().includes("svg")) {
    throw new Error("ملفات SVG غير مدعومة لأسباب أمنية. يرجى رفع PNG أو JPG أو WebP.");
  }
  const bytes = Buffer.from(base64Body, "base64");
  return uploadMediaBuffer({
    bytes,
    name: params.name,
    folder: params.folder,
    claimedMime,
    maxUploadSizeMb: params.maxUploadSizeMb,
  });
}

async function listFsAssets(rootDir: string, publicBaseUrl: string): Promise<MediaAssetItem[]> {
  const items: MediaAssetItem[] = [];
  for (const folder of ["products", "branding"] as MediaFolder[]) {
    const dir = path.join(rootDir, folder);
    if (!fs.existsSync(dir)) continue;
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith(".") || !ALLOWED_EXT_RE.test(entry.name)) continue;
      if (!SAFE_FILENAME_RE.test(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      try {
        const [stat, bytes] = await Promise.all([fsp.stat(fullPath), fsp.readFile(fullPath)]);
        const inspected = inspectImageBuffer(bytes);
        items.push({
          folder,
          filename: entry.name,
          url: buildMediaPublicUrl(publicBaseUrl, folder, entry.name),
          sizeBytes: stat.size,
          width: inspected.width,
          height: inspected.height,
          mimeType: inspected.mimeType,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // Ignore corrupted or non-image stray files
      }
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function listBridgeAssets(backend: ResolvedMediaBackend): Promise<MediaAssetItem[]> {
  const separator = backend.bridgeEndpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${backend.bridgeEndpoint}${separator}action=list`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${backend.bridgeSecret}`,
      "X-Media-Secret": backend.bridgeSecret,
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string; items?: MediaAssetItem[] } | null;
  if (!res.ok || !body?.success || !Array.isArray(body.items)) {
    throw new Error(body?.error || `تعذر قراءة قائمة الوسائط من Hostinger (HTTP ${res.status})`);
  }
  return body.items;
}

export async function listMediaAssets(): Promise<{ provider: MediaProviderMode; publicBaseUrl: string; items: MediaAssetItem[] }> {
  const backend = await resolveMediaBackend();
  if (backend.mode === "hostinger-fs" && backend.fsRootDir) {
    try {
      const items = await listFsAssets(backend.fsRootDir, backend.publicBaseUrl);
      return { provider: "hostinger-fs", publicBaseUrl: backend.publicBaseUrl, items };
    } catch (err) {
      if (backend.bridgeEndpoint && backend.bridgeSecret.length >= 32) {
        const items = await listBridgeAssets(backend);
        return { provider: "hostinger-bridge", publicBaseUrl: backend.publicBaseUrl, items };
      }
      throw err;
    }
  }
  if (backend.mode === "hostinger-bridge") {
    const items = await listBridgeAssets(backend);
    return { provider: "hostinger-bridge", publicBaseUrl: backend.publicBaseUrl, items };
  }
  if (backend.mode === "local-dev" && backend.fsRootDir) {
    const items = await listFsAssets(backend.fsRootDir, backend.publicBaseUrl);
    return { provider: "local-dev", publicBaseUrl: backend.publicBaseUrl, items };
  }
  return { provider: backend.mode, publicBaseUrl: backend.publicBaseUrl, items: [] };
}

export async function renameMediaAsset(params: {
  folder: MediaFolder;
  filename: string;
  newName: string;
}): Promise<{ oldUrl: string; newUrl: string; item: MediaAssetItem; provider: MediaProviderMode }> {
  const folder = sanitizeMediaFolder(params.folder);
  const oldFilename = assertSafeFilename(params.filename);
  const currentExt = path.extname(oldFilename).replace(/^\./, "").toLowerCase();

  // Preserve original binary extension so file content and extension never diverge
  const sanitizedStem = slugifyMediaStem(params.newName);
  const targetFilename = assertSafeFilename(`${sanitizedStem}.${currentExt}`);

  const backend = await resolveMediaBackend();

  if (backend.mode === "hostinger-fs" && backend.fsRootDir) {
    const dir = path.join(backend.fsRootDir, folder);
    const oldPath = path.join(dir, oldFilename);
    const newPath = path.join(dir, targetFilename);
    if (!fs.existsSync(oldPath)) throw new Error("الملف المطلوب إعادة تسميته غير موجود.");
    if (oldPath !== newPath && fs.existsSync(newPath)) {
      throw new Error("يوجد ملف آخر بنفس هذا الاسم بالفعل. اختر اسماً مختلفاً.");
    }
    if (oldPath !== newPath) {
      await fsp.rename(oldPath, newPath);
    }
    const [stat, bytes] = await Promise.all([fsp.stat(newPath), fsp.readFile(newPath)]);
    const inspected = inspectImageBuffer(bytes);
    const oldUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, oldFilename);
    const newUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, targetFilename);
    return {
      oldUrl,
      newUrl,
      provider: "hostinger-fs",
      item: {
        folder,
        filename: targetFilename,
        url: newUrl,
        sizeBytes: stat.size,
        width: inspected.width,
        height: inspected.height,
        mimeType: inspected.mimeType,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  if (backend.mode === "hostinger-bridge") {
    const separator = backend.bridgeEndpoint.includes("?") ? "&" : "?";
    const res = await fetch(`${backend.bridgeEndpoint}${separator}action=rename`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backend.bridgeSecret}`,
        "X-Media-Secret": backend.bridgeSecret,
      },
      body: JSON.stringify({ folder, filename: oldFilename, newName: targetFilename }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      oldUrl?: string;
      newUrl?: string;
      item?: MediaAssetItem;
    } | null;
    if (!res.ok || !body?.success || !body.item || !body.oldUrl || !body.newUrl) {
      throw new Error(body?.error || `فشلت إعادة التسمية (HTTP ${res.status})`);
    }
    return { oldUrl: body.oldUrl, newUrl: body.newUrl, item: body.item, provider: "hostinger-bridge" };
  }

  if (backend.mode === "local-dev" && backend.fsRootDir) {
    const dir = path.join(backend.fsRootDir, folder);
    const oldPath = path.join(dir, oldFilename);
    const newPath = path.join(dir, targetFilename);
    if (!fs.existsSync(oldPath)) throw new Error("الملف المطلوب إعادة تسميته غير موجود.");
    if (oldPath !== newPath && fs.existsSync(newPath)) {
      throw new Error("يوجد ملف آخر بنفس هذا الاسم بالفعل. اختر اسماً مختلفاً.");
    }
    if (oldPath !== newPath) await fsp.rename(oldPath, newPath);
    const [stat, bytes] = await Promise.all([fsp.stat(newPath), fsp.readFile(newPath)]);
    const inspected = inspectImageBuffer(bytes);
    const oldUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, oldFilename);
    const newUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, targetFilename);
    return {
      oldUrl,
      newUrl,
      provider: "local-dev",
      item: {
        folder,
        filename: targetFilename,
        url: newUrl,
        sizeBytes: stat.size,
        width: inspected.width,
        height: inspected.height,
        mimeType: inspected.mimeType,
        updatedAt: stat.mtime.toISOString(),
      },
    };
  }

  throw new Error("تعذر تنفيذ إعادة التسمية.");
}

export async function deleteMediaAsset(params: {
  folder: MediaFolder;
  filename: string;
}): Promise<{ deleted: true; url: string; provider: MediaProviderMode }> {
  const folder = sanitizeMediaFolder(params.folder);
  const filename = assertSafeFilename(params.filename);
  const backend = await resolveMediaBackend();
  const publicUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, filename);

  if (backend.mode === "hostinger-fs" && backend.fsRootDir) {
    const targetPath = path.join(backend.fsRootDir, folder, filename);
    if (!fs.existsSync(targetPath)) throw new Error("الملف غير موجود.");
    await fsp.unlink(targetPath);
    return { deleted: true, url: publicUrl, provider: "hostinger-fs" };
  }

  if (backend.mode === "hostinger-bridge") {
    const separator = backend.bridgeEndpoint.includes("?") ? "&" : "?";
    const res = await fetch(`${backend.bridgeEndpoint}${separator}action=delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backend.bridgeSecret}`,
        "X-Media-Secret": backend.bridgeSecret,
      },
      body: JSON.stringify({ folder, filename }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
    if (!res.ok || !body?.success) {
      throw new Error(body?.error || `فشل حذف الملف (HTTP ${res.status})`);
    }
    return { deleted: true, url: publicUrl, provider: "hostinger-bridge" };
  }

  if (backend.mode === "local-dev" && backend.fsRootDir) {
    const targetPath = path.join(backend.fsRootDir, folder, filename);
    if (!fs.existsSync(targetPath)) throw new Error("الملف غير موجود.");
    await fsp.unlink(targetPath);
    return { deleted: true, url: publicUrl, provider: "local-dev" };
  }

  throw new Error("تعذر تنفيذ الحذف.");
}
