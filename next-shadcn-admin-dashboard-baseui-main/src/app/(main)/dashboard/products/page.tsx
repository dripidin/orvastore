"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Archive,
  Trash2,
  Edit,
  DollarSign,
  TrendingUp,
  Image as ImageIcon,
  CheckCircle2,
  RefreshCw,
  ArrowUpDown,
  MoveUp,
  MoveDown,
  Star,
  Layers,
  LayoutTemplate,
  MapPin,
} from "lucide-react";

import { DevEnvironmentBanner } from "@/components/dev-environment-banner";
import { PublishToStoreButton } from "@/app/(main)/dashboard/_components/publish-to-store-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { Product, InventoryRecord, ProductStatus, ProductAnalytics } from "@/lib/repository/product-types";
import {
  matchOrderToProduct,
  computeUnitMargin,
  computeEstimatedOrderProfit,
} from "@/lib/repository/product-types";
import { getApiProductsRepository } from "@/lib/repository/api-products-repository";
import { storeProductImage, deleteProductImageById } from "@/lib/product-image-db";
import { useOrvaOrders } from "@/lib/use-orva-orders";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export default function ProductsManagementPage() {
  const { orders } = useOrvaOrders();
  const repo = useMemo(() => getApiProductsRepository(), []);

  // ── State: Products & Inventory ───────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [analytics, setAnalytics] = useState<Map<string, ProductAnalytics>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // ── State: Form ───────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formSellingPrice, setFormSellingPrice] = useState<number | "">("");
  const [formOriginalPrice, setFormOriginalPrice] = useState<number | "">("");
  const [formHighlights, setFormHighlights] = useState("");
  const [formPurchaseCost, setFormPurchaseCost] = useState<number | "">("");
  const [formMarketingCost, setFormMarketingCost] = useState<number | "">("");
  const [formStockQuantity, setFormStockQuantity] = useState<number | "">("");
  const [formLowStockThreshold, setFormLowStockThreshold] = useState<number | "">(5);
  const [formStatus, setFormStatus] = useState<ProductStatus>("active");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ── State: Table Filters & Pagination ─────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"title" | "price" | "stock" | "orders">("title");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const formSectionRef = useRef<HTMLDivElement>(null);

  // ── State: Dialogs ────────────────────────────────────────────────────────
  const [priceDialogProduct, setPriceDialogProduct] = useState<Product | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<number | "">("");

  const [stockDialogProduct, setStockDialogProduct] = useState<Product | null>(null);
  const [stockAdjustmentChange, setStockAdjustmentChange] = useState<number | "">("");
  const [stockAdjustmentReason, setStockAdjustmentReason] = useState("توريد شحنة جديدة");

  const formTopRef = useRef<HTMLDivElement>(null);

  // ── Load Data ─────────────────────────────────────────────────────────────
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prods, invs, anList] = await Promise.all([
        repo.getProducts(),
        repo.getInventory(),
        repo.getAllProductsAnalytics(),
      ]);

      // Ensure canonical Arabic pack titles are respected even if prior session had legacy English titles cached
      let needsSync = false;
      const updatedProds = prods.map((p) => {
        if (p.id === "prod_pack_1_pro" && p.title.startsWith("Pack 1")) {
          p.title = "باك منفاخ تويوتا وطقم المفاتيح";
          p.sellingPrice = 4950;
          p.status = "active";
          needsSync = true;
        } else if (p.id === "prod_pack_2_elite" && p.title.startsWith("Pack 2")) {
          p.title = "باك ماكينة كراون CROWN 20V الأصلية";
          p.sellingPrice = 12950;
          p.status = "active";
          needsSync = true;
        } else if (p.id === "prod_pack_3_ultra" && p.title.startsWith("Pack 3")) {
          p.title = "باك الأشغال الشاقة CROWN و Starcle Pro";
          p.sellingPrice = 15950;
          p.status = "active";
          needsSync = true;
        }
        return p;
      });

      if (needsSync) {
        for (const p of updatedProds) {
          await repo.updateProduct(p.id, { title: p.title, sellingPrice: p.sellingPrice, status: p.status });
        }
      }

      setProducts(updatedProds);
      setInventory(invs);
      const anMap = new Map<string, ProductAnalytics>();
      for (const a of anList) {
        anMap.set(a.productId, a);
      }
      setAnalytics(anMap);
    } catch (e) {
      console.error("Failed to load products/inventory", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("orva:products-updated", handleUpdate);
    return () => window.removeEventListener("orva:products-updated", handleUpdate);
  }, [repo]);

  // ── Form Handlers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormSubtitle("");
    setFormDescription("");
    setFormSku("");
    setFormSellingPrice("");
    setFormOriginalPrice("");
    setFormHighlights("");
    setFormPurchaseCost("");
    setFormMarketingCost("");
    setFormStockQuantity("");
    setFormLowStockThreshold(5);
    setFormStatus("active");
    setFormImages([]);
  };

  const startEditProduct = (prod: Product) => {
    setEditingId(prod.id);
    setFormTitle(prod.title);
    setFormSubtitle(prod.subtitle);
    setFormDescription(prod.description);
    setFormSku(prod.sku);
    setFormSellingPrice(prod.sellingPrice);
    setFormOriginalPrice(prod.originalPrice ?? "");
    setFormHighlights((prod.highlights ?? []).join("\n"));
    setFormPurchaseCost(prod.purchaseCost);
    setFormMarketingCost(prod.marketingCostPerOrder);
    setFormStockQuantity(prod.stockQuantity);
    setFormLowStockThreshold(prod.lowStockThreshold);
    setFormStatus(prod.status);
    setFormImages([...prod.images]);
    setIsFormOpen(true);
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingImage(true);
    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setFeedbackMessage({
          type: "error",
          text: `الملف ${file.name} غير مدعوم. الصيغ المقبولة: JPG, PNG, WebP فقط.`,
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFeedbackMessage({
          type: "error",
          text: `حجم الصورة ${file.name} يتجاوز الحد الأقصى (5 ميجابايت).`,
        });
        continue;
      }

      try {
        const stored = await storeProductImage(file);
        newImages.push(stored.dataUrl);
      } catch (err) {
        console.warn("Failed to store image in IDB", err);
      }
    }

    if (newImages.length > 0) {
      setFormImages((prev) => [...prev, ...newImages]);
      setFeedbackMessage({
        type: "success",
        text: `تمت إضافة ${newImages.length} صورة بنجاح وحفظها محلياً في IndexedDB.`,
      });
    }
    setIsUploadingImage(false);
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= formImages.length) return;
    const updated = [...formImages];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setFormImages(updated);
  };

  const setCoverImage = (index: number) => {
    if (index === 0) return;
    const updated = [...formImages];
    const [selected] = updated.splice(index, 1);
    updated.unshift(selected);
    setFormImages(updated);
  };

  const removeImage = async (index: number) => {
    const targetUrl = formImages[index];
    setFormImages((prev) => prev.filter((_, i) => i !== index));
    if (targetUrl) {
      const otherProds = products.filter((p) => p.id !== editingId);
      await deleteProductImageById(targetUrl, otherProds);
    }
  };

  const handleSaveProduct = async (statusOverride?: ProductStatus) => {
    if (!formTitle.trim()) {
      setFeedbackMessage({ type: "error", text: "يرجى إدخال اسم المنتج." });
      return;
    }
    if (!formSku.trim()) {
      setFeedbackMessage({ type: "error", text: "يرجى تحديد رمز المخزون SKU." });
      return;
    }

    const sellingPrice = Number(formSellingPrice) || 0;
    const purchaseCost = Number(formPurchaseCost) || 0;
    const marketingCost = Number(formMarketingCost) || 0;
    const stockQuantity = Number(formStockQuantity) || 0;
    const lowStockThreshold = Number(formLowStockThreshold) || 5;

    if (sellingPrice < 0 || purchaseCost < 0 || marketingCost < 0 || stockQuantity < 0) {
      setFeedbackMessage({ type: "error", text: "لا يُسمح بإدخال قيم أو مبالغ سالبة." });
      return;
    }

    const status = statusOverride || formStatus;

    try {
      if (editingId) {
        await repo.updateProduct(editingId, {
          title: formTitle.trim(),
          subtitle: formSubtitle.trim(),
          description: formDescription.trim(),
          sku: formSku.trim(),
          sellingPrice,
          purchaseCost,
          marketingCostPerOrder: marketingCost,
          stockQuantity,
          lowStockThreshold,
          status,
          images: formImages.length > 0 ? formImages : ["/placeholder.svg"],
          originalPrice: Number(formOriginalPrice) > sellingPrice ? Number(formOriginalPrice) : null,
          highlights: formHighlights
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        });
        setFeedbackMessage({ type: "success", text: `تم تحديث المنتج "${formTitle}" بنجاح.` });
      } else {
        await repo.createProduct({
          title: formTitle.trim(),
          subtitle: formSubtitle.trim(),
          description: formDescription.trim(),
          sku: formSku.trim(),
          sellingPrice,
          purchaseCost,
          marketingCostPerOrder: marketingCost,
          stockQuantity,
          lowStockThreshold,
          status,
          images: formImages.length > 0 ? formImages : ["/placeholder.svg"],
          originalPrice: Number(formOriginalPrice) > sellingPrice ? Number(formOriginalPrice) : null,
          highlights: formHighlights
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        });
        setFeedbackMessage({ type: "success", text: `تم إضافة المنتج الجديد "${formTitle}" إلى الكتالوج.` });
      }
      resetForm();
      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: err.message || "حدث خطأ أثناء حفظ المنتج." });
    }
  };

  // ── Table Actions Handlers ────────────────────────────────────────────────
  const handleArchive = async (id: string) => {
    try {
      await repo.archiveProduct(id);
      setFeedbackMessage({ type: "success", text: "تم نقل المنتج إلى الأرشيف." });
      loadData();
    } catch (e: any) {
      setFeedbackMessage({ type: "error", text: e.message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await repo.deleteProduct(id, orders);
      if (res.actionTaken === "archived") {
        setFeedbackMessage({
          type: "info",
          text: `حماية السجلات: ${res.message}`,
        });
      } else {
        setFeedbackMessage({ type: "success", text: res.message });
      }
      loadData();
    } catch (e: any) {
      setFeedbackMessage({ type: "error", text: e.message });
    }
  };

  const handleQuickPriceChange = async () => {
    if (!priceDialogProduct || newPriceValue === "") return;
    const val = Number(newPriceValue);
    if (val < 0) {
      setFeedbackMessage({ type: "error", text: "لا يمكن أن يكون سعر البيع سالباً." });
      return;
    }
    try {
      await repo.updateProduct(priceDialogProduct.id, { sellingPrice: val });
      setFeedbackMessage({
        type: "success",
        text: `تم تحديث سعر بيع "${priceDialogProduct.title}" إلى ${new Intl.NumberFormat("fr-DZ").format(val)} د.ج`,
      });
      setPriceDialogProduct(null);
      loadData();
    } catch (e: any) {
      setFeedbackMessage({ type: "error", text: e.message });
    }
  };

  const handleStockAdjustment = async () => {
    if (!stockDialogProduct || stockAdjustmentChange === "") return;
    const change = Number(stockAdjustmentChange);
    if (isNaN(change)) return;

    try {
      await repo.adjustInventory(
        stockDialogProduct.id,
        change,
        stockAdjustmentReason || "تعديل يدوي من الداشبورد"
      );
      setFeedbackMessage({
        type: "success",
        text: `تم تعديل مخزون "${stockDialogProduct.title}" بمقدار (${change > 0 ? `+${change}` : change}).`,
      });
      setStockDialogProduct(null);
      setStockAdjustmentChange("");
      loadData();
    } catch (e: any) {
      setFeedbackMessage({ type: "error", text: e.message });
    }
  };

  // ── Calculation Helpers ───────────────────────────────────────────────────
  const getProductOrderCount = (product: Product) => {
    return orders.filter((o) => {
      const match = matchOrderToProduct(o.productName);
      if (match.matchedProductId === product.id) return true;
      const orderProdName = (o.productName || "").trim().toLowerCase();
      const currentTitle = product.title.trim().toLowerCase();
      return orderProdName.includes(currentTitle) || currentTitle.includes(orderProdName);
    }).length;
  };

  const getInventoryForProduct = (productId: string) => {
    return inventory.find((inv) => inv.productId === productId);
  };

  // ── Filtered & Sorted Products ────────────────────────────────────────────
  const processedProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (filterStatus !== "all" && p.status !== filterStatus) return false;
        if (filterLowStockOnly && p.stockQuantity > p.lowStockThreshold) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === "title") cmp = a.title.localeCompare(b.title);
        else if (sortBy === "price") cmp = a.sellingPrice - b.sellingPrice;
        else if (sortBy === "stock") cmp = a.stockQuantity - b.stockQuantity;
        else if (sortBy === "orders") cmp = getProductOrderCount(a) - getProductOrderCount(b);
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [products, filterStatus, filterLowStockOnly, searchQuery, sortBy, sortOrder, orders]);

  // ── Inventory KPI Metrics ──────────────────────────────────────────────────
  const inventoryKpis = useMemo(() => {
    const totalProducts = products.length;
    const activeCount = products.filter((p) => p.status === "active").length;
    const draftCount = products.filter((p) => p.status === "draft").length;
    const archivedCount = products.filter((p) => p.status === "archived").length;

    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;
    let lowStockCount = 0;

    if (inventory.length > 0) {
      for (const inv of inventory) {
        totalAvailableUnits += inv.availableQuantity;
        totalReservedUnits += inv.reservedQuantity;
        if (inv.isLowStock) {
          lowStockCount += 1;
        }
      }
    } else {
      for (const p of products) {
        totalAvailableUnits += p.stockQuantity;
        if (p.stockQuantity <= p.lowStockThreshold) {
          lowStockCount += 1;
        }
      }
    }

    let totalMargin = 0;
    let marginCount = 0;
    for (const p of products) {
      if (p.purchaseCost !== null && p.purchaseCost !== undefined) {
        const margin = computeUnitMargin(p.sellingPrice, p.purchaseCost);
        totalMargin += margin;
        marginCount += 1;
      }
    }
    const avgMargin = marginCount > 0 ? Math.round(totalMargin / marginCount) : 0;

    return {
      totalProducts,
      activeCount,
      draftCount,
      archivedCount,
      totalAvailableUnits,
      totalReservedUnits,
      totalPhysicalUnits: totalAvailableUnits + totalReservedUnits,
      lowStockCount,
      avgMargin,
    };
  }, [products, inventory]);

  const totalPages = Math.ceil(processedProducts.length / pageSize) || 1;
  const paginatedProducts = processedProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="flex flex-col gap-6" dir="ltr" ref={formTopRef}>
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <header className="space-y-1 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
              <Package className="h-7 w-7 text-primary" />
              إدارة المنتجات والمخزون
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              التحكم في بيانات الكتالوج، وسجل المخزون المادي والمحجوز، وتحليل الأرباح التقديرية.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setIsFormOpen(true);
                setTimeout(() => {
                  formSectionRef.current?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="gap-2 font-semibold bg-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              إضافة منتج جديد
            </Button>
            <PublishToStoreButton />
            <Link href="/dashboard/products/demand/">
              <Button size="sm" variant="outline" className="gap-2 font-semibold">
                <MapPin className="h-4 w-4" />
                Wilaya Demand
              </Button>
            </Link>
            <Link href="/dashboard/products/designer">
              <Button size="sm" variant="outline" className="gap-2 font-semibold">
                <LayoutTemplate className="h-4 w-4" />
                محرر صفحات المنتجات (Designer)
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              تحديث البيانات
            </Button>
          </div>
        </div>
      </header>

      <DevEnvironmentBanner />

      {feedbackMessage && (
        <Alert
          variant={feedbackMessage.type === "error" ? "destructive" : "default"}
          className={feedbackMessage.type === "success" ? "border-emerald-500 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20" : ""}
        >
          {feedbackMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>
            {feedbackMessage.type === "success" ? "نجحت العملية" : feedbackMessage.type === "error" ? "تنبيه" : "معلومة"}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{feedbackMessage.text}</span>
            <Button variant="ghost" size="sm" onClick={() => setFeedbackMessage(null)}>إغلاق</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Section: Inventory KPI Summary Strip ───────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Catalog Products */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold">
              <span>إجمالي المنتجات في الكتالوج</span>
              <Package className="h-4 w-4 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {inventoryKpis.totalProducts} <span className="text-xs font-normal text-muted-foreground">منتج</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <span>{inventoryKpis.activeCount} نشط • {inventoryKpis.draftCount} مسودة • {inventoryKpis.archivedCount} مؤرشف</span>
          </CardContent>
        </Card>

        {/* Card 2: Inventory Units */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold">
              <span>وحدات المخزون المتوفرة والمحجوزة</span>
              <Layers className="h-4 w-4 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
              {inventoryKpis.totalPhysicalUnits} <span className="text-xs font-normal text-muted-foreground">وحدة مادية</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <span>{inventoryKpis.totalAvailableUnits} متوفرة • {inventoryKpis.totalReservedUnits} محجوزة للطلبات</span>
          </CardContent>
        </Card>

        {/* Card 3: Low Stock Alerts */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold">
              <span>تنبيهات نقص المخزون</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </CardDescription>
            <CardTitle className={`text-2xl font-black tabular-nums tracking-tight ${inventoryKpis.lowStockCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {inventoryKpis.lowStockCount} <span className="text-xs font-normal text-muted-foreground">تنبيه</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <span>{inventoryKpis.lowStockCount > 0 ? "منتجات دون حد الأمان الأدنى" : "المخزون في الحدود الآمنة"}</span>
          </CardContent>
        </Card>

        {/* Card 4: Average Unit Margin */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs font-semibold">
              <span>متوسط الهامش الربحي</span>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-blue-600 dark:text-blue-400">
              {new Intl.NumberFormat("fr-DZ").format(inventoryKpis.avgMargin)} <span className="text-xs font-normal text-muted-foreground">د.ج / وحدة</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            <span>متوسط هامش الربح للوحدة قبل الشحن والتسويق</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 1: Product Form ──────────────────────────────────────────── */}
      <Card ref={formSectionRef} className="border shadow-sm">
        <CardHeader className="bg-muted/40 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                {editingId ? <Edit className="h-5 w-5 text-amber-500" /> : <Plus className="h-5 w-5 text-primary" />}
                {editingId ? `تعديل المنتج: ${formTitle || editingId}` : "إضافة منتج جديد للكتالوج"}
              </CardTitle>
              <CardDescription>
                تحديث صور المنتج، والتسعير، والتكاليف السرية الداخلية، وحالة الإتاحة في المخزن — بنفس حقول صفحة الباقة الحية.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                  وضع التعديل النشط
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFormOpen((prev) => !prev)}
                className="text-xs"
              >
                {isFormOpen ? "إخفاء النموذج" : "إظهار النموذج"}
              </Button>
            </div>
          </div>
        </CardHeader>

        {isFormOpen && (
          <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* ── Column 1: Product Images ─────────────────────────────────────── */}
            <div className="lg:col-span-5 space-y-4 border-l pl-0 lg:pl-6">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  صور المنتج (Drag & Drop)
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ارفع صورة واحدة أو أكثر (JPG, PNG, WebP حتى 5MB). الصورة الأولى تُعتمد كغلاف رئيسي.
                </p>
              </div>

              {/* Drag & Drop Area */}
              <div
                className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition hover:bg-muted/30 focus-within:ring-2 focus-within:ring-primary"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleImageFiles(e.dataTransfer.files);
                }}
              >
                <input
                  type="file"
                  id="imageUploadInput"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleImageFiles(e.target.files)}
                />
                <label htmlFor="imageUploadInput" className="cursor-pointer space-y-2 block">
                  <div className="mx-auto size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium">اسحب الصور وأفلتها هنا، أو اضغط للاختيار</div>
                  <div className="text-xs text-muted-foreground">تخزين آمن في IndexedDB بدون استهلاك الذاكرة</div>
                </label>
              </div>

              {/* Uploaded Images Preview & Reordering */}
              {formImages.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">
                    الصور المختارة ({formImages.length}) — الغلاف في البداية:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {formImages.map((imgSrc, idx) => (
                      <div
                        key={idx}
                        className={`relative group rounded-lg border overflow-hidden bg-background p-1 flex flex-col gap-1 ${
                          idx === 0 ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        <div className="relative aspect-square w-full rounded overflow-hidden bg-muted/50">
                          <Image
                            src={imgSrc}
                            alt={`Preview ${idx + 1}`}
                            fill
                            className="object-cover"
                            unoptimized={imgSrc.startsWith("data:")}
                          />
                          {idx === 0 && (
                            <Badge className="absolute top-1 right-1 text-[10px] px-1.5 py-0 bg-primary font-bold shadow">
                              الغلاف
                            </Badge>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between text-xs pt-1 px-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveImage(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                              title="تحريك للخلف"
                            >
                              <MoveUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(idx, "down")}
                              disabled={idx === formImages.length - 1}
                              className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"
                              title="تحريك للأمام"
                            >
                              <MoveDown className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {idx !== 0 && (
                              <button
                                type="button"
                                onClick={() => setCoverImage(idx)}
                                className="p-1 rounded hover:bg-muted text-amber-600"
                                title="تعيين كصورة غلاف"
                              >
                                <Star className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive"
                              title="حذف الصورة"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Column 2: Product Information ────────────────────────────────── */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="formTitle" className="text-sm font-semibold">اسم المنتج *</Label>
                  <Input
                    id="formTitle"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="مثال: Pack 1 Pro 4-in-1"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="formSubtitle" className="text-sm font-semibold">العنوان الفرعي / الوصف الموجز</Label>
                  <Input
                    id="formSubtitle"
                    value={formSubtitle}
                    onChange={(e) => setFormSubtitle(e.target.value)}
                    placeholder="مثال: باك الخدمة والصيانة للسيارة والمنزل"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="formDescription" className="text-sm font-semibold">الوصف التفصيلي</Label>
                  <Textarea
                    id="formDescription"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="مواصفات القطع والمحتويات والضمان..."
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formSku" className="text-sm font-semibold">رمز المخزون (SKU) *</Label>
                  <Input
                    id="formSku"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="ORVA-P1-PRO"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formStatus" className="text-sm font-semibold">حالة المنتج</Label>
                  <select
                    id="formStatus"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ProductStatus)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="active">نشط (معروض للبيع)</option>
                    <option value="draft">مسودة (غير معروض)</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formSellingPrice" className="text-sm font-semibold flex items-center justify-between">
                    <span>سعر البيع للزبون (د.ج) *</span>
                    <span className="text-xs text-muted-foreground">DZD</span>
                  </Label>
                  <Input
                    id="formSellingPrice"
                    type="number"
                    min="0"
                    value={formSellingPrice}
                    onChange={(e) => setFormSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="4950"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formOriginalPrice" className="text-sm font-semibold flex items-center justify-between">
                    <span>السعر قبل التخفيض (اختياري)</span>
                    <span className="text-xs text-muted-foreground">يظهر مشطوباً في المتجر</span>
                  </Label>
                  <Input
                    id="formOriginalPrice"
                    type="number"
                    min="0"
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="9750"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="formHighlights" className="text-sm font-semibold">
                    مميزات المنتج في صفحة الهبوط (ميزة في كل سطر)
                  </Label>
                  <Textarea
                    id="formHighlights"
                    value={formHighlights}
                    onChange={(e) => setFormHighlights(e.target.value)}
                    placeholder={"منفاخ عجلات بعداد ضغط مدمج\nطقم مفاتيح 46 قطعة"}
                    rows={4}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formPurchaseCost" className="text-sm font-semibold flex items-center justify-between">
                    <span className="text-amber-600 dark:text-amber-400">سعر الشراء / التكلفة (د.ج) *</span>
                    <span className="text-[11px] text-muted-foreground font-mono">سري - داخلي</span>
                  </Label>
                  <Input
                    id="formPurchaseCost"
                    type="number"
                    min="0"
                    value={formPurchaseCost}
                    onChange={(e) => setFormPurchaseCost(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="2400"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formMarketingCost" className="text-sm font-semibold flex items-center justify-between">
                    <span className="text-amber-600 dark:text-amber-400">تكلفة التسويق للطلب (د.ج) *</span>
                    <span className="text-[11px] text-muted-foreground font-mono">سري - داخلي</span>
                  </Label>
                  <Input
                    id="formMarketingCost"
                    type="number"
                    min="0"
                    value={formMarketingCost}
                    onChange={(e) => setFormMarketingCost(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="850"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formStockQuantity" className="text-sm font-semibold">المخزون المتاح الأولي *</Label>
                  <Input
                    id="formStockQuantity"
                    type="number"
                    min="0"
                    value={formStockQuantity}
                    onChange={(e) => setFormStockQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="45"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="formLowStockThreshold" className="text-sm font-semibold">حد تنبيه نقص المخزون</Label>
                  <Input
                    id="formLowStockThreshold"
                    type="number"
                    min="1"
                    value={formLowStockThreshold}
                    onChange={(e) => setFormLowStockThreshold(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="5"
                  />
                </div>

                {/* Live Economics Preview Box */}
                {formSellingPrice !== "" && formPurchaseCost !== "" && (
                  <div className="md:col-span-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-emerald-800 dark:text-emerald-300">
                        التحليل المالي المباشر للمنتج:
                      </div>
                      <div className="text-muted-foreground text-[11px] mt-0.5 space-y-0.5">
                        <div>
                          • هامش القطعة الواحدة = سعر البيع ({Number(formSellingPrice)} د.ج) - سعر الشراء ({Number(formPurchaseCost)} د.ج) ={" "}
                          <span className="font-bold text-foreground">
                            {new Intl.NumberFormat("fr-DZ").format(computeUnitMargin(Number(formSellingPrice), Number(formPurchaseCost)))} د.ج
                          </span>
                        </div>
                        <div>
                          • ربح الطلب التقديري (لقطعة واحدة) = هامش القطعة - تكلفة التسويق للطلب ({Number(formMarketingCost) || 0} د.ج) ={" "}
                          <span className="font-bold text-foreground">
                            {new Intl.NumberFormat("fr-DZ").format(
                              computeEstimatedOrderProfit(Number(formSellingPrice), Number(formPurchaseCost), 1, Number(formMarketingCost) || 0)
                            )} د.ج
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">هامش القطعة (Unit Margin)</div>
                      <div className="text-base font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">
                        +{new Intl.NumberFormat("fr-DZ").format(computeUnitMargin(Number(formSellingPrice), Number(formPurchaseCost)))} د.ج
                      </div>
                    </div>
                  </div>
                )}
              </div>


              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                >
                  إلغاء وإعادة تعيين
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSaveProduct("draft")}
                  disabled={isUploadingImage}
                >
                  حفظ كمسودة
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveProduct()}
                  disabled={isUploadingImage}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {editingId ? "تحديث المنتج" : "حفظ ونشر المنتج"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      {/* ── Section 2: Products & Inventory Table ────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-muted/40 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                سجل المنتجات والمخزون المادي ({processedProducts.length})
              </CardTitle>
              <CardDescription>
                مراقبة الكميات المتاحة والمحجوزة، وتنبيهات انخفاض المخزون، ونسب التحويل الفعلية.
              </CardDescription>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو SKU..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pr-8 h-9 w-44 sm:w-60 text-xs"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs"
              >
                <option value="all">كل الحالات</option>
                <option value="active">نشط فقط</option>
                <option value="draft">مسودة فقط</option>
                <option value="archived">مؤرشف فقط</option>
              </select>

              <Button
                variant={filterLowStockOnly ? "destructive" : "outline"}
                size="sm"
                onClick={() => {
                  setFilterLowStockOnly((v) => !v);
                  setCurrentPage(1);
                }}
                className="gap-1.5 text-xs h-9"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                المخزون المنخفض فقط
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 text-xs">
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-right">SKU</TableHead>
                  <TableHead className="text-right">سعر البيع</TableHead>
                  <TableHead className="text-right">سعر الشراء</TableHead>
                  <TableHead className="text-right">تكلفة التسويق</TableHead>
                  <TableHead className="text-right">هامش القطعة / ربح الطلب</TableHead>
                  <TableHead className="text-center">المتاح</TableHead>
                  <TableHead className="text-center">المحجوز</TableHead>
                  <TableHead className="text-center font-bold">الإجمالي الفعلي</TableHead>
                  <TableHead className="text-center">الطلبات</TableHead>
                  <TableHead className="text-center">نسبة التحويل</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paginatedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="h-28 text-center text-muted-foreground text-sm">
                      لا توجد منتجات مطابقة لخيارات البحث أو الفلترة.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProducts.map((prod) => {
                    const inv = getInventoryForProduct(prod.id);
                    const an = analytics.get(prod.id);
                    const orderCount = getProductOrderCount(prod);
                    const reserved = inv?.reservedQuantity || 0;
                    const totalPhysical = prod.stockQuantity + reserved;
                    const isLow = prod.stockQuantity <= prod.lowStockThreshold;
                    const unitMargin = computeUnitMargin(prod.sellingPrice, prod.purchaseCost);
                    const orderProfit1x = computeEstimatedOrderProfit(prod.sellingPrice, prod.purchaseCost, prod.marketingCostPerOrder, 1);
                    const coverImg = prod.images[0] || "/placeholder.svg";

                    return (
                      <TableRow key={prod.id} className={isLow ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                        {/* Title & Cover Image */}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <div className="relative size-10 rounded overflow-hidden border bg-muted flex-shrink-0">
                              <Image
                                src={coverImg}
                                alt={prod.title}
                                fill
                                className="object-cover"
                                unoptimized={coverImg.startsWith("data:")}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-foreground truncate max-w-[180px]">
                                {prod.title}
                              </div>
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {prod.subtitle}
                              </div>
                              {prod.publicUrl && (
                                <a
                                  href={prod.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`text-[11px] font-mono hover:underline ${prod.status === "active" ? "text-primary" : "text-muted-foreground"}`}
                                  dir="ltr"
                                >
                                  {prod.status === "active" ? prod.publicUrl : `${prod.publicUrl} (غير منشور)`}
                                </a>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* SKU */}
                        <TableCell className="font-mono text-xs">{prod.sku}</TableCell>

                        {/* Selling Price */}
                        <TableCell className="tabular-nums font-bold text-xs text-foreground">
                          {new Intl.NumberFormat("fr-DZ").format(prod.sellingPrice)} د.ج
                        </TableCell>

                        {/* Purchase Cost (Confidential) */}
                        <TableCell className="tabular-nums text-xs text-amber-600 dark:text-amber-400 font-mono">
                          {new Intl.NumberFormat("fr-DZ").format(prod.purchaseCost)} د.ج
                        </TableCell>

                        {/* Marketing Cost (Confidential) */}
                        <TableCell className="tabular-nums text-xs text-amber-600 dark:text-amber-400 font-mono">
                          {new Intl.NumberFormat("fr-DZ").format(prod.marketingCostPerOrder)} د.ج
                        </TableCell>

                        {/* Unit Margin & Order Profit */}
                        <TableCell className="tabular-nums font-mono text-xs">
                          <div className="font-bold text-emerald-600 dark:text-emerald-400">
                            +{new Intl.NumberFormat("fr-DZ").format(unitMargin)} د.ج
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            طلب: +{new Intl.NumberFormat("fr-DZ").format(orderProfit1x)} د.ج
                          </div>
                        </TableCell>

                        {/* Available Quantity */}
                        <TableCell className="text-center font-bold tabular-nums">
                          <span className={isLow ? "text-destructive" : "text-foreground"}>
                            {prod.stockQuantity}
                          </span>
                        </TableCell>

                        {/* Reserved Quantity */}
                        <TableCell className="text-center text-muted-foreground tabular-nums text-xs">
                          {reserved}
                        </TableCell>

                        {/* Total Physical Quantity with Low Stock Alert */}
                        <TableCell className="text-center tabular-nums">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-bold">{totalPhysical}</span>
                            {isLow && (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0" title="مخزون منخفض!">
                                نقص مخزون
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Linked Orders Count */}
                        <TableCell className="text-center tabular-nums text-xs font-semibold">
                          <Badge variant="outline" className="font-mono">
                            {orderCount} طلب
                          </Badge>
                        </TableCell>

                        {/* Conversion Rate */}
                        <TableCell className="text-center tabular-nums text-xs font-mono">
                          {an ? `${an.conversionRate.toFixed(1)}%` : "—"}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center">
                          {prod.status === "active" ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px]">نشط</Badge>
                          ) : prod.status === "draft" ? (
                            <Badge variant="secondary" className="text-[11px]">مسودة</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground text-[11px]">مؤرشف</Badge>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="تعديل في النموذج"
                              onClick={() => startEditProduct(prod)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="تعديل السعر السريع"
                              onClick={() => {
                                setPriceDialogProduct(prod);
                                setNewPriceValue(prod.sellingPrice);
                              }}
                            >
                              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="تسوية المخزون"
                              onClick={() => {
                                setStockDialogProduct(prod);
                                setStockAdjustmentChange("");
                              }}
                            >
                              <ArrowUpDown className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                            {prod.status !== "archived" && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="أرشفة المنتج"
                                onClick={() => handleArchive(prod.id)}
                              >
                                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="حذف المنتج (محمي بالسجلات)"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(prod.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between p-4 border-t text-xs text-muted-foreground">
            <div>
              عرض {Math.min(processedProducts.length, (currentPage - 1) * pageSize + 1)} إلى{" "}
              {Math.min(processedProducts.length, currentPage * pageSize)} من إجمالي {processedProducts.length} منتج
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                السابق
              </Button>
              <span className="font-semibold px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog: Quick Price Change ───────────────────────────────────────── */}
      <Dialog open={Boolean(priceDialogProduct)} onOpenChange={(open) => !open && setPriceDialogProduct(null)}>
        <DialogContent dir="ltr">
          <DialogHeader>
            <DialogTitle>تعديل سعر البيع السريع</DialogTitle>
            <DialogDescription>
              تغيير سعر بيع المنتج {priceDialogProduct?.title} مباشرة في المتجر.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="dialogNewPrice">السعر الجديد بالدينار الجزائري (DZD)</Label>
            <Input
              id="dialogNewPrice"
              type="number"
              min="0"
              value={newPriceValue}
              onChange={(e) => setNewPriceValue(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="مثال: 5200"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPriceDialogProduct(null)}>إلغاء</Button>
            <Button onClick={handleQuickPriceChange}>حفظ السعر الجديد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Stock Adjustment ─────────────────────────────────────────── */}
      <Dialog open={Boolean(stockDialogProduct)} onOpenChange={(open) => !open && setStockDialogProduct(null)}>
        <DialogContent dir="ltr">
          <DialogHeader>
            <DialogTitle>تسوية المخزون وتعديل الكمية</DialogTitle>
            <DialogDescription>
              تعديل رصيد المخزون للمنتج {stockDialogProduct?.title}. يتم تدوين التعديل في سجل التدقيق المادي.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="p-3 rounded-lg bg-muted flex items-center justify-between text-xs">
              <div>المخزون المتاح الحالي: <span className="font-bold">{stockDialogProduct?.stockQuantity}</span></div>
              <div>المحجوز في طلبات: <span className="font-bold">{getInventoryForProduct(stockDialogProduct?.id || "")?.reservedQuantity || 0}</span></div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialogStockChange">
                مقدار التعديل (أدخل رقماً موجباً للزيادة أو سالباً للخصم)
              </Label>
              <Input
                id="dialogStockChange"
                type="number"
                value={stockAdjustmentChange}
                onChange={(e) => setStockAdjustmentChange(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="مثال: +10 أو -3"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dialogStockReason">سبب التعديل والتدقيق</Label>
              <select
                id="dialogStockReason"
                value={stockAdjustmentReason}
                onChange={(e) => setStockAdjustmentReason(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                <option value="توريد شحنة جديدة من المورد">توريد شحنة جديدة من المورد</option>
                <option value="بضاعة متضررة أثناء التخزين">بضاعة متضررة أثناء التخزين</option>
                <option value="تسوية جرد دوري فعلي">تسوية جرد دوري فعلي</option>
                <option value="مرتجع تم فحصه وإعادته للرفوف">مرتجع تم فحصه وإعادته للرفوف</option>
                <option value="تعديل إداري استثنائي">تعديل إداري استثنائي</option>
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStockDialogProduct(null)}>إلغاء</Button>
            <Button onClick={handleStockAdjustment}>تأكيد تسوية المخزون</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
