import {
  CourierProvider,
  ICourierProvider,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierConnectionResult,
} from './types';
import { MockCourierProvider } from './mock-provider';
import { YalidineCourierProvider } from './yalidine-provider';
import { ZrExpressCourierProvider } from './zrexpress-provider';

export class CourierProviderManager {
  private providers: Map<string, CourierProvider> = new Map();
  private credentialsMap: Map<string, Record<string, string>> = new Map();
  private activeProviderId = 'mock';

  constructor() {
    this.registerProvider(new MockCourierProvider());
    this.registerProvider(new YalidineCourierProvider());
    this.registerProvider(new ZrExpressCourierProvider());
  }

  public registerProvider(provider: CourierProvider | ICourierProvider): void {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: string): CourierProvider | undefined {
    return this.providers.get(id);
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
    this.credentialsMap.set(id, credentials);
  }

  public getCredentials(id?: string): Record<string, string> | undefined {
    const targetId = id || this.activeProviderId;
    return this.credentialsMap.get(targetId);
  }

  public setActiveProvider(id: string, credentials?: Record<string, string>): void {
    const prov = this.providers.get(id);
    if (!prov) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(
        `Cannot switch to unknown courier provider "${id}". Available: ${available}`
      );
    }

    if (id === 'yalidine' && credentials && (!credentials.apiId || !credentials.apiToken)) {
      throw new Error('Yalidine requires apiId and apiToken');
    }

    if (id === 'zr_express' && credentials && (!credentials.apiKey || !credentials.apiSecret)) {
      throw new Error('ZR Express requires apiKey and apiSecret');
    }

    if (credentials) {
      this.credentialsMap.set(id, credentials);
    }

    this.activeProviderId = id;
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

// Global singleton instance for app-wide courier routing
let courierManagerInstance: CourierProviderManager | null = null;

export function getCourierProviderManager(): CourierProviderManager {
  if (!courierManagerInstance) {
    courierManagerInstance = new CourierProviderManager();
  }
  return courierManagerInstance;
}
