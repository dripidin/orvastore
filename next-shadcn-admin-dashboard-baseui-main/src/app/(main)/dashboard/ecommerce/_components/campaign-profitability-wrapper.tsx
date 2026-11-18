"use client";

import { useOrvaOrders } from "@/lib/use-orva-orders";

import { CampaignProfitabilitySection } from "./campaign-profitability-section";
import { type EcommerceOverviewContextValue, useOptionalEcommerceOverview } from "./ecommerce-overview-context";

function CampaignProfitabilityStandalone() {
  const { orders, isLoading } = useOrvaOrders();

  return <CampaignProfitabilitySection orders={orders} isLoading={isLoading} />;
}

function CampaignProfitabilityConnected({ overview }: { overview: EcommerceOverviewContextValue }) {
  return <CampaignProfitabilitySection orders={overview.filteredOrders} isLoading={overview.isLoadingOrders} />;
}

export function CampaignProfitabilityWrapper() {
  const overview = useOptionalEcommerceOverview();

  if (overview) {
    return <CampaignProfitabilityConnected overview={overview} />;
  }

  return <CampaignProfitabilityStandalone />;
}
