import type { Metadata } from "next";

import { DynamicPackLayout } from "@/components/storefront/pack/dynamic-pack-layout";
import { listPublishedProducts } from "@/lib/catalog/server";
import type { StoreProduct } from "@/lib/catalog/types";

export function productMetadata(product: StoreProduct): Metadata {
  const { landing } = product;
  return {
    title: landing.seo.title,
    description: landing.seo.description,
    keywords: landing.seo.keywords,
    openGraph: {
      title: landing.seo.title,
      description: landing.seo.description,
      images: [{ url: landing.heroImage, alt: landing.heroImageAlt }],
      locale: "ar_DZ",
      type: "website",
    },
  };
}

/** Server wrapper: picks the recommended product from the live catalog and renders the landing page. */
export async function ProductLanding({ product }: { product: StoreProduct }) {
  const others = (await listPublishedProducts()).filter((p) => p.id !== product.id);
  const related =
    others.find((p) => p.packId === product.landing.crossSellTargetId) ??
    others.find((p) => !p.showOutOfStock) ??
    others[0] ??
    null;

  return (
    <DynamicPackLayout
      packId={product.packId}
      pack={product.landing}
      layout={product.layout}
      related={related?.landing ?? null}
      showOutOfStock={product.showOutOfStock}
    />
  );
}
