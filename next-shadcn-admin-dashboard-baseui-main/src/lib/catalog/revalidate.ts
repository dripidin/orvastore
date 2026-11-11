import { revalidatePath } from "next/cache";

/** Storefront routes that render catalog data (navbar, grids, landing pages). */
export const STORE_PATHS = ["/", "/shop", "/pack1", "/pack2", "/pack3", "/checkout"];

/** Clears cached storefront pages so admin changes are visible to customers immediately. */
export function revalidateStore(extraPaths: string[] = []): void {
  for (const path of [...STORE_PATHS, ...extraPaths]) {
    try {
      revalidatePath(path);
    } catch {
      // ignore: path may not be cached
    }
  }
  try {
    revalidatePath("/p/[slug]", "page");
    revalidatePath("/", "layout");
  } catch {
    // ignore
  }
}
