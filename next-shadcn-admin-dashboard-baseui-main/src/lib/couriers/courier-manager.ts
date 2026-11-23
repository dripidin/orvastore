import { loadCourierConfig, type StoredCourierConfig } from "./credentials-store";
import { EcoTrackCourierProvider, RedexCourierProvider } from "./ecotrack-provider";
import { MaystroCourierProvider } from "./maystro-provider";
import { MockCourierProvider } from "./mock-provider";
import { NoestCourierProvider } from "./noest-provider";
import type {
  CourierConnectionResult,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierProvider,
  ICourierProvider,
} from "./types";
import { YalidineCourierProvider } from "./yalidine-provider";
import { ZrExpressCourierProvider } from "./zrexpress-provider";

export class CourierProviderManager {
  private providers: Map<string, CourierProvider> = new Map();
  private credentialsMap: Map<string, Record<string, string>> = new Map();
  private activeProviderId = "redex";

  constructor() {
    this.registerProvider(new RedexCourierProvider());
    this.registerProvider(new MockCourierProvider());
    this.registerProvider(new YalidineCourierProvider());
    this.registerProvider(new ZrExpressCourierProvider());
    this.registerProvider(new NoestCourierProvider());
    this.registerProvider(new MaystroCourierProvider());
  }

  public registerProvider(provider: CourierProvider | ICourierProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): CourierProvider | undefined {
    const clean = (id || "redex").trim().toLowerCase();
    return this.providers.get(clean) ?? (clean === "zr_express" ? this.providers.get("zrexpress") : undefined);
  }

  public getAllProviders(): CourierProvider[] {
    return Array.from(this.providers.values());
  }

  public getActiveProvider(): CourierProvider {
    const prov = this.providers.get(this.activeProviderId);
    if (!prov) {
      throw new Error(`Active provider not found: ${this.activeProviderId}`);
    }
    return prov;
  }

  public getActiveProviderId(): string {
    return this.activeProviderId;
  }

  public setCredentials(id: string, credentials: Record<string, string>): void {
    this.credentialsMap.set(id.trim().toLowerCase(), credentials);
  }

  public getCredentials(id?: string): Record<string, string> | undefined {
    const targetId = (id || this.activeProviderId).trim().toLowerCase();
    return this.credentialsMap.get(targetId);
  }

  public setActiveProvider(id: string, credentials?: Record<string, string>): void {
    const prov = this.getProvider(id);
    if (!prov) {
      const available = Array.from(this.providers.keys()).join(", ");
      throw new Error(`Cannot switch to unknown courier provider "${id}". Available: ${available}`);
    }

    if (id === "yalidine" && credentials && (!credentials.apiId || !credentials.apiToken)) {
      throw new Error("Yalidine requires apiId and apiToken");
    }

    if ((id === "zr_express" || id === "zrexpress") && credentials && (!credentials.apiKey || !credentials.apiSecret)) {
      throw new Error("ZR Express requires apiKey and apiSecret");
    }

    if (credentials) {
      this.credentialsMap.set(id, credentials);
    }

    this.activeProviderId = prov.id;
  }

  /**
   * Resolves a runtime provider + decrypted credentials directly from Supabase `courier_configurations`,
   * supporting ALL 26+ EcoTrack white-label tenants, Yalidine/Guepex, ZR Express, NOEST, Maystro, and custom carriers.
   */
  public async resolveConfiguredProvider(courierId?: string): Promise<{
    provider: CourierProvider;
    credentials: Record<string, string>;
    config: StoredCourierConfig | null;
  }> {
    const targetId = (courierId || this.activeProviderId || "redex").trim().toLowerCase();
    const cfg = await loadCourierConfig(targetId);

    if (cfg) {
      const creds: Record<string, string> = {
        token: cfg.apiToken || "",
        apiToken: cfg.apiToken || "",
        apiId: cfg.apiKey || cfg.accountId || "",
        apiKey: cfg.apiKey || "",
        key: cfg.apiKey || "",
        apiSecret: cfg.apiSecret || cfg.apiToken || "",
        accountId: cfg.accountId || "",
        baseUrl: cfg.baseUrl,
      };

      let provider: CourierProvider;
      const fam = cfg.family.toLowerCase();
      if (fam === "yalidine") {
        provider = new YalidineCourierProvider({ id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl });
      } else if (fam === "procolis" || fam === "zrexpress") {
        provider = new ZrExpressCourierProvider({ id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl });
      } else if (fam === "noest") {
        provider = new NoestCourierProvider({ id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl });
      } else if (fam === "maystro") {
        provider = new MaystroCourierProvider({ id: cfg.id, name: cfg.name, baseUrl: cfg.baseUrl });
      } else if (cfg.id === "mock") {
        provider = new MockCourierProvider();
      } else {
        provider = new EcoTrackCourierProvider({
          id: cfg.id,
          name: cfg.name,
          baseUrl: cfg.baseUrl,
        });
      }

      this.registerProvider(provider);
      this.setCredentials(cfg.id, creds);
      return { provider, credentials: creds, config: cfg };
    }

    const fallback = this.getProvider(targetId) || this.getActiveProvider();
    return {
      provider: fallback,
      credentials: this.getCredentials(fallback.id) || {},
      config: null,
    };
  }

  public async createParcel(request: CourierParcelRequest): Promise<CourierParcelResponse> {
    const provider = this.getActiveProvider();
    const creds = this.credentialsMap.get(this.activeProviderId);
    return provider.createParcel(request, creds);
  }

  public async testActiveConnection(): Promise<CourierConnectionResult> {
    const provider = this.getActiveProvider();
    const creds = this.credentialsMap.get(this.activeProviderId);
    return provider.testConnection(creds);
  }
}

let courierManagerInstance: CourierProviderManager | null = null;

export function getCourierProviderManager(): CourierProviderManager {
  if (!courierManagerInstance) {
    courierManagerInstance = new CourierProviderManager();
  }
  return courierManagerInstance;
}
