"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileImage,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { prepareImageForUpload } from "@/lib/media/client-image-compress";

interface MediaUsageLocation {
  kind: "product" | "product_media" | "store_logo";
  label: string;
  role: string;
  entityId?: string;
  slug?: string;
  href?: string;
}

interface MediaAssetRecord {
  folder: "products" | "branding";
  filename: string;
  url: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  updatedAt: string;
  usages: MediaUsageLocation[];
  usageCount: number;
}

interface MediaSettingsState {
  maxUploadSizeMb: number;
  webpCompressionEnabled: boolean;
  webpQuality: number;
}

interface LegacyMigrationStatus {
  legacyUrlCount: number;
  legacyUrls: string[];
  affectedProducts: Array<{ id: string; name: string; slug: string }>;
  bucketObjectCount: number;
  canCleanupBucket: boolean;
}

const SIZE_PRESETS = [4, 10, 25, 50, 100] as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("orva_admin_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export default function MediaLibraryPage() {
  const [items, setItems] = React.useState<MediaAssetRecord[]>([]);
  const [provider, setProvider] = React.useState<string>("hostinger-fs");
  const [publicBaseUrl, setPublicBaseUrl] = React.useState<string>("https://media.orva-store.com");
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Settings state (4MB – 100MB ladder + WebP toggle)
  const [maxUploadSizeMb, setMaxUploadSizeMb] = React.useState<number>(10);
  const [webpCompressionEnabled, setWebpCompressionEnabled] = React.useState<boolean>(true);
  const [webpQuality, setWebpQuality] = React.useState<number>(0.85);
  const [savingSettings, setSavingSettings] = React.useState<boolean>(false);

  // Upload state
  const [uploadFolder, setUploadFolder] = React.useState<"products" | "branding">("products");
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [uploadSummary, setUploadSummary] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Filters
  const [search, setSearch] = React.useState<string>("");
  const [folderFilter, setFolderFilter] = React.useState<"all" | "products" | "branding">("all");
  const [usageFilter, setUsageFilter] = React.useState<"all" | "used" | "unused">("all");
  const [sortBy, setSortBy] = React.useState<"newest" | "largest" | "name">("newest");

  // Inspector Drawer state
  const [selected, setSelected] = React.useState<MediaAssetRecord | null>(null);
  const [renameStem, setRenameStem] = React.useState<string>("");
  const [updateReferencesOnRename, setUpdateReferencesOnRename] = React.useState<boolean>(true);
  const [renaming, setRenaming] = React.useState<boolean>(false);
  const [deleting, setDeleting] = React.useState<boolean>(false);
  const [deleteConflictUsages, setDeleteConflictUsages] = React.useState<MediaUsageLocation[] | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState<boolean>(false);
  const [legacyStatus, setLegacyStatus] = React.useState<LegacyMigrationStatus | null>(null);
  const [migratingLegacy, setMigratingLegacy] = React.useState<boolean>(false);
  const [cleaningLegacyBucket, setCleaningLegacyBucket] = React.useState<boolean>(false);

  const loadMedia = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mediaResult, legacyResult] = await Promise.allSettled([
        fetch("/api/media", {
          method: "GET",
          headers: getAuthHeaders(),
          credentials: "same-origin",
          cache: "no-store",
        }),
        fetch("/api/media/migrate-legacy", {
          method: "GET",
          headers: getAuthHeaders(),
          credentials: "same-origin",
          cache: "no-store",
        }),
      ]);

      if (mediaResult.status !== "fulfilled") {
        throw mediaResult.reason;
      }
      const res = mediaResult.value;
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر تحميل مكتبة الوسائط.");
      }

      if (legacyResult.status === "fulfilled" && legacyResult.value.ok) {
        const legacyJson = await legacyResult.value.json().catch(() => null);
        if (legacyJson?.success) {
          setLegacyStatus({
            legacyUrlCount: Number(legacyJson.legacyUrlCount) || 0,
            legacyUrls: Array.isArray(legacyJson.legacyUrls) ? legacyJson.legacyUrls : [],
            affectedProducts: Array.isArray(legacyJson.affectedProducts) ? legacyJson.affectedProducts : [],
            bucketObjectCount: Number(legacyJson.bucketObjectCount) || 0,
            canCleanupBucket: Boolean(legacyJson.canCleanupBucket),
          });
        }
      }

      const nextItems: MediaAssetRecord[] = Array.isArray(json.items) ? json.items : [];
      setItems(nextItems);
      setProvider(json.provider || "hostinger-fs");
      setPublicBaseUrl(json.publicBaseUrl || "https://media.orva-store.com");
      if (json.settings) {
        const s = json.settings as MediaSettingsState;
        setMaxUploadSizeMb(Number(s.maxUploadSizeMb) || 10);
        setWebpCompressionEnabled(s.webpCompressionEnabled !== false);
        setWebpQuality(Number(s.webpQuality) || 0.85);
      }
      setSelected((prev) =>
        prev
          ? nextItems.find((x) => x.folder === prev.folder && x.filename === prev.filename) ?? null
          : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الاتصال بخادم الوسائط.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const handleMigrateLegacy = async () => {
    setMigratingLegacy(true);
    try {
      const res = await fetch("/api/media/migrate-legacy", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ action: "migrate" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر ترحيل الصور القديمة.");
      }
      const migratedCount = Array.isArray(json.migrated) ? json.migrated.length : 0;
      toast.add({
        title: "تم ترحيل الصور القديمة بنجاح",
        description:
          migratedCount > 0
            ? `تم نقل وربط ${migratedCount} صورة على سيرفر Hostinger (${publicBaseUrl}). الروابط المتبقية في Supabase: ${json.legacyUrlCount ?? 0}.`
            : "لا توجد روابط قديمة متبقية في قاعدة البيانات.",
        type: "success",
      });
      await loadMedia();
    } catch (err) {
      toast.add({
        title: "فشل ترحيل الصور القديمة",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setMigratingLegacy(false);
    }
  };

  const handleCleanupLegacyBucket = async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "هل أنت متأكد من حذف الملفات المؤرشفة في سلة Supabase product-images؟ (تأكد من أن جميع الصور تعمل الآن من Hostinger)"
      )
    ) {
      return;
    }
    setCleaningLegacyBucket(true);
    try {
      const res = await fetch("/api/media/migrate-legacy", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ action: "cleanup_bucket" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر تنظيف سلة Supabase.");
      }
      toast.add({
        title: "تم تنظيف أرشيف Supabase Storage",
        description: `تمت إزالة ${json.deletedCount ?? 0} ملف قديم من سلة product-images بأمان.`,
        type: "success",
      });
      await loadMedia();
    } catch (err) {
      toast.add({
        title: "تعذر التنظيف",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setCleaningLegacyBucket(false);
    }
  };

  const openInspector = (item: MediaAssetRecord) => {
    setSelected(item);
    setRenameStem(item.filename.replace(/\.[a-z0-9]+$/i, ""));
    setDeleteConflictUsages(null);
    setCopiedUrl(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/media/settings", {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({
          maxUploadSizeMb,
          webpCompressionEnabled,
          webpQuality,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "فشل حفظ الإعدادات.");
      }
      setMaxUploadSizeMb(json.settings.maxUploadSizeMb);
      setWebpCompressionEnabled(json.settings.webpCompressionEnabled);
      setWebpQuality(json.settings.webpQuality);
      toast.add({
        title: "تم حفظ إعدادات الوسائط",
        description: `الحد الأقصى للرفع الآن ${json.settings.maxUploadSizeMb} MB (بدون تقييد للمقاسات).`,
        type: "success",
      });
    } catch (err) {
      toast.add({
        title: "تعذر حفظ الإعدادات",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadSummary(null);
    setError(null);

    try {
      const form = new FormData();
      form.set("folder", uploadFolder);
      const maxBytes = maxUploadSizeMb * 1024 * 1024;
      let totalOriginal = 0;
      let totalFinal = 0;

      for (let i = 0; i < fileList.length; i++) {
        const rawFile = fileList[i];
        const prepared = await prepareImageForUpload(rawFile, {
          webpEnabled: webpCompressionEnabled,
          quality: webpQuality,
        });
        totalOriginal += prepared.originalBytes;
        totalFinal += prepared.finalBytes;

        if (prepared.file.size > maxBytes) {
          throw new Error(
            `حجم الملف «${prepared.file.name}» (${formatBytes(prepared.file.size)}) يتجاوز الحد الأقصى المضبوط (${maxUploadSizeMb} MB).`
          );
        }
        form.append("files", prepared.file, prepared.file.name);
      }

      const res = await fetch("/api/media", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "same-origin",
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "فشل رفع الملفات.");
      }

      const count = Array.isArray(json.items) ? json.items.length : 1;
      const savedPct =
        totalOriginal > totalFinal
          ? Math.round(((totalOriginal - totalFinal) / totalOriginal) * 100)
          : 0;
      const msg =
        savedPct > 0
          ? `تم رفع ${count} ملف بنجاح إلى ${uploadFolder}/ مع توفير ${savedPct}% عبر ضغط WebP (${formatBytes(totalOriginal)} → ${formatBytes(totalFinal)}).`
          : `تم رفع ${count} ملف بنجاح إلى ${uploadFolder}/ (${formatBytes(totalFinal)}).`;
      setUploadSummary(msg);
      toast.add({ title: "تم رفع الوسائط", description: msg, type: "success" });
      await loadMedia();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "فشل رفع الصور.";
      setError(msg);
      toast.add({ title: "تعذر الرفع", description: msg, type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async () => {
    if (!selected || !renameStem.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch("/api/media", {
        method: "PATCH",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({
          folder: selected.folder,
          filename: selected.filename,
          newName: renameStem.trim(),
          updateReferences: updateReferencesOnRename,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر تغيير اسم الملف.");
      }
      const rw = json.rewriteSummary;
      const rwParts: string[] = [];
      if (rw?.updatedProducts) rwParts.push(`${rw.updatedProducts} منتج`);
      if (rw?.updatedProductMedia) rwParts.push(`${rw.updatedProductMedia} سجل وسائط`);
      if (rw?.updatedLogo) rwParts.push("شعار المتجر");

      toast.add({
        title: "تم تغيير الاسم بنجاح",
        description:
          rwParts.length > 0
            ? `الاسم الجديد: ${json.item.filename} — وتم تحديث الروابط تلقائياً في: ${rwParts.join("، ")}.`
            : `الاسم الجديد: ${json.item.filename}`,
        type: "success",
      });

      await loadMedia();
      if (json.item) {
        setSelected(json.item);
        setRenameStem(json.item.filename.replace(/\.[a-z0-9]+$/i, ""));
      }
    } catch (err) {
      toast.add({
        title: "فشل تغيير الاسم",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (force = false) => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/media", {
        method: "DELETE",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({
          folder: selected.folder,
          filename: selected.filename,
          force,
          unlinkReferences: force,
        }),
      });
      const json = await res.json().catch(() => null);

      if (res.status === 409 && json?.code === "MEDIA_IN_USE") {
        setDeleteConflictUsages(json.usages || selected.usages);
        return;
      }

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "فشل حذف الملف.");
      }

      toast.add({
        title: "تم حذف الصورة",
        description: force
          ? `حُذفت الصورة ${selected.filename} وتم فك ارتباطها بأمان من المنتجات.`
          : `حُذفت الصورة ${selected.filename} من سيرفر الوسائط.`,
        type: "success",
      });
      setSelected(null);
      setDeleteConflictUsages(null);
      await loadMedia();
    } catch (err) {
      toast.add({
        title: "تعذر الحذف",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast.add({ title: "تم نسخ الرابط", description: url, type: "success" });
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      toast.add({ title: "تعذر النسخ", type: "error" });
    }
  };

  const stats = React.useMemo(() => {
    const totalBytes = items.reduce((acc, i) => acc + (i.sizeBytes || 0), 0);
    const usedCount = items.filter((i) => i.usageCount > 0).length;
    return {
      totalCount: items.length,
      totalBytes,
      usedCount,
      unusedCount: items.length - usedCount,
    };
  }, [items]);

  const filteredItems = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((item) => {
      if (folderFilter !== "all" && item.folder !== folderFilter) return false;
      if (usageFilter === "used" && item.usageCount === 0) return false;
      if (usageFilter === "unused" && item.usageCount > 0) return false;
      if (!q) return true;
      return (
        item.filename.toLowerCase().includes(q) ||
        item.usages.some((u) => u.label.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === "largest") return b.sizeBytes - a.sizeBytes;
      if (sortBy === "name") return a.filename.localeCompare(b.filename);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items, folderFilter, usageFilter, search, sortBy]);

  const selectedExt = selected?.filename.match(/(\.[a-z0-9]+)$/i)?.[1] ?? "";

  return (
    <main className="space-y-6" dir="rtl">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            <FolderOpen className="size-7 text-primary" />
            مكتبة وسائط ORVA Store
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة مركزية للصور على Hostinger ({publicBaseUrl}) — مقاسات بكسل غير مقيدة، تحكم بالاسم، كشف أماكن الاستخدام، وحماية من استهلاك Supabase Egress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <Server className="size-3.5" />
            {provider === "hostinger-fs"
              ? "متصل بقرص Hostinger مباشرة"
              : provider === "hostinger-bridge"
                ? "متصل بجسر Hostinger HTTPS"
                : "وضع التطوير المحلي"}
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMedia()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </header>

      {/* Legacy Supabase Storage Migration Warning / Status Banner */}
      {legacyStatus && legacyStatus.legacyUrlCount > 0 ? (
        <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-4 text-amber-600" />
          <AlertTitle className="flex flex-wrap items-center justify-between gap-2 font-bold">
            <span>
              تنبيه: تم رصد {legacyStatus.legacyUrlCount} رابط صور قديم في قاعدة البيانات ما زال يستهلك Supabase Cached Egress
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleMigrateLegacy()}
              disabled={migratingLegacy}
              className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
            >
              {migratingLegacy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {migratingLegacy ? "جاري الترحيل..." : "ترحيل الصور القديمة إلى Hostinger الآن"}
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs leading-relaxed">
            سيتم نسخ الصور إلى {publicBaseUrl}/products/ وتحديث روابط المنتجات تلقائياً بنقرة واحدة بدون حذف الملفات من Supabase حتى تتأكد بنفسك.
            {legacyStatus.affectedProducts.length > 0 && (
              <span className="mt-1 block font-medium">
                المنتجات المتأثرة: {legacyStatus.affectedProducts.map((p) => p.name).join("، ")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : legacyStatus && legacyStatus.bucketObjectCount > 0 ? (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100">
          <Check className="size-4 text-emerald-600" />
          <AlertTitle className="flex flex-wrap items-center justify-between gap-2 font-bold">
            <span>جميع روابط المتجر تشتغل الآن من Hostinger (0 روابط Supabase في قاعدة البيانات)</span>
            {legacyStatus.canCleanupBucket && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCleanupLegacyBucket()}
                disabled={cleaningLegacyBucket}
                className="gap-1.5 border-emerald-600/40 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200"
              >
                {cleaningLegacyBucket ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {cleaningLegacyBucket
                  ? "جاري تنظيف السلة..."
                  : `تنظيف أرشيف Supabase القديم (${legacyStatus.bucketObjectCount} ملفات)`}
              </Button>
            )}
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            توجد {legacyStatus.bucketObjectCount} ملفات مؤرشفة في سلة product-images القديمة كنسخة أمان؛ لا تستهلك أي Egress طالما لم تعد مستخدمة ويمكنك تنظيفها متى أردت.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>إجمالي الملفات</span>
            <FileImage className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums">{stats.totalCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>المساحة المستخدمة على Hostinger</span>
            <HardDrive className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums">{formatBytes(stats.totalBytes)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>صور نشطة في المتجر</span>
            <Check className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600 tabular-nums">{stats.usedCount}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>صور غير مستخدمة</span>
            <Sparkles className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-600 tabular-nums">{stats.unusedCount}</div>
        </Card>
      </section>

      {/* Settings Ladder (4MB – 100MB) + Upload Box */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Settings Card */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">تخصيص حجم الرفع والضغط (Admin Media Rules)</CardTitle>
            <CardDescription className="text-xs">
              المقاسات (العرض × الارتفاع) غير مقيدة تماماً. تحكّم فقط بالحد الأقصى لحجم الملف من 4 إلى 100 ميغابايت واحفظ التغيير.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">سلم الحد الأقصى لحجم الملف</Label>
                <Badge className="font-mono text-xs">{maxUploadSizeMb} MB</Badge>
              </div>
              <div dir="ltr" className="py-1">
                <Slider
                  min={4}
                  max={100}
                  step={1}
                  value={[maxUploadSizeMb]}
                  onValueChange={(vals) => {
                    const next = Array.isArray(vals) ? Number(vals[0]) : Number(vals);
                    if (Number.isFinite(next)) setMaxUploadSizeMb(Math.min(100, Math.max(4, Math.round(next))));
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                {SIZE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    size="xs"
                    variant={maxUploadSizeMb === preset ? "default" : "outline"}
                    onClick={() => setMaxUploadSizeMb(preset)}
                    className="font-mono"
                  >
                    {preset} MB
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
              <div className="space-y-0.5">
                <Label htmlFor="media-webp-toggle" className="cursor-pointer text-xs font-bold">
                  ضغط تلقائي بصيغة WebP قبل الرفع
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  يقلّص حجم الملف مع الحفاظ 100% على أبعاد الصورة الأصلية دون أي تصغير أو قص.
                </p>
              </div>
              <Switch
                id="media-webp-toggle"
                checked={webpCompressionEnabled}
                onCheckedChange={(checked) => setWebpCompressionEnabled(Boolean(checked))}
              />
            </div>

            {webpCompressionEnabled && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
                <span className="text-muted-foreground">جودة ضغط WebP:</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: "اقتصادي (75%)", val: 0.75 },
                    { label: "متوازن (85%)", val: 0.85 },
                    { label: "فائق (92%)", val: 0.92 },
                  ].map((q) => (
                    <Button
                      key={q.val}
                      type="button"
                      size="xs"
                      variant={Math.abs(webpQuality - q.val) < 0.02 ? "default" : "outline"}
                      onClick={() => setWebpQuality(q.val)}
                    >
                      {q.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <Button type="button" onClick={() => void handleSaveSettings()} disabled={savingSettings} className="w-full gap-1.5">
              {savingSettings ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {savingSettings ? "جارٍ الحفظ في قاعدة البيانات..." : "حفظ إعدادات الحجم والضغط"}
            </Button>
          </CardContent>
        </Card>

        {/* Upload Zone Card */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold">رفع صور جديدة إلى مكتبة Hostinger</CardTitle>
                <CardDescription className="text-xs">
                  صيغ مدعومة: JPG, PNG, WebP, GIF, AVIF · مقاسات حرة · حتى {maxUploadSizeMb} MB للملف.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={uploadFolder === "products" ? "default" : "outline"}
                  onClick={() => setUploadFolder("products")}
                >
                  مجلد المنتجات (products)
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={uploadFolder === "branding" ? "default" : "outline"}
                  onClick={() => setUploadFolder("branding")}
                >
                  الشعارات (branding)
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleUploadFiles(e.dataTransfer.files);
              }}
              className="flex min-h-[210px] flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition hover:bg-muted/30"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => void handleUploadFiles(e.target.files)}
              />
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                {uploading ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
              </div>
              <p className="text-sm font-semibold">
                {uploading ? "جارٍ معالجة ورفع الصور إلى media.orva-store.com..." : "اسحب الصور وأفلتها هنا، أو اضغط للاختيار"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {webpCompressionEnabled
                  ? `ضغط WebP التلقائي مفعّل (${Math.round(webpQuality * 100)}%) بدون تقييد للأبعاد`
                  : "الرفع بالصيغة والأبعاد الأصلية بدون ضغط"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                اختيار ملفات من الجهاز
              </Button>
            </div>

            {uploadSummary && (
              <Alert className="border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs">
                <Check className="size-4 text-emerald-600" />
                <AlertDescription className="text-emerald-800 dark:text-emerald-200">{uploadSummary}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="py-2.5 text-xs">
                <AlertTriangle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Library Grid */}
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم الصورة أو اسم المنتج المستخدمة فيه..."
                className="pr-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "الكل" },
                  { id: "products", label: "المنتجات" },
                  { id: "branding", label: "الشعارات" },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="xs"
                  variant={folderFilter === tab.id ? "default" : "outline"}
                  onClick={() => setFolderFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}

              <span className="mx-1 text-muted-foreground">|</span>

              {(
                [
                  { id: "all", label: "كل الحالات" },
                  { id: "used", label: "مستخدمة" },
                  { id: "unused", label: "غير مستخدمة" },
                ] as const
              ).map((u) => (
                <Button
                  key={u.id}
                  type="button"
                  size="xs"
                  variant={usageFilter === u.id ? "secondary" : "ghost"}
                  onClick={() => setUsageFilter(u.id)}
                >
                  {u.label}
                </Button>
              ))}

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "largest" | "name")}
                className="h-7 rounded-md border bg-background px-2 text-xs"
              >
                <option value="newest">الأحدث</option>
                <option value="largest">الأكبر حجماً</option>
                <option value="name">الاسم (A-Z)</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              جارٍ فحص مكتبة الوسائط وأماكن الاستخدام...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <ImageIcon className="mx-auto mb-2 size-10 opacity-35" />
              لا توجد وسائط مطابقة للفلتر الحالي.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => (
                <article
                  key={`${item.folder}/${item.filename}`}
                  onClick={() => openInspector(item)}
                  className="group cursor-pointer overflow-hidden rounded-xl border bg-card transition hover:border-primary/50 hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.filename} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                    <Badge className="absolute top-2 right-2 bg-background/90 text-[10px] text-foreground backdrop-blur">
                      {item.folder}
                    </Badge>
                    <Badge
                      variant={item.usageCount > 0 ? "default" : "secondary"}
                      className={`absolute bottom-2 left-2 text-[10px] ${
                        item.usageCount > 0 ? "bg-emerald-600 text-white" : "bg-background/90 text-muted-foreground"
                      }`}
                    >
                      {item.usageCount > 0 ? `مستخدم (${item.usageCount})` : "غير مستخدم"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 p-3">
                    <div className="truncate font-mono text-xs font-bold text-foreground" dir="ltr" title={item.filename}>
                      {item.filename}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{formatBytes(item.sizeBytes)}</span>
                      <span dir="ltr">
                        {item.width && item.height ? `${item.width} × ${item.height} px` : item.mimeType.replace("image/", "").toUpperCase()}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Inspector & Management Drawer */}
      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="left" className="flex w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg" dir="rtl">
          {selected && (
            <>
              <SheetHeader className="border-b bg-muted/30 px-5 py-4 text-right">
                <SheetTitle className="truncate pl-6 font-mono text-sm font-bold" dir="ltr">
                  {selected.filename}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  تفاصيل الملف، تغيير الاسم وتحديث الروابط، وأين تُستخدم الصورة في المتجر.
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
                {/* Preview */}
                <div className="overflow-hidden rounded-xl border bg-muted/30">
                  <div className="relative flex max-h-64 items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.url} alt={selected.filename} className="max-h-60 w-auto rounded object-contain" />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t bg-background px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {selected.url}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="xs" variant="outline" onClick={() => void copyUrl(selected.url)} className="gap-1">
                        {copiedUrl ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                        نسخ
                      </Button>
                      <a
                        href={selected.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted"
                      >
                        <ExternalLink className="size-3" />
                        فتح
                      </a>
                    </div>
                  </div>
                </div>

                {/* General Info */}
                <section className="space-y-2 rounded-xl border p-3.5">
                  <h3 className="font-bold text-foreground">معلومات الملف</h3>
                  <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="block text-muted-foreground">الحجم الفعلي</span>
                      <strong className="font-mono text-foreground">{formatBytes(selected.sizeBytes)}</strong>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="block text-muted-foreground">المقاسات (غير مقيدة)</span>
                      <strong className="font-mono text-foreground" dir="ltr">
                        {selected.width && selected.height ? `${selected.width} × ${selected.height} px` : "—"}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="block text-muted-foreground">الصيغة والمجلد</span>
                      <strong className="font-mono text-foreground" dir="ltr">
                        {selected.mimeType} · /{selected.folder}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <span className="block text-muted-foreground">آخر تعديل</span>
                      <strong className="text-foreground">
                        {new Date(selected.updatedAt).toLocaleString("ar-DZ")}
                      </strong>
                    </div>
                  </div>
                </section>

                {/* Rename Section */}
                <section className="space-y-3 rounded-xl border p-3.5">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Pencil className="size-3.5 text-primary" />
                    <span>تغيير اسم الملف</span>
                  </div>
                  <div className="flex items-center gap-2" dir="ltr">
                    <Input
                      value={renameStem}
                      onChange={(e) => setRenameStem(e.target.value)}
                      placeholder="new-image-name"
                      className="h-8 flex-1 font-mono text-xs"
                    />
                    <Badge variant="outline" className="h-8 shrink-0 font-mono">
                      {selectedExt}
                    </Badge>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={updateReferencesOnRename}
                      onChange={(e) => setUpdateReferencesOnRename(e.target.checked)}
                      className="rounded border-input"
                    />
                    <span>تحديث الرابط الجديد تلقائياً في كل المنتجات وإعدادات الشعار (يمنع كسر الصور)</span>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRename()}
                    disabled={renaming || !renameStem.trim() || `${renameStem.trim()}${selectedExt}` === selected.filename}
                    className="w-full gap-1.5"
                  >
                    {renaming ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
                    {renaming ? "جارٍ إعادة التسمية..." : "تطبيق الاسم الجديد"}
                  </Button>
                </section>

                {/* Where Used Section */}
                <section className="space-y-2.5 rounded-xl border p-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground">أين تُستخدم هذه الصورة في الموقع؟</h3>
                    <Badge variant={selected.usageCount > 0 ? "default" : "secondary"}>
                      {selected.usageCount} موضع
                    </Badge>
                  </div>
                  {selected.usages.length === 0 ? (
                    <p className="rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground">
                      هذه الصورة غير مرتبطة حالياً بأي منتج أو شعار متجر، ويمكن حذفها بأمان.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.usages.map((u, idx) => (
                        <li
                          key={`${u.kind}-${u.entityId || idx}-${u.role}`}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{u.label}</div>
                            <div className="text-[11px] text-muted-foreground">{u.role}</div>
                          </div>
                          {u.href && (
                            <Link
                              href={u.href}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                            >
                              فتح
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Safe Delete Warning if in use */}
                {deleteConflictUsages && (
                  <Alert variant="destructive" className="space-y-2">
                    <ShieldAlert className="size-4" />
                    <AlertTitle className="text-xs font-bold">تحذير: الصورة مستخدمة حالياً!</AlertTitle>
                    <AlertDescription className="space-y-2 text-[11px]">
                      <p>
                        هذه الصورة مرتبطة بـ {deleteConflictUsages.length} موضع في المتجر. الحذف الإجباري سيمسح الملف من Hostinger ويفك ارتباطها من تلك المواضع.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={deleting}
                          onClick={() => void handleDelete(true)}
                        >
                          {deleting ? "جارٍ الحذف..." : "تأكيد الحذف وفك الارتباط"}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => setDeleteConflictUsages(null)}
                        >
                          تراجع
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <SheetFooter className="border-t bg-muted/20 px-5 py-3">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => void handleDelete(false)}
                  className="w-full gap-1.5"
                >
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  {deleting ? "جارٍ الحذف..." : "حذف الصورة"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
