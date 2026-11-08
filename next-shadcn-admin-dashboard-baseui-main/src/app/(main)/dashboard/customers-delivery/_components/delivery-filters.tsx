"use client";

import * as React from "react";
import {
  Search,
  Filter,
  RotateCcw,
  MapPin,
  Truck,
  Calendar,
  Layers,
  CheckCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeliveryFilterOptions } from "@/lib/delivery/delivery-tracking-types";

interface DeliveryFiltersProps {
  filters: DeliveryFilterOptions;
  onFiltersChange: (newFilters: DeliveryFilterOptions) => void;
  onResetFilters: () => void;
  totalFilteredCount: number;
  totalOrdersCount: number;
}

const WILAYA_OPTIONS = [
  { value: "all", label: "جميع الولايات (58 ولاية)" },
  { value: "07", label: "07 - بسكرة (المركز الرئيسي)" },
  { value: "16", label: "16 - الجزائر العاصمة" },
  { value: "31", label: "31 - وهران" },
  { value: "09", label: "09 - البليدة" },
  { value: "19", label: "19 - سطيف" },
  { value: "25", label: "25 - قسنطينة" },
  { value: "23", label: "23 - عنابة" },
  { value: "05", label: "05 - باتنة" },
  { value: "15", label: "15 - تيزي وزو" },
  { value: "13", label: "13 - تلمسان" },
  { value: "35", label: "35 - بومرداس" },
  { value: "42", label: "42 - تيبازة" },
  { value: "30", label: "30 - ورقلة" },
  { value: "47", label: "47 - غرداية" },
];

const COURIER_OPTIONS = [
  { value: "all", label: "كافة شركات التوصيل" },
  { value: "redex", label: "Redex Delivery DZ (الرئيسي)" },
  { value: "ecotrack", label: "Ecotrack Network DZ" },
  { value: "yalidine", label: "Yalidine Express" },
  { value: "none", label: "بدون ناقل مسجل" },
];

const ORVA_STATUS_OPTIONS = [
  { value: "all", label: "كافة حالات ORVA الداخلية" },
  { value: "pending", label: "قيد الانتظار (Pending)" },
  { value: "confirmed", label: "مؤكد (Confirmed)" },
  { value: "shipped", label: "تم الشحن (Shipped)" },
  { value: "delivered", label: "تم التسليم (Delivered)" },
  { value: "returned", label: "مرتجع (Returned)" },
  { value: "cancelled", label: "ملغي (Cancelled)" },
];

const COURIER_STATUS_OPTIONS = [
  { value: "all", label: "كافة حالات التتبع الخارجي" },
  { value: "DELIVERED_TO_CUSTOMER", label: "تم التسليم للزبون (Delivered)" },
  { value: "OUT_FOR_DELIVERY", label: "خرج للتسليم (Out for Delivery)" },
  { value: "IN_TRANSIT", label: "قيد النقل بين المراكز (In Transit)" },
  { value: "PICKED_UP", label: "تم استلام الناقل (Picked Up)" },
  { value: "PENDING", label: "بانتظار الناقل (Pending)" },
  { value: "DELIVERY_FAILED", label: "تعذر التسليم (Delivery Failed)" },
  { value: "CUSTOMER_REFUSED", label: "رفض الزبون (Customer Refused)" },
  { value: "RETURN_IN_PROGRESS", label: "مرتجع في الطريق (Return in Progress)" },
  { value: "RETURNED_TO_SENDER", label: "مرتجع مؤكد للمرسل (Returned to Sender)" },
  { value: "UNKNOWN", label: "حالة غير معروفة (Unknown)" },
];

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "كافة الأوقات (All Time)" },
  { value: "today", label: "اليوم (بتوقيت الجزائر UTC+1)" },
  { value: "last_7_days", label: "آخر 7 أيام (Last 7 Days)" },
  { value: "last_30_days", label: "آخر 30 يوماً (Last 30 Days)" },
];

export function DeliveryFilters({
  filters,
  onFiltersChange,
  onResetFilters,
  totalFilteredCount,
  totalOrdersCount,
}: DeliveryFiltersProps) {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      searchTerm: e.target.value,
    });
  };

  const handleSelectChange = (key: keyof DeliveryFilterOptions, val: string | null) => {
    if (!val) return;
    onFiltersChange({
      ...filters,
      [key]: val,
    });
  };

  const isFiltered =
    filters.searchTerm !== "" ||
    filters.wilayaCode !== "all" ||
    filters.courierId !== "all" ||
    filters.orvaStatus !== "all" ||
    filters.courierStatus !== "all" ||
    filters.dateRange !== "all";

  return (
    <div className="flex flex-col gap-3 p-4 bg-card rounded-xl border shadow-xs" dir="ltr">
      {/* Search Bar & Result Count */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="البحث بالاسم، الهاتف، رقم الطلب (ORVA-...)، أو رمز التتبع (RDX-...)..."
            value={filters.searchTerm}
            onChange={handleSearchChange}
            className="pr-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <span className="text-xs text-muted-foreground font-medium">
            عرض <strong className="text-foreground">{totalFilteredCount}</strong> من أصل{" "}
            <strong>{totalOrdersCount}</strong> طلب
          </span>
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetFilters}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 h-8 gap-1.5"
            >
              <RotateCcw className="size-3" />
              إعادة ضبط الفلاتر
            </Button>
          )}
        </div>
      </div>

      {/* Filter Dropdowns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Wilaya Filter */}
        <Select
          value={filters.wilayaCode}
          onValueChange={(val) => handleSelectChange("wilayaCode", val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <MapPin className="size-3.5 ml-1 text-muted-foreground" />
            <SelectValue placeholder="الولاية" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>الولاية</SelectLabel>
              {WILAYA_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Courier Filter */}
        <Select
          value={filters.courierId}
          onValueChange={(val) => handleSelectChange("courierId", val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <Truck className="size-3.5 ml-1 text-muted-foreground" />
            <SelectValue placeholder="شركة التوصيل" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>شركة التوصيل</SelectLabel>
              {COURIER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* ORVA Internal Status Filter */}
        <Select
          value={filters.orvaStatus}
          onValueChange={(val) => handleSelectChange("orvaStatus", val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <Layers className="size-3.5 ml-1 text-muted-foreground" />
            <SelectValue placeholder="حالة ORVA الداخلية" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>حالة ORVA الداخلية</SelectLabel>
              {ORVA_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Courier Status Filter */}
        <Select
          value={filters.courierStatus}
          onValueChange={(val) => handleSelectChange("courierStatus", val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <CheckCircle className="size-3.5 ml-1 text-muted-foreground" />
            <SelectValue placeholder="حالة الناقل الخارجي" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>حالة الناقل الخارجي</SelectLabel>
              {COURIER_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {/* Date Range Filter */}
        <Select
          value={filters.dateRange}
          onValueChange={(val) => handleSelectChange("dateRange", val)}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            <Calendar className="size-3.5 ml-1 text-muted-foreground" />
            <SelectValue placeholder="الفترة الزمنية" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>الفترة الزمنية</SelectLabel>
              {DATE_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
