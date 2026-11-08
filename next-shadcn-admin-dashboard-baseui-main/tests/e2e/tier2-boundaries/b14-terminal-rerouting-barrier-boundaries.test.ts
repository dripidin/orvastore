import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { executeOrderReRouting } from '../framework/domain-engine';
import { OrderReRoutingPayload } from '../framework/contracts';

describe('Boundary B14: Terminal Re-routing Barrier & Safety', { tier: 'tier2', featureId: 'B14' }, () => {
  const basePayload: OrderReRoutingPayload = {
    orderId: 'uuid-source-999',
    newCustomerName: 'Redouane Kaci',
    newCustomerPhone: '0550112233',
    newWilayaCode: 16,
    newWilayaName: 'Alger',
    newCommuneName: 'El Harrach',
    newDeliveryType: 'DOMICILE',
    reason: 'Forwarded to confirmed buyer',
    operator: 'Operator Maya',
    shippedOverrideConfirmed: true
  };

  it('B14-T01: Order in terminal DELIVERED status throws error preventing re-routing', () => {
    const order = {
      orderNumber: 'ORV-DELIVERED-001',
      customerName: 'Delivered Buyer',
      wilayaName: 'Alger',
      productPrice: 4950,
      status: 'DELIVERED' as const
    };
    assertThrows(() => {
      executeOrderReRouting(order, basePayload);
    }, 'terminal status DELIVERED prohibits modification');
  });

  it('B14-T02: Order in terminal RECONCILED status throws error preventing re-routing', () => {
    const order = {
      orderNumber: 'ORV-RECONCILED-002',
      customerName: 'Reconciled Buyer',
      wilayaName: 'Oran',
      productPrice: 13390,
      status: 'RECONCILED' as const
    };
    assertThrows(() => {
      executeOrderReRouting(order, basePayload);
    }, 'terminal status RECONCILED prohibits modification');
  });

  it('B14-T03: Order in CANCELLED status held at courier stop-desk can be successfully re-routed', () => {
    const order = {
      orderNumber: 'ORV-CANCELLED-003',
      customerName: 'Cancelled Buyer',
      wilayaName: 'Biskra',
      productPrice: 4950,
      status: 'CANCELLED' as const
    };
    const res = executeOrderReRouting(order, basePayload);
    expect(res.success).toBe(true);
  });

  it('B14-T04: Order in RETURNED status held at regional hub can be successfully re-routed', () => {
    const order = {
      orderNumber: 'ORV-RETURNED-004',
      customerName: 'Returned Buyer',
      wilayaName: 'Constantine',
      productPrice: 15950,
      status: 'RETURNED' as const
    };
    const res = executeOrderReRouting(order, basePayload);
    expect(res.success).toBe(true);
  });

  it('B14-T05: Re-routing to Wilaya 54 with STOP_DESK is blocked by barrier', () => {
    const order = {
      orderNumber: 'ORV-RETURNED-005',
      customerName: 'Returned Buyer',
      wilayaName: 'Constantine',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    const payloadWithStopDeskInGuezzam: OrderReRoutingPayload = {
      ...basePayload,
      newWilayaCode: 54,
      newWilayaName: 'In Guezzam',
      newDeliveryType: 'STOP_DESK'
    };
    assertThrows(() => {
      executeOrderReRouting(order, payloadWithStopDeskInGuezzam);
    }, 'Stop-Desk is restricted in Wilaya 54');
  });
});
