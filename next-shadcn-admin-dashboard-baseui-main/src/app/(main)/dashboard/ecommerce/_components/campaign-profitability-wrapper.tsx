"use client";

import { useOrvaOrders } from "@/lib/use-orva-orders";

import { CampaignProfitabilitySection } from "./campaign-profitability-section";

export function CampaignProfitabilityWrapper() {
  const { orders, isLoading } = useOrvaOrders();

  return <CampaignProfitabilitySection orders={orders} isLoading={isLoading} />;
}
