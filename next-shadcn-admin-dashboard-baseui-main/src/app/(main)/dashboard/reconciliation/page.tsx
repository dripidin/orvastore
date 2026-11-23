import type { Metadata } from "next";

import { ReconciliationWorkspace } from "./_components/reconciliation-workspace";

export const metadata: Metadata = {
  title: "المطابقة وشركات التوصيل | ORVA Store",
  description:
    "مقارنة ملفات Excel وسحب API Token عبر كافة شركات التوصيل، كشف الفوارق والتكرارات، استيراد المرتجعات والتقارير المحاسبية.",
};

export default function ReconciliationPage() {
  return <ReconciliationWorkspace />;
}
