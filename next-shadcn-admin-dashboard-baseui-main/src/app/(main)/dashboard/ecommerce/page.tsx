"use strict";
"use client";

import * as React from "react";
import {
  BarChart3,
  LayoutGrid,
  ShoppingBag,
  Users,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CustomerManagement } from "./_components/customer-management";
import { KpiStrip } from "./_components/kpi-strip";
import { RecentOrders } from "./_components/recent-orders";
import { StoreTraffic } from "./_components/store-traffic";
import { TopProducts } from "./_components/top-products";
import { VisitorsAndReports } from "./_components/visitors-and-reports";

const moduleTriggerClass =
  "group/module flex h-auto min-h-18 w-full cursor-pointer items-center justify-start gap-3 rounded-xl border border-transparent bg-background/60 px-3 py-3 text-start text-foreground/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:border-primary/40 data-active:bg-primary/5 data-active:text-primary data-active:shadow-sm";
const moduleIconClass =
  "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors group-hover/module:border-primary/30 group-hover/module:text-primary group-data-[active]/module:border-primary group-data-[active]/module:bg-primary group-data-[active]/module:text-primary-foreground";
const moduleIndicatorClass =
  "size-1.5 shrink-0 rounded-full bg-transparent transition-colors group-data-[active]/module:bg-primary";

export default function Page() {
  const [activeTab, setActiveTab] = React.useState("orders");

  // Sync with URL hash if present
  React.useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes("reports") || hash.includes("analytics") || hash.includes("pixel")) {
        setActiveTab("visitors");
      } else if (hash.includes("customers") || hash.includes("users")) {
        setActiveTab("customers");
      } else if (hash.includes("orders") || hash.includes("switched") || hash.includes("risk")) {
        setActiveTab("orders");
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  return (
    <div className="flex flex-col gap-6" dir="ltr">
      {/* Top Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b pb-4">
        <div className="flex flex-col gap-1 text-right">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              ORDERS &amp; WORKSPACE
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              إدارة الطلبات
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            معالجة طلبات متجر ORVA، تبديل ومطابقة العناوين، وتتبع الشحن المباشر
          </p>
        </div>
      </div>

      {/* Module Navigation Tabs */}

      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full gap-6">
        <div className="rounded-2xl border bg-card/60 p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LayoutGrid className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Store workspace</h2>
                <p className="text-xs text-muted-foreground">Choose a section to manage your store</p>
              </div>
            </div>
            <span className="hidden rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              3 sections
            </span>
          </div>

          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-xl border bg-muted/40 p-2 sm:grid-cols-2 lg:grid-cols-3 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="orders" className={moduleTriggerClass}>
              <span className={moduleIconClass}>
                <ShoppingBag />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-5">Orders &amp; Delivery</span>
                <span className="block text-[11px] font-normal leading-4 text-muted-foreground">Orders, status and delivery</span>
              </span>
              <span aria-hidden="true" className={moduleIndicatorClass} />
            </TabsTrigger>

            <TabsTrigger value="visitors" className={moduleTriggerClass}>
              <span className={moduleIconClass}>
                <BarChart3 />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-5">Traffic &amp; Analytics</span>
                <span className="block text-[11px] font-normal leading-4 text-muted-foreground">Traffic reports and insights</span>
              </span>
              <span aria-hidden="true" className={moduleIndicatorClass} />
            </TabsTrigger>

            <TabsTrigger value="customers" className={moduleTriggerClass}>
              <span className={moduleIconClass}>
                <Users />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-5">Customers</span>
                <span className="block text-[11px] font-normal leading-4 text-muted-foreground">Profiles and order history</span>
              </span>
              <span aria-hidden="true" className={moduleIndicatorClass} />
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Orders Management & Switch Order (Module 1 & 2) */}
        <TabsContent value="orders" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <KpiStrip />
            <RecentOrders />
            <div className="xl:col-span-6">
              <TopProducts />
            </div>
            <div className="xl:col-span-6">
              <StoreTraffic />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Visitors, Reports, Meta Pixel & Conversions API (Module 3) */}
        <TabsContent value="visitors" className="space-y-6">
          <VisitorsAndReports />
        </TabsContent>

        {/* Tab 3: Customer Management (Module 4) */}
        <TabsContent value="customers" className="space-y-6">
          <CustomerManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
