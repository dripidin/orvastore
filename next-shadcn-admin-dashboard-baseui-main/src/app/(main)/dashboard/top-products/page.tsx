import { TopProducts } from "../ecommerce/_components/top-products";

export default function Page() {
  return (
    <div className="flex flex-col gap-6" dir="ltr">
      <header className="space-y-1 border-b pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          أفضل المنتجات مبيعاً (Top Products)
        </h1>
        <p className="text-sm text-muted-foreground">
          ترتيب أداء المنتجات الأكثر مبيعاً وطلباً استناداً إلى بيانات طلبيات المتجر الحقيقية والمبيعات المحصلة.
        </p>
      </header>
      <TopProducts showAll />
    </div>
  );
}
