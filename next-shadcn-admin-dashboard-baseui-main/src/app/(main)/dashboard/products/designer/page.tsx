"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Columns,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  Layers,
  LayoutTemplate,
  ListOrdered,
  Monitor,
  MoveDown,
  MoveUp,
  Package,
  Phone,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  Truck,
} from "lucide-react";

import { DevEnvironmentBanner } from "@/components/dev-environment-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { visitorTracker } from "@/lib/analytics/visitor-tracker";
import {
  ALL_LAYOUT_SECTIONS,
  createDefaultLayoutConfig,
  type DesktopLayoutMode,
  type ProductPageLayoutConfig,
  type ProductPageSectionId,
} from "@/lib/repository/layout-types";
import { getApiLayoutRepository, getApiStorePagesRepository } from "@/lib/repository/api-store-pages-repository";
import { getApiProductsRepository } from "@/lib/repository/api-products-repository";
import type { Product } from "@/lib/repository/product-types";
import type { StorePage } from "@/lib/repository/store-pages-types";

// Algerian Wilayas list for realistic preview
const ALGERIA_WILAYAS = [
  "01 - أدرار",
  "02 - الشلف",
  "03 - الأغواط",
  "04 - أم البواقي",
  "05 - باتنة",
  "06 - بجاية",
  "07 - بسكرة",
  "08 - بشار",
  "09 - البليدة",
  "10 - البويرة",
  "16 - الجزائر",
  "19 - سطيف",
  "25 - قسنطينة",
  "31 - وهران",
  "35 - بومرداس",
];

