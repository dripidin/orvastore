"use strict";
"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchOrvaOrders, formatDzd, type OrvaOrder } from "@/lib/orva-api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CustomerOrder {
  orderId: string;
  date: string | null;
  status: string;
  total: string;
  isSwitched: boolean;
}

interface CustomerRecord {
  phone: string;
  normalizedPhone: string;
  fullName: string;
  hasDuplicatePhone: boolean;
  aliases: string[];
  wilaya: string;
  commune: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  switchedOrders: number;
  hasReturns: boolean;
  orders: CustomerOrder[];
}

function normalizeCustomerPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.startsWith("00213")) return `0${digits.slice(5)}`;
  return digits.startsWith("213") ? `0${digits.slice(3)}` : digits;
}

function buildCustomers(orders: OrvaOrder[]): CustomerRecord[] {
  const customers = new Map<string, CustomerRecord & { names: Set<string> }>();

  for (const order of orders) {
    const normalizedPhone = normalizeCustomerPhone(order.phone) || `order:${order.id}`;
    const fullName = order.customer?.trim() ?? "";
    let customer = customers.get(normalizedPhone);

    if (!customer) {
      customer = {
        phone: normalizedPhone.startsWith("order:") ? "غير مسجل" : normalizedPhone,
        normalizedPhone,
        fullName: fullName || "غير مسجل",
        hasDuplicatePhone: false,
        aliases: [],
        wilaya: order.wilaya ?? "غير مسجل",
        commune: order.commune ?? "",
        totalOrders: 0,
        deliveredOrders: 0,
        returnedOrders: 0,
        cancelledOrders: 0,
        switchedOrders: 0,
        hasReturns: false,
        orders: [],
        names: new Set(),
      };
      customers.set(normalizedPhone, customer);
    }

    if (fullName) customer.names.add(fullName);
    customer.totalOrders += 1;

    if (order.status === "delivered") customer.deliveredOrders += 1;
    if (["returned", "return", "rejected", "refused"].includes(order.status)) customer.returnedOrders += 1;
    if (["cancelled", "canceled"].includes(order.status)) customer.cancelledOrders += 1;

    const isSwitched = order.remarks.some((remark) => {
      if (typeof remark === "string") return remark.includes("ORDER_CONVERSION");
      if (!remark || typeof remark !== "object") return false;
      return ("event" in remark && remark.event === "ORDER_CONVERSION") || ("switch_status" in remark && remark.switch_status === "switched");
    });
    if (isSwitched) customer.switchedOrders += 1;

    customer.orders.push({
      orderId: order.id,
      date: order.createdAt,
      status: order.status,
      total: formatDzd(order.grandTotalDzd),
      isSwitched,
    });
  }

  return [...customers.values()].map(({ names, ...customer }) => {
    const namesList = [...names];
    return {
      ...customer,
      fullName: namesList[0] || customer.fullName,
      aliases: namesList.slice(1),
      hasDuplicatePhone: namesList.length > 1,
      hasReturns: customer.returnedOrders > 0,
    };
  });
}

