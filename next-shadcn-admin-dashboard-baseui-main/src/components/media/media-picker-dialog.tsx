"use client";

import * as React from "react";
import { Check, ExternalLink, FolderOpen, Image as ImageIcon, Loader2, Search, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { prepareImageForUpload } from "@/lib/media/client-image-compress";

export interface PickerMediaUsage {
  kind: "product" | "product_media" | "store_logo";
  label: string;
  role: string;
  entityId?: string;
  slug?: string;
  href?: string;
}

export interface PickerMediaItem {
  folder: "products" | "branding";
  filename: string;
  url: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  updatedAt: string;
  usages: PickerMediaUsage[];
  usageCount: number;
}

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiple?: boolean;
  defaultFolder?: "all" | "products" | "branding";
  onSelect: (urls: string[]) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  multiple = true,
  defaultFolder = "all",
  onSelect,
}: MediaPickerDialogProps) {
  const [items, setItems] = React.useState<PickerMediaItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [folderFilter, setFolderFilter] = React.useState<"all" | "products" | "branding">(defaultFolder);
  const [selectedUrls, setSelectedUrls] = React.useState<string[]>([]);
  const [settings, setSettings] = React.useState<{ maxUploadSizeMb: number; webpCompressionEnabled: boolean; webpQuality: number }>({
    maxUploadSizeMb: 10,
    webpCompressionEnabled: true,
    webpQuality: 0.85,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadMedia = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      const token = typeof window !== "undefined" ? localStorage.getItem("orva_admin_token") : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/media", {
        method: "GET",
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر تحميل مكتبة الوسائط.");
      }
      setItems(Array.isArray(json.items) ? json.items : []);
      if (json.settings) setSettings(json.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مكتبة الوسائط.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setSelectedUrls([]);
      setFolderFilter(defaultFolder);
      void loadMedia();
    }
  }, [open, defaultFolder, loadMedia]);

  const toggleSelect = (url: string) => {
    if (!multiple) {
      setSelectedUrls([url]);
      return;
    }
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]
    );
  };

  const handleQuickUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const targetFolder = folderFilter === "branding" ? "branding" : "products";
      const form = new FormData();
      form.set("folder", targetFolder);

      const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;
      for (let i = 0; i < files.length; i++) {
        const prepared = await prepareImageForUpload(files[i], {
          webpEnabled: settings.webpCompressionEnabled,
          quality: settings.webpQuality,
        });
        if (prepared.file.size > maxBytes) {
          throw new Error(
            `حجم الصورة ${prepared.file.name} (${formatBytes(prepared.file.size)}) يتجاوز الحد المسموح (${settings.maxUploadSizeMb} MB).`
          );
        }
        form.append("files", prepared.file, prepared.file.name);
      }

      const headers: Record<string, string> = {};
      const token = typeof window !== "undefined" ? localStorage.getItem("orva_admin_token") : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/media", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "فشل رفع الصورة.");
      }

      const newUrls = Array.isArray(json.items) ? json.items.map((x: PickerMediaItem) => x.url) : [json.url];
      await loadMedia();
      setSelectedUrls((prev) => (multiple ? [...prev, ...newUrls] : [newUrls[0]]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الصورة.");
    } finally {
      setUploading(false);
    }
  };

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (folderFilter !== "all" && item.folder !== folderFilter) return false;
      if (!q) return true;
      return (
        item.filename.toLowerCase().includes(q) ||
        item.usages.some((u) => u.label.toLowerCase().includes(q))
      );
    });
  }, [items, folderFilter, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0 text-right" dir="rtl">
        <DialogHeader className="border-b bg-muted/30 px-5 py-4 text-right">
          <div className="flex flex-wrap items-center justify-between gap-2 pl-6">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <FolderOpen className="size-4 text-primary" />
                مكتبة وسائط Hostinger (media.orva-store.com)
              </DialogTitle>
              <DialogDescription className="text-xs">
                اختر صوراً موجودة أو ارفع صوراً جديدة مباشرةً بمقاسات حرة (الحد الأقصى: {settings.maxUploadSizeMb} MB).
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple={multiple}
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                className="hidden"
                onChange={(e) => void handleQuickUpload(e.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5 text-xs"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {uploading ? "جارٍ الرفع..." : "رفع مباشر للمكتبة"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث باسم الملف أو اسم المنتج..."
              className="h-8 pr-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
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
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل الصور من Hostinger...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              <ImageIcon className="mx-auto mb-2 size-8 opacity-40" />
              لا توجد صور مطابقة حالياً. يمكنك رفع صور جديدة من الزر أعلاه.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((item) => {
                const isSelected = selectedUrls.includes(item.url);
                return (
                  <button
                    key={`${item.folder}/${item.filename}`}
                    type="button"
                    onClick={() => toggleSelect(item.url)}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-right transition ${
                      isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "hover:border-primary/40"
                    }`}
                  >
                    <div className="relative aspect-square w-full bg-muted/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                      {isSelected && (
                        <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="size-3.5" />
                        </span>
                      )}
                      <Badge
                        variant="secondary"
                        className="absolute bottom-1.5 left-1.5 bg-background/90 text-[10px] backdrop-blur"
                      >
                        {item.width && item.height ? `${item.width}×${item.height}` : formatBytes(item.sizeBytes)}
                      </Badge>
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate font-mono text-[11px] font-semibold text-foreground" dir="ltr">
                        {item.filename}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatBytes(item.sizeBytes)}</span>
                        <span>{item.usageCount > 0 ? `مستخدم (${item.usageCount})` : "غير مستخدم"}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>المحدد: {selectedUrls.length}</span>
            <a
              href="/dashboard/media"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              إدارة المكتبة كاملة
              <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedUrls.length === 0}
              onClick={() => {
                onSelect(selectedUrls);
                onOpenChange(false);
              }}
            >
              إدراج ({selectedUrls.length})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
