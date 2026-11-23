import type { Metadata } from "next";

import { ProfitabilityWorkspace } from "./_components/profitability-workspace";

export const metadata: Metadata = {
  title: "ربحية الحملات التلقائي (Meta Ads & COD) | ORVA Store",
  description:
    "تحليل ربحية حملات Meta Ads متعدد المنتجات مع حساب تلقائي لتكاليف الإرجاع الحقيقية من شركات الشحن وصافي الربح.",
};

export default function ProfitabilityPage() {
  return <ProfitabilityWorkspace />;
}