export function CustomerManagement() {
  const [customers, setCustomers] = React.useState<CustomerRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRecord | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  const fetchCustomers = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const orders = await fetchOrvaOrders();
      setCustomers(buildCustomers(orders));
    } catch (reason) {
      setCustomers([]);
      setLoadError(reason instanceof Error ? reason.message : "تعذر تحميل سجل العملاء.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = React.useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.normalizedPhone.includes(q) ||
        c.wilaya.toLowerCase().includes(q) ||
        c.commune.toLowerCase().includes(q) ||
        c.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  return (
    <div className="space-y-6 text-right" dir="ltr">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Users className="size-5 text-primary" />
            <span>إدارة الزبائن المسجلين وسجل الطلبات (Customer Management)</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            دليل مجمّع من أحدث 500 طلبية متاحة، مع تطبيع أرقام الهواتف وتنبيهات الأسماء المكررة والمرتجعات. لا يشمل السجل الأقدم من حد واجهة الإدارة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchCustomers}
            disabled={isLoading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>تحديث العملاء</span>
          </Button>
        </div>
      </div>

      {loadError && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>بيانات العملاء غير متاحة</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">إجمالي العملاء المسجلين</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-foreground font-mono">
              {loadError ? "—" : customers.length} عميل
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            مستخرج ومطبع من قاعدة بيانات الطلبيات الحقيقية
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">عملاء لديهم طلبات مكررة (Loyal)</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-green-600 dark:text-green-400 font-mono">
              {loadError ? "—" : customers.filter((c) => c.totalOrders > 1).length} عميل
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            أجروا أكثر من طلبية واحدة في المتجر
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">سجل المرتجعات أو الرفض</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-red-600 dark:text-red-400 font-mono">
              {loadError ? "—" : customers.filter((c) => c.hasReturns).length} عميل
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            تنبيه حذر عند التوصيل المستقبلي
          </CardContent>
        </Card>

        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">تنبيه أرقام هواتف مشتركة</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
              {loadError ? "—" : customers.filter((c) => c.hasDuplicatePhone).length} رقم
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-[11px] text-muted-foreground">
            استُخدم الهاتف بأكثر من اسم مستلم
          </CardContent>
        </Card>
      </div>

      {/* Main Customers Table */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 text-right">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span>دليل العملاء وسجلات التوصيل</span>
              </CardTitle>
              <CardDescription className="text-xs">
                انقر على &ldquo;سجل الطلبيات&rdquo; لأي عميل لمراجعة كامل تاريخه وحالات الشحنات السابقة.
              </CardDescription>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="بحث بالاسم، رقم الهاتف، أو الولاية..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-8 h-8 text-xs bg-background"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table className="text-right">
              <TableHeader className="bg-muted/40 text-xs">
                <TableRow>
                  <TableHead className="text-right font-bold py-2.5 px-3">الزبون</TableHead>
                  <TableHead className="text-right font-bold py-2.5 px-3">الهاتف المطبع</TableHead>
                  <TableHead className="text-right font-bold py-2.5 px-3">الولاية والبلدية</TableHead>
                  <TableHead className="text-right font-bold py-2.5 px-3">إجمالي الطلبات</TableHead>
                  <TableHead className="text-right font-bold py-2.5 px-3">الحالات المسجلة</TableHead>
                  <TableHead className="text-center font-bold py-2.5 px-3">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody className="text-xs">
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="size-5 animate-spin text-primary" />
                        <span>جاري تحميل دليل العملاء...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : loadError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">بيانات العملاء غير متاحة؛ أعد المحاولة بعد عودة خدمة الإدارة.</TableCell>
                  </TableRow>
                ) : filteredCustomers.length > 0 ? (
                  filteredCustomers.slice(0, 50).map((customer) => (
                    <TableRow key={customer.normalizedPhone || customer.phone} className="hover:bg-muted/30">
                      <TableCell className="py-2.5 px-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-foreground block">{customer.fullName}</span>
                          {customer.hasDuplicatePhone && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                              <AlertTriangle className="size-3" />
                              <span>أسماء أخرى: {customer.aliases.slice(0, 2).join(", ")}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3 text-muted-foreground" />
                          <span>{customer.phone}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <span>{customer.wilaya} {customer.commune ? `— ${customer.commune}` : ""}</span>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-bold font-mono">
                          <ShoppingBag className="size-3.5 text-primary" />
                          <span>{customer.totalOrders}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {customer.deliveredOrders > 0 && (
                            <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-700 text-[10px] py-0">
                              {customer.deliveredOrders} مستلم
                            </Badge>
                          )}
                          {customer.returnedOrders > 0 && (
                            <Badge variant="destructive" className="text-[10px] py-0">
                              {customer.returnedOrders} مرتجع/مرفوض
                            </Badge>
                          )}
                          {customer.switchedOrders > 0 && (
                            <Badge variant="outline" className="border-blue-500/40 text-blue-600 text-[10px] py-0">
                              {customer.switchedOrders} محوّل
                            </Badge>
                          )}
                          {customer.deliveredOrders === 0 && customer.returnedOrders === 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground">
                              قيد المعالجة
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-2.5 px-3 text-center">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setIsHistoryOpen(true);
                          }}
                          className="gap-1 h-7 text-xs font-semibold"
                        >
                          <History className="size-3 text-primary" />
                          <span>سجل الطلبيات ({customer.orders.length})</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      لم يتم العثور على أي زبائن يطابقون معايير البحث.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="p-3 border-t text-xs text-muted-foreground flex justify-between">
            <span>{loadError ? "تعذر تحديد عدد العملاء" : `عرض ${Math.min(50, filteredCustomers.length)} من أصل ${filteredCustomers.length} عميل`}</span>
            <span>استخدم حقل البحث للوصول لأي عميل بالاسم أو الهاتف</span>
          </div>
        </CardContent>
      </Card>

      {/* Customer History Modal */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-xl text-right max-h-[85vh] overflow-y-auto" dir="ltr">
          <DialogHeader className="border-b pb-3 text-right">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  سجل طلبات العميل: {selectedCustomer?.fullName}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground font-mono mt-0.5">
                  رقم الهاتف: {selectedCustomer?.phone} • {selectedCustomer?.wilaya}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4 py-2 text-xs">
              {/* Summary card */}
              <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3 text-center">
                <div>
                  <span className="text-[10px] text-muted-foreground block">إجمالي الطلبات</span>
                  <span className="text-base font-bold font-mono text-foreground">{selectedCustomer.totalOrders}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">الطلبات المسلّمة</span>
                  <span className="text-base font-bold font-mono text-green-600">{selectedCustomer.deliveredOrders}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">المرتجع / المرفوض</span>
                  <span className="text-base font-bold font-mono text-red-600">{selectedCustomer.returnedOrders}</span>
                </div>
              </div>

              {/* Order History Timeline */}
              <div className="space-y-2">
                <span className="font-bold text-foreground block">الطلبيات المسجلة لهذا العميل:</span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedCustomer.orders.map((ord, idx) => (
                    <div
                      key={ord.orderId || idx}
                      className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-foreground">{ord.orderId}</span>
                          {ord.isSwitched && (
                            <Badge variant="outline" className="text-[9px] py-0 border-blue-500 text-blue-600">
                              تم تحويلها (Switched)
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ord.date ? new Date(ord.date).toLocaleDateString("ar-DZ", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "غير مسجل"}
                        </span>
                      </div>

                      <div className="text-left space-y-0.5">
                        <span className="font-bold font-mono text-foreground block">{ord.total}</span>
                        <Badge variant="outline" className="text-[10px] py-0 capitalize">
                          {ord.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
                <strong>سياسة سلامة البيانات:</strong> تعديل مستلم أي طلبية في نافذة Switch Order لا يغير بيانات العميل في هذا الدليل العام إلا إذا تم إجراء تعديل مستقل على ملف العميل.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