export default function ProductPageDesigner() {
  const productsRepo = useMemo(() => getApiProductsRepository(), []);
  const layoutRepo = useMemo(() => getApiLayoutRepository(), []);
  const storePagesRepo = useMemo(() => getApiStorePagesRepository(), []);

  // ── State: Catalog Products ───────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("prod_pack_1_pro");
  const [currentPage, setCurrentPage] = useState<StorePage | null>(null);
  const [publishing, setPublishing] = useState<boolean>(false);

  // ── State: Layout Configuration ───────────────────────────────────────────
  const [savedConfig, setSavedConfig] = useState<ProductPageLayoutConfig>(createDefaultLayoutConfig("prod_pack_1_pro"));
  const [currentConfig, setCurrentConfig] = useState<ProductPageLayoutConfig>(
    createDefaultLayoutConfig("prod_pack_1_pro"),
  );

  // ── State: Preview & Editor UI ────────────────────────────────────────────
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [activeOrderTab, setActiveOrderTab] = useState<"desktop" | "mobile">("desktop");
  const [feedback, setFeedback] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  // ── State: Interactive Demo Order in Preview ───────────────────────────────
  const [demoCustomerName, setDemoCustomerName] = useState<string>("");
  const [demoPhone, setDemoPhone] = useState<string>("");
  const [demoWilaya, setDemoWilaya] = useState<string>("16 - الجزائر");
  const [demoDeliveryType, setDemoDeliveryType] = useState<"home" | "desk">("home");
  const [demoOrderSubmitted, setDemoOrderSubmitted] = useState<boolean>(false);

  // Load products on mount
  useEffect(() => {
    productsRepo
      .getProducts()
      .then((list) => {
        setProducts(list);
        setSelectedProductId((current) => (list.some((p) => p.id === current) ? current : (list[0]?.id ?? current)));
      })
      .catch((err: unknown) =>
        setFeedback({ type: "error", text: err instanceof Error ? err.message : "تعذر تحميل المنتجات." }),
      );
  }, [productsRepo]);

  // Load layout config when selected product changes
  useEffect(() => {
    if (selectedProductId.startsWith("prod_pack_")) return; // legacy mock id: wait for real products
    layoutRepo.getLayoutConfig(selectedProductId).then((cfg) => {
      setSavedConfig(cfg);
      setCurrentConfig(JSON.parse(JSON.stringify(cfg)));
    });
    if (selectedProductId && selectedProductId !== "global_default") {
      visitorTracker.trackProductView(selectedProductId);
    }
    if (selectedProductId === "global_default") {
      setCurrentPage(null);
      return;
    }
    storePagesRepo.getPageByProductId(selectedProductId).then((p) => {
      setCurrentPage(p);
    });
  }, [layoutRepo, storePagesRepo, selectedProductId]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || products[0] || null;
  }, [products, selectedProductId]);

  const isDirty = useMemo(() => {
    return JSON.stringify(currentConfig) !== JSON.stringify(savedConfig);
  }, [currentConfig, savedConfig]);

  // ── Actions: Layout Modifications ─────────────────────────────────────────

  const handleMoveSection = (index: number, direction: "up" | "down", mode: "desktop" | "mobile") => {
    const targetOrder =
      mode === "desktop" ? [...currentConfig.desktopSectionOrder] : [...currentConfig.mobileSectionOrder];

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= targetOrder.length) return;

    const temp = targetOrder[index];
    targetOrder[index] = targetOrder[targetIndex];
    targetOrder[targetIndex] = temp;

    if (mode === "desktop") {
      setCurrentConfig((prev) => ({ ...prev, desktopSectionOrder: targetOrder }));
    } else {
      setCurrentConfig((prev) => ({ ...prev, mobileSectionOrder: targetOrder }));
    }
  };

  const handleToggleDesktopMode = (mode: DesktopLayoutMode) => {
    setCurrentConfig((prev) => ({ ...prev, desktopLayoutMode: mode }));
  };

  const handleSaveDraft = async () => {
    try {
      const saved = await layoutRepo.saveLayoutConfig(currentConfig);
      setSavedConfig(saved);
      setCurrentConfig(JSON.parse(JSON.stringify(saved)));
      setFeedback({
        type: "success",
        text: isAllProducts
          ? `تم حفظ مسوّدة التصميم الموحد لجميع صفحات المنتجات (${products.length}). اضغط "نشر" لتطبيقها على المتجر.`
          : `تم حفظ مسوّدة تصميم صفحة "${selectedProduct?.title || "المنتج"}". اضغط "نشر" لتطبيقها على المتجر.`,
      });
    } catch {
      setFeedback({ type: "error", text: "حدث خطأ أثناء حفظ المسودة." });
    }
  };

  const isAllProducts = selectedProductId === "global_default";

  const handlePublishFromDesigner = async () => {
    if (isAllProducts) {
      setPublishing(true);
      try {
        const saved = await layoutRepo.publishLayoutConfig(currentConfig);
        setSavedConfig(saved);
        setCurrentConfig(JSON.parse(JSON.stringify(saved)));
        await fetch("/api/store-publish", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
        setFeedback({
          type: "success",
          text: `تم تطبيق التصميم الموحد ونشره على جميع صفحات المنتجات (${products.length} صفحة).`,
        });
      } catch (err: unknown) {
        setFeedback({ type: "error", text: err instanceof Error ? err.message : "تعذر تطبيق التصميم الموحد." });
      } finally {
        setPublishing(false);
      }
      return;
    }
    if (!currentPage) return;
    setPublishing(true);
    try {
      const saved = await layoutRepo.publishLayoutConfig(currentConfig);
      setSavedConfig(saved);
      setCurrentConfig(JSON.parse(JSON.stringify(saved)));

      const published = await storePagesRepo.publishPage(currentPage.pageId);
      setCurrentPage(published);
      setFeedback({
        type: "success",
        text: `تم حفظ التصميم ونشر صفحة المنتج بنجاح! أصبحت متاحة للعملاء على: ${published.publicUrl}`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "حدث خطأ أثناء نشر الصفحة.",
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleResetDraft = () => {
    setCurrentConfig(JSON.parse(JSON.stringify(savedConfig)));
    setFeedback({ type: "info", text: "تم التراجع عن التغييرات غير المحفوظة." });
  };

  const handleRestoreDefaults = async () => {
    const def = await layoutRepo.restoreDefaultLayout(selectedProductId);
    setSavedConfig(def);
    setCurrentConfig(JSON.parse(JSON.stringify(def)));
    setFeedback({
      type: "success",
      text: "تمت استعادة التخطيط الأصلي الموصى به للمتجر.",
    });
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoCustomerName.trim() || !demoPhone.trim()) {
      alert("يرجى ملء الاسم ورقم الهاتف في المعاينة التجريبية.");
      return;
    }
    const mockOrderId = `ORD_DEMO_${Math.floor(10000 + Math.random() * 90000)}`;
    if (selectedProductId && selectedProductId !== "global_default") {
      visitorTracker.trackOrderCreated(selectedProductId, mockOrderId, demoWilaya, true);
    }
    setDemoOrderSubmitted(true);
    setTimeout(() => {
      setDemoOrderSubmitted(false);
    }, 6000);
  };

  // Section visibility helper
  const isSectionVisible = (sectionId: ProductPageSectionId): boolean => {
    switch (sectionId) {
      case "relatedProducts":
        return currentConfig.showRelatedProducts;
      case "description":
        return currentConfig.showDescription;
      case "features":
        return currentConfig.showFeatures;
      case "benefits":
        return currentConfig.showBenefits;
      default:
        return true;
    }
  };

  const activeSectionOrder =
    viewport === "desktop" ? currentConfig.desktopSectionOrder : currentConfig.mobileSectionOrder;

  return (
    <div className="space-y-6 pb-20">
      <DevEnvironmentBanner />

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/products"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              العودة إلى الكتالوج والمخزون
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 mt-1">
            <LayoutTemplate className="h-6 w-6 text-primary" />
            محرر صفحات المنتجات (Product Page Designer)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            التحكم البصري في ترتيب معرض الصور، نموذج الطلب، المميزات والمنتجات المقترحة مع محاكي متجر آمن 100%.
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center flex-wrap gap-2">
          {currentPage?.status === "published" && (
            <Badge className="bg-emerald-600 text-white text-[11px] py-1">منشور (Live)</Badge>
          )}
          {currentPage?.status === "preview_ready" && (
            <Badge variant="secondary" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[11px] py-1">
              جاهز للمعاينة
            </Badge>
          )}

          {isDirty && (
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 border-amber-300 dark:border-amber-700 animate-pulse text-xs py-1"
            >
              تغييرات غير محفوظة
            </Badge>
          )}

          {currentPage && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              nativeButton={false}
              render={
                <a
                  href={
                    currentPage.status === "published" && currentPage.publicUrl
                      ? currentPage.publicUrl
                      : currentPage.previewPath
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Eye className="h-3.5 w-3.5 text-blue-500" />
              <span>{currentPage.status === "published" ? "عرض الصفحة العامة" : "معاينة الرابط"}</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRestoreDefaults}
            className="text-xs"
            title="استعادة الترتيب القياسي المعتمد"
          >
            <RotateCcw className="h-3.5 w-3.5 ml-1.5 text-muted-foreground" />
            الافتراضي
          </Button>

          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleResetDraft} className="text-xs text-muted-foreground">
              تراجع
            </Button>
          )}

          <Button size="sm" onClick={handleSaveDraft} disabled={!isDirty} className="text-xs font-semibold">
            <Save className="h-3.5 w-3.5 ml-1.5" />
            حفظ المسودة
          </Button>

          {(currentPage || isAllProducts) && (
            <Button
              size="sm"
              onClick={handlePublishFromDesigner}
              disabled={publishing}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              <CheckCircle2 className={`h-3.5 w-3.5 ${publishing ? "animate-spin" : ""}`} />
              <span>{isAllProducts ? `نشر على جميع الصفحات (${products.length})` : "نشر الصفحة للعملاء"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <Alert
          className={
            feedback.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : feedback.type === "info"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-300"
                : "border-destructive/40 bg-destructive/10 text-destructive"
          }
        >
          <Info className="h-4 w-4" />
          <AlertTitle className="text-xs font-bold">إشعار النظام</AlertTitle>
          <AlertDescription className="text-xs">{feedback.text}</AlertDescription>
        </Alert>
      )}

      {/* ── Toolbar: Product Selector & Responsive Switcher ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center bg-card p-3 rounded-xl border shadow-sm">
        {/* Product Picker */}
        <div className="lg:col-span-6 flex items-center gap-3">
          <Label htmlFor="product-select" className="text-xs font-semibold whitespace-nowrap text-muted-foreground">
            المنتج المراد تصميمه:
          </Label>
          <select
            id="product-select"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full bg-background border rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
          >
            <option value="global_default">🌐 جميع صفحات المنتجات دفعة واحدة (تصميم موحد)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                📦 {p.title} ({p.sku}) — {new Intl.NumberFormat("fr-DZ").format(p.sellingPrice)} د.ج
              </option>
            ))}
          </select>
        </div>

        {/* Viewport Switcher */}
        <div className="lg:col-span-6 flex items-center justify-start lg:justify-end gap-2">
          <span className="text-xs text-muted-foreground ml-2">حجم المعاينة:</span>
          <div className="inline-flex rounded-lg border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewport === "desktop"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport("tablet")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewport === "tablet"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Tablet className="h-3.5 w-3.5" />
              <span>Tablet (768px)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
                viewport === "mobile"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Mobile (375px)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Workspace: Two Columns (Controls | Preview) ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Column 1: Configuration Controls (5 Cols) ────────────────────── */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    ترتيب عناصر الصفحة
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    تحريك الأقسام للأعلى والأسفل وتحديد الترتيب المستقل لكل جهاز
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Desktop vs Mobile Ordering Tabs */}
              <div className="flex rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveOrderTab("desktop")}
                  className={`flex-1 py-1.5 rounded text-center font-medium transition-all ${
                    activeOrderTab === "desktop"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🖥️ ترتيب سطح المكتب (Desktop)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveOrderTab("mobile")}
                  className={`flex-1 py-1.5 rounded text-center font-medium transition-all ${
                    activeOrderTab === "mobile"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  📱 ترتيب الهاتف واللوحي (Mobile)
                </button>
              </div>

              {/* Desktop Layout Mode Switcher */}
              {activeOrderTab === "desktop" && (
                <div className="bg-muted/40 p-3 rounded-lg border space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-foreground">تخطيط الصور ونموذج الطلب على Desktop:</div>
                      <div className="text-[11px] text-muted-foreground">
                        وضع النموذج والمعرض جنباً إلى جنب أم متتاليين
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleDesktopMode("split")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border text-xs font-medium transition-all ${
                        currentConfig.desktopLayoutMode === "split"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Columns className="h-3.5 w-3.5" />
                      قسمان متجاوران (Split)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleDesktopMode("stacked")}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border text-xs font-medium transition-all ${
                        currentConfig.desktopLayoutMode === "stacked"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      تتالي رأسي (Stacked)
                    </button>
                  </div>
                </div>
              )}

              {/* Section Ordering List */}
              <div className="space-y-2 pt-1">
                {(activeOrderTab === "desktop"
                  ? currentConfig.desktopSectionOrder
                  : currentConfig.mobileSectionOrder
                ).map((secId, idx, arr) => {
                  const meta = ALL_LAYOUT_SECTIONS.find((s) => s.id === secId);
                  if (!meta) return null;
                  const isVisible = isSectionVisible(secId);

                  return (
                    <div
                      key={secId}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${
                        !isVisible
                          ? "opacity-50 bg-muted/20 border-dashed"
                          : "bg-background border-border hover:border-primary/40 shadow-xs"
                      }`}
                    >
                      {/* Section Info */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex-shrink-0 size-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-mono font-bold">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                            {meta.labelAr}
                            {meta.isEssential && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              >
                                أساسي
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{meta.descriptionAr}</div>
                        </div>
                      </div>

                      {/* Controls (Move Up, Move Down) */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveSection(idx, "up", activeOrderTab)}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20"
                          title="تحريك للأعلى"
                        >
                          <MoveUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSection(idx, "down", activeOrderTab)}
                          disabled={idx === arr.length - 1}
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20"
                          title="تحريك للأسفل"
                        >
                          <MoveDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Section Visibility Toggles ──────────────────────────────── */}
              <div className="border-t pt-4 space-y-3">
                <div className="text-xs font-bold text-foreground">التحكم في ظهور الأقسام الاختيارية:</div>

                {/* Show/Hide Related Products */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border text-xs">
                  <div>
                    <div className="font-medium">المنتجات المقترحة (Related Products)</div>
                    <div className="text-[10px] text-muted-foreground">عرض منتجات بديلة في نهاية الصفحة</div>
                  </div>
                  <Switch
                    checked={currentConfig.showRelatedProducts}
                    onCheckedChange={(val) => setCurrentConfig((prev) => ({ ...prev, showRelatedProducts: val }))}
                  />
                </div>

                {/* Show/Hide Description */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border text-xs">
                  <div>
                    <div className="font-medium">الوصف التفصيلي (Description)</div>
                    <div className="text-[10px] text-muted-foreground">عرض نص الشرح الكامل للباقة</div>
                  </div>
                  <Switch
                    checked={currentConfig.showDescription}
                    onCheckedChange={(val) => setCurrentConfig((prev) => ({ ...prev, showDescription: val }))}
                  />
                </div>

                {/* Show/Hide Features */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border text-xs">
                  <div>
                    <div className="font-medium">قائمة المميزات والقطع (Features)</div>
                    <div className="text-[10px] text-muted-foreground">عرض تفاصيل الأدوات المرفقة</div>
                  </div>
                  <Switch
                    checked={currentConfig.showFeatures}
                    onCheckedChange={(val) => setCurrentConfig((prev) => ({ ...prev, showFeatures: val }))}
                  />
                </div>

                {/* Show/Hide Benefits */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border text-xs">
                  <div>
                    <div className="font-medium">بطاقات الضمان والمزايا (Benefits)</div>
                    <div className="text-[10px] text-muted-foreground">حق المعاينة والدفع عند الاستلام</div>
                  </div>
                  <Switch
                    checked={currentConfig.showBenefits}
                    onCheckedChange={(val) => setCurrentConfig((prev) => ({ ...prev, showBenefits: val }))}
                  />
                </div>

                {/* Checkout Protection Notice */}
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg flex items-start gap-2 text-xs text-emerald-900 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <span className="font-bold">حماية مسار الطلب (Checkout Safety):</span>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                      نموذج الطلب عنصر أساسي مؤمّن لا يمكن إخفاؤه لضمان عدم تعطل مبيعات المتجر عند تعديل المظهر.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Column 2: Live Responsive Preview (7 Cols) ───────────────────── */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-primary" />
              المعاينة الحية للمتجر — {viewport.toUpperCase()}
            </div>
            <div className="text-[11px] text-muted-foreground">معاينة فورية معزولة لا تُرسل أي طلبات حقيقية</div>
          </div>

          {/* Browser Mockup Window */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-lg bg-slate-100 text-slate-900 flex flex-col items-center">
            {/* Top Browser Chrome Bar */}
            <div className="w-full bg-slate-200 border-b border-slate-300 px-4 py-2.5 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-500/80 inline-block" />
                <span className="size-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="size-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-[11px] font-mono text-slate-600 flex items-center justify-center gap-1 truncate border border-slate-300">
                <span className="text-emerald-600 font-semibold">https://</span>orvastore.dz/products/
                <span className="text-slate-900">{selectedProduct?.sku.toLowerCase() || "pack1"}</span>
              </div>
            </div>

            {/* Inner Canvas Container */}
            <div
              className="w-full bg-white text-slate-900 p-4 transition-all duration-300 overflow-y-auto max-h-[780px]"
              style={{
                maxWidth: viewport === "mobile" ? "375px" : viewport === "tablet" ? "768px" : "100%",
                fontFamily: "Tajawal, sans-serif",
                direction: "rtl",
              }}
            >
              {/* 1. Top Reassurance Notice Bar */}
              <div className="bg-amber-50 text-amber-900 text-[11px] font-bold py-1.5 px-3 rounded-md text-center mb-3 flex items-center justify-center gap-2 border border-amber-200">
                <Truck className="h-3.5 w-3.5 text-amber-600" />
                <span>التوصيل متوفر لجميع الولايات (58 ولاية) والدفع عند الاستلام.</span>
              </div>

              {/* 2. Brand Mini Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <div className="font-extrabold text-base tracking-wider flex items-center gap-1">
                  <span className="text-amber-600 font-black">ORVA</span>
                  <span className="text-slate-900">STORE</span>
                </div>
                <div className="text-[11px] text-slate-600 flex items-center gap-1">
                  <Phone className="h-3 w-3 text-amber-600" />
                  <span>خدمة الزبائن: 0798282495</span>
                </div>
              </div>

              {/* Interactive Demo Order Success Toast in Preview */}
              {demoOrderSubmitted && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs flex items-start gap-2 animate-in fade-in zoom-in-95">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">✅ محاكاة طلب تجريبي ناجحة!</div>
                    <div className="text-[11px] mt-0.5 text-emerald-700">
                      شكراً {demoCustomerName}، تم اختبار إرسال الطلب للمنتج &quot;{selectedProduct?.title}&quot; بنجاح
                      دون استدعاء /api/orders أو المساس بقاعدة البيانات.
                    </div>
                  </div>
                </div>
              )}

              {/* ── Render Sections based on active layout order ──────────── */}
              {viewport === "desktop" && currentConfig.desktopLayoutMode === "split" ? (
                /* ── Desktop Split View: Gallery & Order Form side-by-side ── */
                <div className="space-y-5">
                  <div className="grid grid-cols-12 gap-5 items-start">
                    {/* Left/Right Column A: Gallery */}
                    <div className="col-span-6 space-y-3">
                      {isSectionVisible("gallery") && renderGallerySection(selectedProduct)}
                      {isSectionVisible("title") && renderTitleSection(selectedProduct)}
                      {isSectionVisible("subtitle") && renderSubtitleSection(selectedProduct)}
                      {isSectionVisible("description") && renderDescriptionSection(selectedProduct)}
                    </div>

                    {/* Left/Right Column B: Order Form */}
                    <div className="col-span-6 space-y-3">
                      {renderOrderFormSection(
                        selectedProduct,
                        demoCustomerName,
                        setDemoCustomerName,
                        demoPhone,
                        setDemoPhone,
                        demoWilaya,
                        setDemoWilaya,
                        demoDeliveryType,
                        setDemoDeliveryType,
                        handleDemoSubmit,
                      )}
                    </div>
                  </div>

                  {/* Other sequential sections below the split */}
                  {isSectionVisible("features") && renderFeaturesSection(selectedProduct)}
                  {isSectionVisible("benefits") && renderBenefitsSection()}
                  {isSectionVisible("relatedProducts") &&
                    renderRelatedProductsSection(products, selectedProduct, setSelectedProductId)}
                </div>
              ) : (
                /* ── Stacked Mode (Mobile, Tablet, or Desktop Stacked) ────── */
                <div className="space-y-4">
                  {activeSectionOrder.map((secId) => {
                    if (!isSectionVisible(secId)) return null;

                    switch (secId) {
                      case "title":
                        return <React.Fragment key={secId}>{renderTitleSection(selectedProduct)}</React.Fragment>;
                      case "subtitle":
                        return <React.Fragment key={secId}>{renderSubtitleSection(selectedProduct)}</React.Fragment>;
                      case "gallery":
                        return <React.Fragment key={secId}>{renderGallerySection(selectedProduct)}</React.Fragment>;
                      case "orderForm":
                        return (
                          <React.Fragment key={secId}>
                            {renderOrderFormSection(
                              selectedProduct,
                              demoCustomerName,
                              setDemoCustomerName,
                              demoPhone,
                              setDemoPhone,
                              demoWilaya,
                              setDemoWilaya,
                              demoDeliveryType,
                              setDemoDeliveryType,
                              handleDemoSubmit,
                            )}
                          </React.Fragment>
                        );
                      case "description":
                        return <React.Fragment key={secId}>{renderDescriptionSection(selectedProduct)}</React.Fragment>;
                      case "features":
                        return <React.Fragment key={secId}>{renderFeaturesSection(selectedProduct)}</React.Fragment>;
                      case "benefits":
                        return <React.Fragment key={secId}>{renderBenefitsSection()}</React.Fragment>;
                      case "relatedProducts":
                        return (
                          <React.Fragment key={secId}>
                            {renderRelatedProductsSection(products, selectedProduct, setSelectedProductId)}
                          </React.Fragment>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              )}

              {/* Storefront Footer */}
              <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500">
                <div>جميع الحقوق محفوظة © 2026 ORVA Store DZ</div>
                <div className="text-[9px] text-slate-500 mt-0.5">معاينة تجريبية مؤمنة داخل الداشبورد</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Render Helpers for Storefront Preview Sections ──────────────────────────

function renderTitleSection(product: Product | null) {
  if (!product) return null;
  return (
    <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
      <h2 className="text-lg font-black text-slate-900 leading-snug">{product.title}</h2>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-black text-amber-600 font-mono">
          {new Intl.NumberFormat("fr-DZ").format(product.sellingPrice)} د.ج
        </span>
        <span className="text-xs line-through text-slate-400 font-mono">
          {new Intl.NumberFormat("fr-DZ").format(product.sellingPrice + 4500)} د.ج
        </span>
        <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-bold">
          عرض خاص
        </span>
      </div>
    </div>
  );
}

function renderSubtitleSection(product: Product | null) {
  if (!product) return null;
  return (
    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
      <span className="inline-block bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1.5">
        باقة متكاملة
      </span>
      {product.subtitle}
    </div>
  );
}

function renderGallerySection(product: Product | null) {
  const cover = product?.images[0] || "/placeholder.svg";
  return (
    <div className="space-y-2">
      <div className="relative aspect-4/3 w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
        <Image
          src={cover}
          alt={product?.title || "Product"}
          fill
          className="object-cover"
          unoptimized={cover.startsWith("data:")}
        />
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-xs text-amber-800 text-[10px] px-2 py-0.5 rounded-md font-bold border border-slate-200 shadow-2xs">
          ضمان المعاينة
        </div>
      </div>
      {/* Thumbnail indicators */}
      {product && product.images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {product.images.map((img, i) => (
            <div
              key={i}
              className={`relative size-12 rounded-lg overflow-hidden border ${
                i === 0 ? "border-amber-500 ring-1 ring-amber-500" : "border-slate-200 opacity-70"
              }`}
            >
              <Image src={img} alt="Thumb" fill className="object-cover" unoptimized={img.startsWith("data:")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderOrderFormSection(
  product: Product | null,
  name: string,
  setName: (v: string) => void,
  phone: string,
  setPhone: (v: string) => void,
  wilaya: string,
  setWilaya: (v: string) => void,
  delivery: "home" | "desk",
  setDelivery: (v: "home" | "desk") => void,
  onSubmit: (e: React.FormEvent) => void,
) {
  const price = product?.sellingPrice || 4950;
  const shipping = delivery === "home" ? 500 : 350;
  const total = price + shipping;

  return (
    <div className="bg-white border-2 border-amber-500 rounded-xl p-4 shadow-sm space-y-3">
      <div className="text-center pb-2 border-b border-slate-200">
        <div className="text-sm font-black text-slate-900">إستمارة تأكيد الطلب السريع</div>
        <div className="text-[10px] text-slate-500 mt-0.5">الدفع عند الاستلام بعد معاينة السلعة</div>
      </div>

      <form onSubmit={onSubmit} className="space-y-2.5">
        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
            الاسم واللقب الكريم <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: كريم بن علي"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
            required
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
            رقم الهاتف للتواصل <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05 / 06 / 07 XX XX XX XX"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 text-left font-mono focus:outline-none focus:border-amber-500 focus:bg-white"
            required
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">
            الولاية (58 ولاية) <span className="text-red-500">*</span>
          </label>
          <select
            value={wilaya}
            onChange={(e) => setWilaya(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
          >
            {ALGERIA_WILAYAS.map((w) => (
              <option key={w} value={w} className="bg-white text-slate-900">
                {w}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">مكان الاستلام:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDelivery("home")}
              className={`p-2 rounded-lg border text-right transition-all ${
                delivery === "home"
                  ? "bg-amber-50 border-amber-500 text-amber-950 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="text-[11px]">توصيل للمنزل</div>
              <div className="text-[9px] text-slate-500 font-mono">500 د.ج</div>
            </button>
            <button
              type="button"
              onClick={() => setDelivery("desk")}
              className={`p-2 rounded-lg border text-right transition-all ${
                delivery === "desk"
                  ? "bg-amber-50 border-amber-500 text-amber-950 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="text-[11px]">مكتب الشحن</div>
              <div className="text-[9px] text-slate-500 font-mono">350 د.ج</div>
            </button>
          </div>
        </div>

        {/* Transparent Price Summary */}
        <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 space-y-1 text-[11px]">
          <div className="flex justify-between text-slate-600">
            <span>سعر الباقة:</span>
            <span className="font-mono text-slate-900">{new Intl.NumberFormat("fr-DZ").format(price)} د.ج</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>مصاريف الشحن:</span>
            <span className="font-mono text-slate-900">{shipping} د.ج</span>
          </div>
          <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between font-bold text-slate-900">
            <span>المجموع عند الاستلام:</span>
            <span className="font-mono text-sm text-amber-600">{new Intl.NumberFormat("fr-DZ").format(total)} د.ج</span>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md active:scale-98 cursor-pointer"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>تأكيد الطلب التجريبي الآن</span>
        </button>
      </form>
    </div>
  );
}

function renderDescriptionSection(product: Product | null) {
  if (!product) return null;
  return (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
      <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
        <Package className="h-3.5 w-3.5 text-amber-600" />
        تفاصيل ومواصفات المنتج:
      </div>
      <p className="text-slate-600 leading-relaxed text-[11px]">{product.description}</p>
    </div>
  );
}

function renderFeaturesSection(product: Product | null) {
  return (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
      <div className="font-bold text-slate-900 text-xs">أهم المميزات والأدوات المرفقة:</div>
      <ul className="space-y-1.5 text-[11px] text-slate-600">
        <li className="flex items-center gap-2">
          <span className="text-amber-600 font-bold">✓</span>
          <span>تصميم احترافي متين للأشغال الشاقة والاستخدام اليومي</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="text-amber-600 font-bold">✓</span>
          <span>حقيبة حفظ متكاملة ومقاومة للصدمات والرطوبة</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="text-amber-600 font-bold">✓</span>
          <span>ضمان أصلي لمدة عام مع توفر قطع الغيار والدعم</span>
        </li>
      </ul>
    </div>
  );
}

function renderBenefitsSection() {
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px]">
      <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-1.5 shadow-xs">
        <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
        <div>
          <div className="font-bold text-slate-900">المعاينة قبل الدفع</div>
          <div className="text-slate-500 text-[9px]">افحص محتوى الطرد أولاً</div>
        </div>
      </div>
      <div className="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-1.5 shadow-xs">
        <Truck className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <div>
          <div className="font-bold text-slate-900">توصيل سريع</div>
          <div className="text-slate-500 text-[9px]">خلال 24 إلى 48 ساعة</div>
        </div>
      </div>
    </div>
  );
}

function renderRelatedProductsSection(
  products: Product[],
  currentProduct: Product | null,
  onSelect: (id: string) => void,
) {
  const others = products.filter((p) => p.id !== currentProduct?.id).slice(0, 2);
  if (others.length === 0) return null;

  return (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
      <div className="text-xs font-bold text-slate-900">منتجات وعروض مقترحة:</div>
      <div className="space-y-2">
        {others.map((prod) => (
          <div
            key={prod.id}
            className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs shadow-xs"
          >
            <div>
              <div className="font-bold text-slate-900 text-[11px]">{prod.title}</div>
              <div className="text-[10px] text-amber-600 font-mono font-bold">
                {new Intl.NumberFormat("fr-DZ").format(prod.sellingPrice)} د.ج
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelect(prod.id)}
              className="text-[10px] px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors border border-slate-200 cursor-pointer"
            >
              معاينة هذا العرض
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
