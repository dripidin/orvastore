"use client";

import * as React from "react";

import {
  Activity,
  CheckCircle2,
  DownloadCloud,
  Globe,
  Key,
  Layers,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RateLimitInfo {
  limitMinute?: number;
  remainingMinute?: number | null;
  limitHour?: number;
  remainingHour?: number | null;
  limitDay?: number;
  remainingDay?: number | null;
  windowRequestsLastMinute?: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
}

interface PublicCourierDTO {
  id: string;
  name: string;
  nameAr: string;
  family: string;
  baseUrl: string;
  isActive: boolean;
  isDefault: boolean;
  supportsStopDesk: boolean;
  autoValidate: boolean;
  isExternalExcelOnly: boolean;
  originHub: string;
  hasApiKey: boolean;
  hasApiToken: boolean;
  hasApiSecret: boolean;
  hasAccountId: boolean;
  maskedTokenPreview: string | null;
  storeIdentifiers: string[];
  lastSyncedAt: string | null;
  liveRateLimit?: RateLimitInfo;
}

interface CatalogPreset {
  id: string;
  name: string;
  nameAr: string;
  family: string;
  baseUrl: string;
  badge: string;
  supportsStopDesk: boolean;
  requiredFields: string[];
  descriptionAr: string;
}

interface WilayaCoverageRow {
  wilayaCode: number;
  paddedCode: string;
  nameAr: string;
  isActive: boolean;
  homeEnabled: boolean;
  stopDeskEnabled: boolean;
  tarifDomicile: number;
  tarifStopdesk: number;
  tarifRetour: number;
  motherWilayaCode: number | null;
}

interface CarrierProductItem {
  reference: string;
  title: string;
  stock_dispo: number;
  stock_reserve: number;
  stock_phisique: number;
  matchedLocalProductId?: string | null;
  matchedLocalProductTitle?: string | null;
}

export function MultiCourierManagerCard() {
  const [couriers, setCouriers] = React.useState<PublicCourierDTO[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogPreset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [busyCourierId, setBusyCourierId] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // Add / Edit Courier Modal
  const [editOpen, setEditOpen] = React.useState(false);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>("custom");
  const [formState, setFormState] = React.useState({
    id: "",
    name: "",
    nameAr: "",
    family: "ecotrack",
    baseUrl: "",
    isActive: true,
    isDefault: false,
    supportsStopDesk: true,
    isExternalExcelOnly: false,
    apiToken: "",
    apiKey: "",
    apiSecret: "",
    accountId: "",
    storeIdentifiersText: "ORVA, ORV-, PACK1-, PACK2-, PACK3-, REROUTE-, ORD-",
  });

  // 69-Wilaya Coverage & Return Fees Modal
  const [coverageOpen, setCoverageOpen] = React.useState(false);
  const [coverageCourier, setCoverageCourier] = React.useState<PublicCourierDTO | null>(null);
  const [coverageRows, setCoverageRows] = React.useState<WilayaCoverageRow[]>([]);
  const [coverageLoading, setCoverageLoading] = React.useState(false);
  const [savingWilayaCode, setSavingWilayaCode] = React.useState<number | null>(null);

  // Carrier Products Modal
  const [productsOpen, setProductsOpen] = React.useState(false);
  const [productsCourierName, setProductsCourierName] = React.useState("");
  const [carrierProducts, setCarrierProducts] = React.useState<CarrierProductItem[]>([]);
  const [productsLoading, setProductsLoading] = React.useState(false);

  const fetchCouriers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/couriers", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) {
        setCouriers(data.couriers ?? []);
        setCatalog(data.catalog ?? []);
      } else {
        setFeedback({ type: "error", message: data.error || "تعذر تحميل قائمة شركات التوصيل" });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ في الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchCouriers();
  }, [fetchCouriers]);

  const openAddDialog = (preset?: CatalogPreset) => {
    if (preset) {
      setSelectedPresetId(preset.id);
      setFormState({
        id: preset.id,
        name: preset.name,
        nameAr: preset.nameAr,
        family: preset.family,
        baseUrl: preset.baseUrl,
        isActive: true,
        isDefault: false,
        supportsStopDesk: preset.supportsStopDesk,
        isExternalExcelOnly: preset.family === "excel_only",
        apiToken: "",
        apiKey: "",
        apiSecret: "",
        accountId: "",
        storeIdentifiersText: "ORVA, ORV-, PACK1-, PACK2-, PACK3-, REROUTE-, ORD-",
      });
    } else {
      setSelectedPresetId("custom");
      setFormState({
        id: "",
        name: "",
        nameAr: "",
        family: "ecotrack",
        baseUrl: "https://",
        isActive: true,
        isDefault: false,
        supportsStopDesk: true,
        isExternalExcelOnly: false,
        apiToken: "",
        apiKey: "",
        apiSecret: "",
        accountId: "",
        storeIdentifiersText: "ORVA, ORV-, PACK1-, PACK2-, PACK3-, REROUTE-, ORD-",
      });
    }
    setEditOpen(true);
  };

  const openEditCourier = (c: PublicCourierDTO) => {
    setSelectedPresetId(c.id);
    setFormState({
      id: c.id,
      name: c.name,
      nameAr: c.nameAr,
      family: c.family,
      baseUrl: c.baseUrl,
      isActive: c.isActive,
      isDefault: c.isDefault,
      supportsStopDesk: c.supportsStopDesk,
      isExternalExcelOnly: c.isExternalExcelOnly,
      apiToken: "",
      apiKey: "",
      apiSecret: "",
      accountId: "",
      storeIdentifiersText: (c.storeIdentifiers || []).join(", "),
    });
    setEditOpen(true);
  };

  const handleSaveCourier = async () => {
    if (!formState.id.trim()) {
      setFeedback({ type: "error", message: "يرجى إدخال معرّف فريد لشركة التوصيل (مثلاً: anderson)" });
      return;
    }
    setBusyCourierId(formState.id);
    setBusyAction("save");
    setFeedback(null);
    try {
      const identifiers = formState.storeIdentifiersText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: formState.id.trim().toLowerCase(),
          name: formState.name.trim() || formState.id,
          nameAr: formState.nameAr.trim() || formState.name || formState.id,
          family: formState.family,
          baseUrl: formState.baseUrl.trim(),
          isActive: formState.isActive,
          isDefault: formState.isDefault,
          supportsStopDesk: formState.supportsStopDesk,
          isExternalExcelOnly: formState.isExternalExcelOnly,
          apiToken: formState.apiToken.trim() || undefined,
          apiKey: formState.apiKey.trim() || undefined,
          apiSecret: formState.apiSecret.trim() || undefined,
          accountId: formState.accountId.trim() || undefined,
          storeIdentifiers: identifiers.length > 0 ? identifiers : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: `تم حفظ شركة التوصيل "${formState.nameAr || formState.name}" وتشفير مفاتيحها بأمان.`,
        });
        setEditOpen(false);
        await fetchCouriers();
      } else {
        setFeedback({ type: "error", message: data.error || "تعذر حفظ الإعدادات" });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ أثناء الحفظ" });
    } finally {
      setBusyCourierId(null);
      setBusyAction(null);
    }
  };

  const handleTestConnection = async (c: PublicCourierDTO) => {
    setBusyCourierId(c.id);
    setBusyAction("test");
    setFeedback(null);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      const conn = data.connection;
      if (data.success && conn?.success) {
        const wilayasMsg =
          Array.isArray(conn.servedWilayaIds) && conn.servedWilayaIds.length > 0
            ? ` — الولايات المغطاة: ${conn.servedWilayaIds.length}`
            : "";
        setFeedback({
          type: "success",
          message: `${c.nameAr || c.name}: ${conn.message} (${conn.latencyMs ?? 0}ms)${wilayasMsg}`,
        });
      } else {
        setFeedback({
          type: "error",
          message: conn?.message || data.error || `فشل الاتصال بـ ${c.name}`,
        });
      }
      await fetchCouriers();
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "فشل فحص الاتصال" });
    } finally {
      setBusyCourierId(null);
      setBusyAction(null);
    }
  };

  const handleSyncConfig = async (c: PublicCourierDTO) => {
    setBusyCourierId(c.id);
    setBusyAction("config");
    setFeedback(null);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}/config`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: `تمت مزامنة ${c.nameAr || c.name}: ${data.syncedWilayas} ولاية، ${data.syncedFees} تسعيرة (شاملة تكلفة الإرجاع)، و ${data.syncedDesks} مكتب توصيل.`,
        });
        await fetchCouriers();
      } else {
        setFeedback({ type: "error", message: data.error || "تعذرت المزامنة" });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ أثناء مزامنة الإعدادات" });
    } finally {
      setBusyCourierId(null);
      setBusyAction(null);
    }
  };

  const handleSyncLiveOrders = async (c: PublicCourierDTO) => {
    setBusyCourierId(c.id);
    setBusyAction("sync");
    setFeedback(null);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoImportReturns: true, maxPages: 8 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: "success",
          message: `تمت مزامنة ${c.nameAr || c.name}: تم سحب ${data.fetchedExternalCount ?? 0} طلبية، تحديث ${data.updatedLocalCount ?? 0} طلبية متطابقة، والتقاط ${data.importedReturnsCount ?? 0} مرتجع خاص بالمتجر.`,
        });
        await fetchCouriers();
      } else {
        setFeedback({ type: "error", message: data.error || "فشل سحب الطلبيات" });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "خطأ أثناء مزامنة الطلبيات" });
    } finally {
      setBusyCourierId(null);
      setBusyAction(null);
    }
  };

  const handleSetDefaultOrToggle = async (
    c: PublicCourierDTO,
    patch: Partial<{ isActive: boolean; isDefault: boolean }>,
  ) => {
    setBusyCourierId(c.id);
    setBusyAction("patch");
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchCouriers();
      } else {
        setFeedback({ type: "error", message: data.error || "تعذر التحديث" });
      }
    } catch {
      // handled
    } finally {
      setBusyCourierId(null);
      setBusyAction(null);
    }
  };

  const openCoverageMatrix = async (c: PublicCourierDTO) => {
    setCoverageCourier(c);
    setCoverageOpen(true);
    setCoverageLoading(true);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}/config`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCoverageRows(data.wilayas ?? []);
      }
    } finally {
      setCoverageLoading(false);
    }
  };

  const handleSaveWilayaRow = async (row: WilayaCoverageRow) => {
    if (!coverageCourier) return;
    setSavingWilayaCode(row.wilayaCode);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(coverageCourier.id)}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wilayaCode: row.wilayaCode,
          isActive: row.isActive,
          homeEnabled: row.homeEnabled,
          stopDeskEnabled: row.stopDeskEnabled,
          tarifDomicile: row.tarifDomicile,
          tarifStopdesk: row.tarifStopdesk,
          tarifRetour: row.tarifRetour,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCoverageRows((prev) => prev.map((w) => (w.wilayaCode === row.wilayaCode ? row : w)));
      }
    } finally {
      setSavingWilayaCode(null);
    }
  };

  const openProductsModal = async (c: PublicCourierDTO) => {
    setProductsCourierName(c.nameAr || c.name);
    setProductsOpen(true);
    setProductsLoading(true);
    setCarrierProducts([]);
    try {
      const res = await fetch(`/api/couriers/${encodeURIComponent(c.id)}/products?refresh=1`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCarrierProducts(data.products ?? []);
      } else {
        setFeedback({ type: "error", message: data.error || "تعذر جلب مستودع المنتجات" });
      }
    } finally {
      setProductsLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              إدارة شركات الشحن والتوصيل المتعددة (69 ولاية)
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              اربط أي شركة توصيل عبر API Token (ريديكس، ياليدين، زد آر إكسبريس، نويست، مايسترو، 22+ بوابة EcoTrack) أو
              شركات ملفات Excel، وزامن الولايات الـ 69 وأسعار الإرجاع الحقيقية (tarif_retour).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchCouriers()} disabled={loading}>
              <RefreshCw className={`size-3.5 me-1.5 ${loading ? "animate-spin" : ""}`} />
              تحديث
            </Button>
            <Button size="sm" onClick={() => openAddDialog()}>
              <Plus className="size-3.5 me-1.5" />
              إضافة شركة توصيل
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {feedback && (
          <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
            <CheckCircle2 className="size-4" />
            <AlertTitle className="text-xs font-bold">{feedback.type === "error" ? "تنبيه" : "تم التنفيذ"}</AlertTitle>
            <AlertDescription className="text-xs">{feedback.message}</AlertDescription>
          </Alert>
        )}

        {/* Quick-Add Presets Strip */}
        {catalog.length > 0 && (
          <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
            <div className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              إضافة سريعة من كتالوج شركات الشحن الجزائرية ({catalog.length} شركة جاهزة):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catalog.slice(0, 14).map((preset) => {
                const exists = couriers.some((c) => c.id === preset.id);
                return (
                  <Button
                    key={preset.id}
                    variant={exists ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-[11px] px-2.5"
                    onClick={() => openAddDialog(preset)}
                  >
                    <Plus className="size-3 me-1" />
                    {preset.nameAr}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {loading && couriers.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل شركات التوصيل...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {couriers.map((c) => {
              const isBusy = busyCourierId === c.id;
              const rl = c.liveRateLimit;
              const limitMin = rl?.limitMinute || 50;
              const remMin = rl?.remainingMinute ?? Math.max(0, limitMin - (rl?.windowRequestsLastMinute ?? 0));
              const pctMin = Math.min(100, Math.round((remMin / Math.max(1, limitMin)) * 100));

              return (
                <div key={c.id} className="rounded-xl border bg-card p-3.5 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm">{c.nameAr || c.name}</span>
                          {c.isDefault && (
                            <Badge className="text-[10px] bg-primary/15 text-primary hover:bg-primary/20 border-primary/30">
                              الافتراضية
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {c.family}
                          </Badge>
                          {c.isExternalExcelOnly && (
                            <Badge variant="secondary" className="text-[10px]">
                              Excel فقط
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5" dir="ltr">
                          {c.baseUrl || "— (توصيل خارجي عبر Excel)"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={(checked) => void handleSetDefaultOrToggle(c, { isActive: checked })}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {c.hasApiToken || c.hasApiKey ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          <ShieldCheck className="size-3 me-1" />
                          مفاتيح مشفرة AES-256 ({c.maskedTokenPreview || "محفوظ"})
                        </Badge>
                      ) : !c.isExternalExcelOnly ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          <Key className="size-3 me-1" />
                          بحاجة إلى API Token
                        </Badge>
                      ) : null}

                      {c.lastSyncedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          آخر مزامنة: {new Date(c.lastSyncedAt).toLocaleString("ar-DZ")}
                        </span>
                      )}
                    </div>

                    {/* Store identifiers */}
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      <Tag className="size-3 text-muted-foreground" />
                      <span className="text-muted-foreground">معرفات المتجر للمرتجعات:</span>
                      {(c.storeIdentifiers || []).slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    {/* Taux limite meter for API couriers */}
                    {!c.isExternalExcelOnly && (
                      <div className="rounded-lg bg-muted/30 p-2 space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1 font-medium">
                            <Activity className="size-3 text-primary" />
                            معدل الحصة (Taux limite): {remMin} / {limitMin} طلب/دقيقة
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {rl?.remainingHour != null ? `ساعة: ${rl.remainingHour}/1500` : "50/د · 1500/س · 15000/ي"}
                          </span>
                        </div>
                        <Progress value={pctMin} className="h-1.5" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => openEditCourier(c)}>
                      <Key className="size-3 me-1" />
                      المفاتيح والإعدادات
                    </Button>

                    {!c.isExternalExcelOnly && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={isBusy}
                          onClick={() => void handleTestConnection(c)}
                        >
                          {isBusy && busyAction === "test" ? (
                            <Loader2 className="size-3 me-1 animate-spin" />
                          ) : (
                            <Zap className="size-3 me-1" />
                          )}
                          فحص الاتصال
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={isBusy}
                          onClick={() => void handleSyncConfig(c)}
                        >
                          {isBusy && busyAction === "config" ? (
                            <Loader2 className="size-3 me-1 animate-spin" />
                          ) : (
                            <Globe className="size-3 me-1" />
                          )}
                          مزامنة الولايات ورسوم الإرجاع
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          disabled={isBusy}
                          onClick={() => void handleSyncLiveOrders(c)}
                        >
                          {isBusy && busyAction === "sync" ? (
                            <Loader2 className="size-3 me-1 animate-spin" />
                          ) : (
                            <DownloadCloud className="size-3 me-1" />
                          )}
                          مزامنة الطلبيات الحيّة
                        </Button>

                        {(c.family === "ecotrack" || c.id === "redex") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => void openProductsModal(c)}
                          >
                            <Package className="size-3 me-1" />
                            مستودع المنتجات
                          </Button>
                        )}
                      </>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => void openCoverageMatrix(c)}
                    >
                      <MapPin className="size-3 me-1" />
                      جدول الـ 69 ولاية
                    </Button>

                    {!c.isDefault && c.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] text-primary"
                        disabled={isBusy}
                        onClick={() => void handleSetDefaultOrToggle(c, { isDefault: true })}
                      >
                        تعيين كافتراضية
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add / Edit Courier Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Truck className="size-4 text-primary" />
              إعداد بوابة شركة التوصيل
            </DialogTitle>
            <DialogDescription className="text-xs">
              تُشفّر رموز API عبر AES-256-GCM على الخادم ولا تُكشف أبداً في المتصفح. اترك حقل التوكن فارغاً عند التعديل
              للإبقاء على التوكن الحالي.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">اختيار من القائمة (اختياري)</Label>
                <Select
                  value={selectedPresetId}
                  onValueChange={(val) => {
                    if (!val) return;
                    const p = catalog.find((item) => item.id === val);
                    if (p) openAddDialog(p);
                    else setSelectedPresetId(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="اختر شركة..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">شركة مخصصة (Custom)</SelectItem>
                    {catalog.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع النظام (Family)</Label>
                <Select
                  value={formState.family}
                  onValueChange={(val) => {
                    if (!val) return;
                    setFormState((s) => ({
                      ...s,
                      family: val,
                      isExternalExcelOnly: val === "excel_only",
                    }));
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecotrack">EcoTrack Tenant (Redex/DHD/Anderson...)</SelectItem>
                    <SelectItem value="yalidine">Yalidine / Guepex</SelectItem>
                    <SelectItem value="procolis">ZR Express / Procolis</SelectItem>
                    <SelectItem value="noest">NOEST Express</SelectItem>
                    <SelectItem value="maystro">Maystro Delivery</SelectItem>
                    <SelectItem value="excel_only">شركة خارجية عبر Excel فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">المعرّف (ID)</Label>
                <Input
                  value={formState.id}
                  onChange={(e) => setFormState((s) => ({ ...s, id: e.target.value }))}
                  placeholder="anderson"
                  className="h-8 font-mono text-xs"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الاسم التجاري</Label>
                <Input
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Anderson Express"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الاسم بالعربية</Label>
                <Input
                  value={formState.nameAr}
                  onChange={(e) => setFormState((s) => ({ ...s, nameAr: e.target.value }))}
                  placeholder="أندرسون إكسبريس"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {!formState.isExternalExcelOnly && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">رابط البوابة (Base URL)</Label>
                  <Input
                    value={formState.baseUrl}
                    onChange={(e) => setFormState((s) => ({ ...s, baseUrl: e.target.value }))}
                    placeholder="https://redex.ecotrack.dz"
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">API Token</Label>
                    <Input
                      type="password"
                      value={formState.apiToken}
                      onChange={(e) => setFormState((s) => ({ ...s, apiToken: e.target.value }))}
                      placeholder="•••••• (مشفّر — اتركه فارغاً للحفاظ على الحالي)"
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">API ID / Key (عند الطلب مثل Yalidine/ZR)</Label>
                    <Input
                      type="password"
                      value={formState.apiKey}
                      onChange={(e) => setFormState((s) => ({ ...s, apiKey: e.target.value }))}
                      placeholder="X-API-ID / Key"
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label className="text-xs">معرّفات المتجر لالتقاط المرتجعات الخارجية (مفصولة بفاصلة)</Label>
              <Input
                value={formState.storeIdentifiersText}
                onChange={(e) => setFormState((s) => ({ ...s, storeIdentifiersText: e.target.value }))}
                placeholder="ORVA, ORV-, PACK1-, REROUTE-"
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <label className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                <Switch
                  checked={formState.isActive}
                  onCheckedChange={(v) => setFormState((s) => ({ ...s, isActive: v }))}
                />
                <span>مفعّلة</span>
              </label>
              <label className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                <Switch
                  checked={formState.supportsStopDesk}
                  onCheckedChange={(v) => setFormState((s) => ({ ...s, supportsStopDesk: v }))}
                />
                <span>توفّر مكتب (StopDesk)</span>
              </label>
              <label className="flex items-center gap-2 border rounded-lg p-2 cursor-pointer">
                <Switch
                  checked={formState.isDefault}
                  onCheckedChange={(v) => setFormState((s) => ({ ...s, isDefault: v }))}
                />
                <span>الافتراضية</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" disabled={busyCourierId === formState.id} onClick={() => void handleSaveCourier()}>
              {busyCourierId === formState.id && busyAction === "save" ? (
                <Loader2 className="size-3.5 me-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 me-1.5" />
              )}
              حفظ الشركة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 69-Wilaya Coverage & Return Fees Modal */}
      <Dialog open={coverageOpen} onOpenChange={setCoverageOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              تغطية 69 ولاية وأسعار التوصيل والإرجاع — {coverageCourier?.nameAr || coverageCourier?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              تُظهر الولايات المستحدثة (59–69) توجيهها للولاية الأم عند غياب مكتب التوصيل مع استمرار التوصيل المنزلي عبر
              رجل التوصيل. يمكنك تعديل رسوم الإرجاع (tarif_retour) يدوياً أو مزامنتها من الشركة.
            </DialogDescription>
          </DialogHeader>

          {coverageLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل مصفوفة الـ 69 ولاية...
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead>الولاية</TableHead>
                    <TableHead>نشطة</TableHead>
                    <TableHead>للمنزل</TableHead>
                    <TableHead>مكتب (Desk)</TableHead>
                    <TableHead>سعر المنزل</TableHead>
                    <TableHead>سعر المكتب</TableHead>
                    <TableHead>تكلفة الإرجاع</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverageRows.map((row) => (
                    <TableRow key={row.wilayaCode} className="text-xs">
                      <TableCell className="font-medium">
                        <div>
                          {row.paddedCode} - {row.nameAr}
                        </div>
                        {row.motherWilayaCode && (
                          <div className="text-[10px] text-amber-600">
                            ولاية مستحدثة ← توجّه للولاية الأم {String(row.motherWilayaCode).padStart(2, "0")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.isActive}
                          onCheckedChange={(v) =>
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, isActive: v } : w)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.homeEnabled}
                          onCheckedChange={(v) =>
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, homeEnabled: v } : w)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.stopDeskEnabled}
                          onCheckedChange={(v) =>
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, stopDeskEnabled: v } : w)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.tarifDomicile}
                          onChange={(e) => {
                            const val = Number(e.target.value || 0);
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, tarifDomicile: val } : w)),
                            );
                          }}
                          className="h-7 w-20 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.tarifStopdesk}
                          onChange={(e) => {
                            const val = Number(e.target.value || 0);
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, tarifStopdesk: val } : w)),
                            );
                          }}
                          className="h-7 w-20 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.tarifRetour}
                          onChange={(e) => {
                            const val = Number(e.target.value || 0);
                            setCoverageRows((prev) =>
                              prev.map((w) => (w.wilayaCode === row.wilayaCode ? { ...w, tarifRetour: val } : w)),
                            );
                          }}
                          className="h-7 w-20 text-xs font-semibold text-rose-600"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          disabled={savingWilayaCode === row.wilayaCode}
                          onClick={() => void handleSaveWilayaRow(row)}
                        >
                          {savingWilayaCode === row.wilayaCode ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Save className="size-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Carrier Warehouse Stock Modal */}
      <Dialog open={productsOpen} onOpenChange={setProductsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              مستودع منتجات شركة التوصيل (Stock API) — {productsCourierName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              يُجلب عبر مسار EcoTrack `get/products/list` ويتم ربطه تلقائياً برمز SKU في متجرك.
            </DialogDescription>
          </DialogHeader>
          {productsLoading ? (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              جارٍ سحب المنتجات...
            </div>
          ) : carrierProducts.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              لا توجد منتجات مسجلة في مستودع شركة التوصيل حالياً.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>SKU</TableHead>
                  <TableHead>اسم المنتج في الشحن</TableHead>
                  <TableHead>المتاح</TableHead>
                  <TableHead>المحجوز</TableHead>
                  <TableHead>الربط مع المتجر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carrierProducts.map((p) => (
                  <TableRow key={p.reference} className="text-xs">
                    <TableCell className="font-mono">{p.reference}</TableCell>
                    <TableCell>{p.title}</TableCell>
                    <TableCell className="font-semibold text-emerald-600">{p.stock_dispo}</TableCell>
                    <TableCell>{p.stock_reserve}</TableCell>
                    <TableCell>
                      {p.matchedLocalProductTitle ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600">
                          {p.matchedLocalProductTitle}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">غير مطابق</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
