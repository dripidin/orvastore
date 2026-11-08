import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { CourierProviderManager } from '../framework/domain-engine';

describe('Boundary B19: Admin Courier Provider Switching Boundaries', { tier: 'tier2', featureId: 'B19' }, () => {
  it('B19-T01: Rapid consecutive provider switches update active provider reliably', () => {
    const manager = new CourierProviderManager();
    manager.setActiveProvider('yalidine', { apiId: 'id1', apiToken: 'tok1' });
    expect(manager.getActiveProviderId()).toBe('yalidine');
    manager.setActiveProvider('zr_express', { apiKey: 'k2', apiSecret: 's2' });
    expect(manager.getActiveProviderId()).toBe('zr_express');
    manager.setActiveProvider('mock');
    expect(manager.getActiveProviderId()).toBe('mock');
  });

  it('B19-T02: Switching to Yalidine with empty string credentials throws validation error', () => {
    const manager = new CourierProviderManager();
    assertThrows(() => {
      manager.setActiveProvider('yalidine', { apiId: '', apiToken: '' });
    }, 'Yalidine requires apiId and apiToken');
  });

  it('B19-T03: Switching to ZR Express with empty string secret throws validation error', () => {
    const manager = new CourierProviderManager();
    assertThrows(() => {
      manager.setActiveProvider('zr_express', { apiKey: 'key', apiSecret: '' });
    }, 'ZR Express requires apiKey and apiSecret');
  });

  it('B19-T04: Case sensitivity check: provider ID must match registered provider ID strictly', () => {
    const manager = new CourierProviderManager();
    assertThrows(() => {
      manager.setActiveProvider('YALIDINE');
    }, 'Cannot switch to unknown courier provider "YALIDINE"');
  });

  it('B19-T05: Active provider preserves state across multiple calls to getActiveProvider', () => {
    const manager = new CourierProviderManager();
    manager.setActiveProvider('zr_express', { apiKey: 'k', apiSecret: 's' });
    const p1 = manager.getActiveProvider();
    const p2 = manager.getActiveProvider();
    expect(p1.id).toBe(p2.id);
    expect(p1.id).toBe('zr_express');
  });
});
