import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductLanding, productMetadata } from "@/components/storefront/catalog/product-landing";
import { getPublishedProductBySlug } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

const SLUG = "pack1";

export async function generateMetadata(): Promise<Metadata> {
  const product = await getPublishedProductBySlug(SLUG);
  return product ? productMetadata(product) : { title: "المنتج غير متوفر | متجر أورفا" };
}

/** Legacy URL kept for ads and links: content comes from the admin catalog (slug "pack1"). */
export default async function Pack1Page() {
  const product = await getPublishedProductBySlug(SLUG);
  if (!product) notFound();
  return <ProductLanding product={product} />;
}
