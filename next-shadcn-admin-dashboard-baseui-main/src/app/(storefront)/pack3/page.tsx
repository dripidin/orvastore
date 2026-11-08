import type { Metadata } from "next";

import { DynamicPackLayout } from "@/components/storefront/pack/dynamic-pack-layout";
import { STOREFRONT_PACKS } from "@/data/storefront-packs";

const pack = STOREFRONT_PACKS.PACK3;

export const metadata: Metadata = {
  title: pack.seo.title,
  description: pack.seo.description,
  keywords: pack.seo.keywords,
  openGraph: {
    title: pack.seo.title,
    description: pack.seo.description,
    images: [{ url: pack.heroImage, alt: pack.heroImageAlt }],
    locale: "ar_DZ",
    type: "website",
  },
};

export default function Pack3Page() {
  return <DynamicPackLayout packId="PACK3" pack={pack} />;
}
