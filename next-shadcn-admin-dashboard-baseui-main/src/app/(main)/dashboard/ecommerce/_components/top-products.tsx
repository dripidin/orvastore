"use client";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, Package, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { aggregateDeliveredProducts } from "@/lib/orva-analytics";
import { useOrvaOrders } from "@/lib/use-orva-orders";

export function TopProducts({ showAll = false }: { showAll?: boolean }) {
  const { orders, isLoading, isRefreshing, hasLoaded, lastUpdated, error, refresh } = useOrvaOrders({ pollingIntervalMs: 30_000 });
  const allProducts = aggregateDeliveredProducts(orders);
  const products = showAll ? allProducts : allProducts.slice(0, 3);
  const canShowResults = hasLoaded || !error;
  const showEmptyState = !isLoading && canShowResults && products.length === 0;
  const showProducts = !isLoading && canShowResults && products.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Top Products</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          حسب المبيعات الحقيقية
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="تحديث أفضل المنتجات" onClick={() => void refresh()} disabled={isLoading || isRefreshing}>
              <RefreshCw aria-hidden="true" className={isLoading || isRefreshing ? "animate-spin" : undefined} />
            </Button>
            {!showAll && (
              <Button render={<Link href="/dashboard/top-products" />} variant="ghost" size="icon-sm" aria-label="فتح أفضل المنتجات">
                <ArrowUpRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>بيانات المنتجات غير متاحة</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={isLoading}>إعادة المحاولة</Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="text-muted-foreground text-xs" aria-live="polite">
          تحديث تلقائي كل 30 ثانية
          {lastUpdated ? ` • آخر مزامنة ${lastUpdated.toLocaleTimeString("ar-DZ")}` : ""}
          {error && hasLoaded ? " • تعذر آخر تحديث؛ المعروض آخر بيانات تم تحميلها بنجاح" : ""}
        </div>
        {isLoading && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm" role="status">
            جارٍ تحميل الطلبات المسلّمة…
          </div>
        )}
        {showEmptyState && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Package aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>لا توجد بيانات منتجات مسلّمة</EmptyTitle>
              <EmptyDescription>تظهر هنا المنتجات كما ورد اسمها في سجلات الطلبات المسلّمة.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {showProducts && (
          <>
            <Separator />
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-3">
              <div className="text-muted-foreground text-xs">المنتج</div>
              <div className="text-muted-foreground text-xs text-center">الطلبات</div>
              <div className="text-muted-foreground text-xs text-left">المبيعات المحصلة</div>
              {products.map((product) => (
                <div className="contents text-sm" key={product.productName}>
                  <div className="min-w-0 truncate font-medium">{product.productName}</div>
                  <div className="self-center text-center font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {product.deliveredOrderCount}
                  </div>
                  <div className="self-center text-left text-muted-foreground tabular-nums text-xs font-mono font-semibold">
                    {product.totalRevenueDzd ? `${new Intl.NumberFormat("fr-DZ").format(product.totalRevenueDzd)} د.ج` : "—"}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground text-xs">
              الترتيب مستند إلى سجلات طلبيات المتجر الحقيقية والمبيعات المحصلة.
            </div>

            {!showAll && (
              <Button render={<Link href="/dashboard/top-products" />} variant="outline" className="self-start">
                عرض تقرير المنتجات
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
