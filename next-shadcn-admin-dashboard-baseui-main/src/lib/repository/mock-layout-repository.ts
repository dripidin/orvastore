/**
 * ORVA Store — Phase 7C Mock Layout Repository
 * 
 * Manages product page layout persistence locally in localStorage,
 * with fallbacks for global default and per-product configurations.
 */

import {
  ProductPageLayoutConfig,
  ILayoutRepository,
  createDefaultLayoutConfig,
} from "./layout-types";

const LAYOUT_STORAGE_KEY = "orva_product_layout_configs_v1";
const BROADCAST_CHANNEL_NAME = "orva_layout_sync_v1";

export class MockLayoutRepository implements ILayoutRepository {
  private configs: Map<string, ProductPageLayoutConfig> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.initData();
    this.setupCrossTabSync();
  }

  private initData() {
    if (typeof window === "undefined") {
      // In-memory fallback for testing & SSR
      const def = createDefaultLayoutConfig("global_default");
      this.configs.set("global_default", def);
      return;
    }

    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ProductPageLayoutConfig>;
        for (const [key, val] of Object.entries(parsed)) {
          this.configs.set(key, val);
        }
      }
    } catch {
      // Fallback
    }

    if (!this.configs.has("global_default")) {
      this.configs.set("global_default", createDefaultLayoutConfig("global_default"));
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, ProductPageLayoutConfig> = {};
      for (const [k, v] of this.configs.entries()) {
        obj[k] = v;
      }
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(obj));
      this.broadcastChannel?.postMessage({ type: "LAYOUT_UPDATED", timestamp: Date.now() });
      window.dispatchEvent(new CustomEvent("orva:layout-updated"));
    } catch (e) {
      console.warn("[MockLayoutRepository] Failed to persist layouts to localStorage", e);
    }
  }

  private setupCrossTabSync() {
    if (typeof window === "undefined") return;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === "LAYOUT_UPDATED") {
            this.initData();
            window.dispatchEvent(new CustomEvent("orva:layout-updated"));
          }
        };
      }

      window.addEventListener("storage", (event) => {
        if (event.key === LAYOUT_STORAGE_KEY) {
          this.initData();
          window.dispatchEvent(new CustomEvent("orva:layout-updated"));
        }
      });
    } catch (e) {
      console.warn("[MockLayoutRepository] Cross-tab sync warning:", e);
    }
  }

  async getLayoutConfig(productId: string = "global_default"): Promise<ProductPageLayoutConfig> {
    const targetKey = productId || "global_default";
    if (this.configs.has(targetKey)) {
      return JSON.parse(JSON.stringify(this.configs.get(targetKey)!));
    }
    if (this.configs.has("global_default")) {
      const globalDef = JSON.parse(JSON.stringify(this.configs.get("global_default")!));
      globalDef.productId = targetKey;
      return globalDef;
    }
    const brandNew = createDefaultLayoutConfig(targetKey);
    this.configs.set(targetKey, brandNew);
    this.persist();
    return JSON.parse(JSON.stringify(brandNew));
  }

  async saveLayoutConfig(config: ProductPageLayoutConfig): Promise<ProductPageLayoutConfig> {
    const targetKey = config.productId || "global_default";
    const updated: ProductPageLayoutConfig = {
      ...config,
      productId: targetKey,
      updatedAt: new Date().toISOString(),
    };

    this.configs.set(targetKey, updated);
    this.persist();
    return JSON.parse(JSON.stringify(updated));
  }

  async resetLayoutConfig(productId: string = "global_default"): Promise<ProductPageLayoutConfig> {
    const targetKey = productId || "global_default";
    this.configs.delete(targetKey);
    this.persist();
    return this.getLayoutConfig(targetKey);
  }

  async restoreDefaultLayout(productId: string = "global_default"): Promise<ProductPageLayoutConfig> {
    const targetKey = productId || "global_default";
    const def = createDefaultLayoutConfig(targetKey);
    this.configs.set(targetKey, def);
    this.persist();
    return JSON.parse(JSON.stringify(def));
  }

  async hasUnsavedChanges(
    current: ProductPageLayoutConfig,
    saved: ProductPageLayoutConfig
  ): Promise<boolean> {
    return JSON.stringify(current) !== JSON.stringify(saved);
  }
}

// Singleton accessor for React components
let singletonInstance: MockLayoutRepository | null = null;

export function getMockLayoutRepository(): MockLayoutRepository {
  if (!singletonInstance) {
    singletonInstance = new MockLayoutRepository();
  }
  return singletonInstance;
}
