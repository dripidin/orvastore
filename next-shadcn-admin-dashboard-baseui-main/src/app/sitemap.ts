import type { MetadataRoute } from "next";

import { listPublishedProducts } from "@/lib/catalog/server";
import { ORVA_CANONICAL_ORIGIN } from "@/lib/seo/storefront-schema";

export const dynamic = "force-dynamic";

function resolveRecentDate(iso?: string | null): Date {
  if (iso && iso.trim()) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2026) {
      return parsed;
    }
  }
  return new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const products = await listPublishedProducts();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${ORVA_CANONICAL_ORIGIN}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${ORVA_CANONICAL_ORIGIN}/shop/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${ORVA_CANONICAL_ORIGIN}/about/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${ORVA_CANONICAL_ORIGIN}/contact/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${ORVA_CANONICAL_ORIGIN}/terms/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${ORVA_CANONICAL_ORIGIN}${product.route}`,
    lastModified: resolveRecentDate(product.updatedAt),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  return [...staticEntries, ...productEntries];
}
