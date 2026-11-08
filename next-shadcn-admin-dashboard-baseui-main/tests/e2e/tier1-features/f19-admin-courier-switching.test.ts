import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { CourierProviderManager } from '../framework/domain-engine';

describe('Feature 19: Admin Courier Provider Switching', { tier: 'tier1', featureId: 'F19' }, () => {
  it('F19-T01: Initial default courier provider is Mock provider for test safety', () => {
    const manager = new CourierProviderManager();
    expect(manager.getActiveProviderId()).toBe('mock');
    expect(manager.getActiveProvider().name).toContain('Mock');
  });

  it('F19-T02: Admin switches active provider to Yalidine with valid credentials', () => {
    const manager = new CourierProviderManager();
    manager.setActiveProvider('yalidine', { apiId: 'valid-id', apiToken: 'valid-token' });
    expect(manager.getActiveProviderId()).toBe('yalidine');
    expect(manager.getActiveProvider().id).toBe('yalidine');
  });

  it('F19-T03: Admin switches active provider to ZR Express with valid credentials', () => {
    const manager = new CourierProviderManager();
    manager.setActiveProvider('zr_express', { apiKey: 'zr-key', apiSecret: 'zr-secret' });
    expect(manager.getActiveProviderId()).toBe('zr_express');
  });

  it('F19-T04: Switching to an unregistered provider ID throws an informative error', () => {
    const manager = new CourierProviderManager();
    assertThrows(() => {
      manager.setActiveProvider('unknown_carrier_dz');
    }, 'Cannot switch to unknown courier provider "unknown_carrier_dz"');
  });

  it('F19-T05: Attempting to switch to Yalidine without required apiToken throws error', () => {
    const manager = new CourierProviderManager();
    assertThrows(() => {
      manager.setActiveProvider('yalidine', { apiId: 'only-id' });
    }, 'Yalidine requires apiId and apiToken');
  });
});
