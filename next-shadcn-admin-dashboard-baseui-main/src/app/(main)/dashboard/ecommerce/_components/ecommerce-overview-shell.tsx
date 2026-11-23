"use client";

import Link from "next/link";

import { RefreshCw, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import {
  type EcommerceChannel,
  EcommerceOverviewProvider,
  type EcommercePeriod,
  useEcommerceOverview,
} from "./ecommerce-overview-context";
import { Inventory } from "./inventory";
import { KpiStrip } from "./kpi-strip";
import { RecentOrders } from "./recent-orders";
import { TopProducts } from "./top-products";
import { TrafficSources } from "./traffic-sources";

const PERIOD_ITEMS: Array<{ value: EcommercePeriod; label: string }> = [
  { value: "all-time", label: "All Time" },
  { value: "this-month", label: "This Month" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-7-days", label: "Last 7 Days" },
  { value: "last-month", label: "Last Month" },
  { value: "year-to-date", label: "Year to Date" },
];

const CHANNEL_ITEMS: Array<{ value: EcommerceChannel; label: string }> = [
  { value: "all-channels", label: "All Channels" },
  { value: "meta", label: "Meta / Facebook" },
  { value: "direct", label: "Direct Storefront" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "manual", label: "WhatsApp / Phone" },
];

function EcommerceOverviewContent() {
  const {
    period,
    setPeriod,
    channel,
    setChannel,
    filteredOrders,
    allOrders,
    isRefreshing,
    refreshAll,
    formattedToday,
  } = useEcommerceOverview();

  return (
    <div className="flex flex-col gap-4" dir="ltr">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-none tracking-tight">Store Overview</h1>
          <p className="text-muted-foreground text-sm">
            {formattedToday} • {filteredOrders.length.toLocaleString("en-US")} of{" "}
            {allOrders.length.toLocaleString("en-US")} orders shown
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 lg:w-fit">
          <Select
            items={PERIOD_ITEMS}
            value={period}
            onValueChange={(value) => {
              if (value) setPeriod(value as EcommercePeriod);
            }}
          >
            <SelectTrigger className="w-36" id="ecommerce-period" size="sm">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PERIOD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            items={CHANNEL_ITEMS}
            value={channel}
            onValueChange={(value) => {
              if (value) setChannel(value as EcommerceChannel);
            }}
          >
            <SelectTrigger className="w-42" id="ecommerce-channel" size="sm">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHANNEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Separator orientation="vertical" />

          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => void refreshAll()}
            disabled={isRefreshing}
            title="تحديث البيانات الحية"
            aria-label="Refresh Store Overview"
          >
            <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>

          <Button
            nativeButton={false}
            render={<Link href="/dashboard/settings" />}
            size="icon-sm"
            variant="outline"
            title="إعدادات المتجر (Store Settings)"
            aria-label="Open Store Settings"
          >
            <Settings2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <KpiStrip />
        <div className="xl:col-span-12">
          <TrafficSources />
        </div>
        <div className="xl:col-span-6">
          <TopProducts />
        </div>
        <div className="xl:col-span-6">
          <Inventory />
        </div>
        <div className="xl:col-span-12">
          <RecentOrders />
        </div>
      </div>
    </div>
  );
}

export function EcommerceOverviewShell() {
  return (
    <EcommerceOverviewProvider>
      <EcommerceOverviewContent />
    </EcommerceOverviewProvider>
  );
}
