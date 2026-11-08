import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { executeOrderReRouting } from '../framework/domain-engine';
import { OrderReRoutingPayload } from '../framework/contracts';

describe('Feature 14: Order Re-routing (تحويل الطلبية)', { tier: 'tier1', featureId: 'F14' }, () => {
  const sampleSourceOrder = {
    orderNumber: 'ORV-261107-101',
    customerName: 'Old Customer Ahmed',
    wilayaName: 'Constantine',
    productPrice: 4950,
    status: 'RETURNED' as const
  };

  const samplePayload: OrderReRoutingPayload = {
    orderId: 'orig-uuid-101',
    sourceOrderId: 'orig-uuid-101',
    newCustomerName: 'Yacine Belkacem',
    newCustomerPhone: '0770554433',
    newWilayaCode: 19,
    newWilayaName: 'Sétif',
    newCommuneName: 'El Eulma',
    newDeliveryType: 'DOMICILE',
    newDeliveryAddress: 'Cité 500 Logements',
    reason: 'Original buyer refused delivery at stop-desk; redirected to waiting customer',
    operator: 'Admin Omar',
    shippedOverrideConfirmed: true
  };

  it('F14-T01: Re-routing returned order produces successful result with new orderId and sequence', () => {
    const result = executeOrderReRouting(sampleSourceOrder, samplePayload);
    expect(result.success).toBe(true);
    expect(result.orderId).toContain('REROUTE-ORV-261107-101');
    expect(result.sequence).toBeGreaterThan(0);
  });

  it('F14-T02: Re-routing recalculates shipping fee from Biskra origin to new destination Wilaya', () => {
    const result = executeOrderReRouting(sampleSourceOrder, samplePayload);
    expect(result.updatedShippingFee).toBe(500); // Setif zone 2
    expect(result.updatedTotal).toBe(4950 + 500);
  });

  it('F14-T03: Orders in terminal DELIVERED status cannot be re-routed', () => {
    const deliveredOrder = { ...sampleSourceOrder, status: 'DELIVERED' as const };
    assertThrows(() => {
      executeOrderReRouting(deliveredOrder, samplePayload);
    }, 'terminal status DELIVERED prohibits modification');
  });

  it('F14-T04: Re-routing validates new customer phone number against Algerian format', () => {
    const invalidPhonePayload = { ...samplePayload, newCustomerPhone: '021112233' };
    assertThrows(() => {
      executeOrderReRouting(sampleSourceOrder, invalidPhonePayload);
    }, 'Invalid new customer phone');
  });

  it('F14-T05: Re-routing result contains generated pre-formatted courier note', () => {
    const result = executeOrderReRouting(sampleSourceOrder, samplePayload);
    expect(result.formattedCourierNote).toBeDefined();
    expect(result.formattedCourierNote.length).toBeGreaterThan(100);
    expect(result.formattedCourierNote).toContain('Yacine Belkacem');
  });
});
