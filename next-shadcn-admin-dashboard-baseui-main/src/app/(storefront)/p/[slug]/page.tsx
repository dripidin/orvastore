import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductLanding, productMetadata } from "@/components/storefront/catalog/product-landing";
import { getPublishedProductBySlug } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getPublishedProductBySlug(decodeURIComponent((await params).slug));
  return product ? productMetadata(product) : { title: "المنتج غير متوفر | متجر أورفا" };
}

export default async function ProductPage({ params }: Props) {
  const product = await getPublishedProductBySlug(decodeURIComponent((await params).slug));
  if (!product) notFound();
  return <ProductLanding product={product} />;
}
