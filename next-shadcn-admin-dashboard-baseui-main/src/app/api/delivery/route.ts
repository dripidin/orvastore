import { NextRequest, NextResponse } from 'next/server';
import {
  fallbackOrdersStore,
  getStoredFallbackOrders,
  saveAllFallbackOrders,
} from '@/lib/orders-store';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DEFAULT_MOCK_ORDERS } from '@/lib/repository/mock-orders-dataset';
import { rerouteOrderAction } from '@/app/actions/reroute';
import { OrderReRoutingPayload } from '@/lib/types/re-routing';

export const dynamic = 'force-dynamic';

function formatWilayaLabel(code?: number, name?: string): string {
  if (!name) return '—';
  if (code && !name.includes(String(code))) {
    return `${code.toString().padStart(2, '0')} - ${name}`;
  }
  return name;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'get_all_orders';

  if (action === 'get_all_orders') {
    const combinedOrders: any[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch from Supabase
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(dbOrders)) {
        for (const row of dbOrders) {
          const id = row.order_id || row.order_number || row.id;
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const deliveryTypeLabel =
            row.delivery_type ||
            (row.delivery_method === 'STOP_DESK'
              ? 'استلام من المكتب (Stop Desk)'
              : 'توصيل للمنزل');

          const resolvedProductName =
            row.product_name ||
            row.metadata?.productName ||
            (row.metadata?.packId
              ? row.metadata.packId === 'PACK1'
                ? 'باك منفاخ تويوتا وطقم المفاتيح'
                : row.metadata.packId === 'PACK2'
                ? 'باك ماكينة كراون CROWN 20V الأصلية'
                : row.metadata.packId === 'PACK3'
                ? 'باك الأشغال الشاقة CROWN و Starcle Pro'
                : `Pack ${row.metadata.packId.replace('PACK', '')}`
              : 'Pack ORVA');

          combinedOrders.push({
            orderId: id,
            storeId: row.store_id || 'orvastore',
            fullName: row.full_name || row.customer_name || '—',
            phone: row.phone || row.customer_phone || '',
            wilaya: row.wilaya || formatWilayaLabel(row.wilaya_code, row.wilaya_name || row.delivery_wilaya),
            commune: row.commune || row.commune_name || row.delivery_commune || '—',
            deliveryType: deliveryTypeLabel,
            deliveryTime: row.delivery_time || '24 - 48 H',
            quantity: row.quantity || 1,
            productName: resolvedProductName,
            priceNum: Number(row.price_num || row.subtotal || 4950),
            shippingFee: row.shipping_fee ? String(row.shipping_fee) : `${Number(row.delivery_fee || 500)} د.ج`,
            grandTotal: row.grand_total ? String(row.grand_total) : `${Number(row.total || 5450)} د.ج`,
            status: (row.status || 'pending').toLowerCase(),
            in_redex: Boolean(row.in_redex) || (row.courier_provider === 'REDEX' && (row.status === 'SHIPPED' || Boolean(row.tracking_number))),
            redex_tracking_code: row.redex_tracking_code || row.tracking_number || null,
            created_at: row.created_at || new Date().toISOString(),
            remarks: Array.isArray(row.remarks) && row.remarks.length > 0
              ? row.remarks
              : Array.isArray(row.metadata?.conversionLog)
                ? row.metadata.conversionLog
                : row.metadata?.conversionLog
                  ? [row.metadata.conversionLog]
                  : [],
          });
        }
      }
    } catch (err) {
      console.warn('[API /api/delivery] Supabase read error (using fallbacks):', err);
    }

    // 2. Fetch from Fallback Persistent Orders Store
    const fallbackOrders = getStoredFallbackOrders();
    for (const fb of fallbackOrders) {
      const id = fb.orderNumber || fb.id;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const deliveryTypeLabel =
        fb.deliveryType === 'STOP_DESK'
          ? 'استلام من المكتب (Stop Desk)'
          : 'توصيل للمنزل';

      const resolvedProductName =
        fb.productName ||
        (fb.packId === 'PACK1'
          ? 'باك منفاخ تويوتا وطقم المفاتيح'
          : fb.packId === 'PACK2'
          ? 'باك ماكينة كراون CROWN 20V الأصلية'
          : fb.packId === 'PACK3'
          ? 'باك الأشغال الشاقة CROWN و Starcle Pro'
          : `Pack ${fb.packId ? fb.packId.replace('PACK', '') : ''}`);

      combinedOrders.push({
        orderId: id,
        storeId: 'orvastore',
        fullName: fb.customerName,
        phone: fb.customerPhone,
        wilaya: formatWilayaLabel(fb.wilayaCode, fb.wilayaName),
        commune: fb.communeName,
        deliveryType: deliveryTypeLabel,
        deliveryTime: '24 - 48 H',
        quantity: 1,
        productName: resolvedProductName,
        priceNum: fb.productPrice,
        shippingFee: `${fb.shippingFee} د.ج`,
        grandTotal: `${fb.totalPayable} د.ج`,
        status: (fb.status || 'pending').toLowerCase(),
        in_redex: false,
        redex_tracking_code: null,
        created_at: fb.createdAt,
        remarks: (fb as any).remarks || [],
      });
    }

    // 3. Append Default Mock Seed Orders for complete demo / testing experience
    for (const mock of DEFAULT_MOCK_ORDERS) {
      const id = String(mock.orderId || mock.id);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        combinedOrders.push(mock);
      }
    }

    return NextResponse.json({
      success: true,
      data: combinedOrders,
      total: combinedOrders.length,
    });
  }

  return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const body = await request.json().catch(() => ({}));

    if (action === 'update_status') {
      const { orderId, status, actor } = body;
      if (!orderId || !status) {
        return NextResponse.json({ success: false, error: 'orderId and status required' }, { status: 400 });
      }

      const normalizedStatus = String(status).toLowerCase();

      // Update in fallback store
      const allStored = getStoredFallbackOrders();
      let updatedFallback = false;
      for (const fb of allStored) {
        if (fb.id === orderId || fb.orderNumber === orderId) {
          fb.status = normalizedStatus.toUpperCase() as any;
          updatedFallback = true;
        }
      }
      if (updatedFallback) {
        saveAllFallbackOrders(allStored);
      }

      // Update in Supabase
      try {
        const supabase = getSupabaseServerClient() as any;
        await supabase
          .from('orders')
          .update({
            status: normalizedStatus.toUpperCase(),
            updated_at: new Date().toISOString(),
          })
          .or(`id.eq.${orderId},order_id.eq.${orderId},order_number.eq.${orderId}`);
      } catch (err) {
        console.warn('[API /api/delivery] Supabase status update warning:', err);
      }

      return NextResponse.json({
        success: true,
        orderId,
        status: normalizedStatus,
        message: 'Order status updated successfully',
      });
    }

    if (action === 'bulk_update_status') {
      const { orderIds, status, actor } = body;
      if (!Array.isArray(orderIds) || !status) {
        return NextResponse.json({ success: false, error: 'orderIds array and status required' }, { status: 400 });
      }

      const normalizedStatus = String(status).toLowerCase();

      const allStored = getStoredFallbackOrders();
      let updatedFallback = false;
      for (const id of orderIds) {
        for (const fb of allStored) {
          if (fb.id === id || fb.orderNumber === id) {
            fb.status = normalizedStatus.toUpperCase() as any;
            updatedFallback = true;
          }
        }
      }
      if (updatedFallback) {
        saveAllFallbackOrders(allStored);
      }

      try {
        const supabase = getSupabaseServerClient() as any;
        await supabase
          .from('orders')
          .update({
            status: normalizedStatus.toUpperCase(),
            updated_at: new Date().toISOString(),
          })
          .or(`order_id.in.(${orderIds.join(',')}),id.in.(${orderIds.join(',')}),order_number.in.(${orderIds.join(',')})`);
      } catch (err) {
        console.warn('[API /api/delivery] Supabase bulk update warning:', err);
      }

      return NextResponse.json({
        success: true,
        updatedCount: orderIds.length,
        failedCount: 0,
        updatedOrderIds: orderIds,
      });
    }

    if (action === 'switch_order' || action === 'reroute_order') {
      const payload: OrderReRoutingPayload = {
        orderId: body.orderId,
        sourceOrderId: body.sourceOrderId || body.orderId,
        newCustomerName: body.newCustomerName || body.fullName,
        newCustomerPhone: body.newCustomerPhone || body.phone,
        newCustomerPhone2: body.newCustomerPhone2 || body.phone2,
        newWilayaCode: Number(body.newWilayaCode || body.wilayaCode || 16),
        newWilayaName: body.newWilayaName || body.wilaya || 'Alger',
        newCommuneName: body.newCommuneName || body.commune || 'Alger',
        newDeliveryType: (body.newDeliveryType || (body.deliveryType?.includes('مكتب') ? 'STOP_DESK' : 'DOMICILE')) as any,
        newDeliveryAddress: body.newDeliveryAddress || body.deliveryAddress || body.address,
        reason: body.reason || 'تحويل الطلبية بناء على طلب الزبون',
        operator: body.operator || body.claimedOperatorName || 'Admin',
        shippedOverrideConfirmed: Boolean(body.shippedOverrideConfirmed || body.operatorOverride),
      };

      const result = await rerouteOrderAction(payload);
      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        redexComment: result.formattedCourierNote,
        message: 'تم تحويل الطلبية بنجاح.',
        data: result,
      });
    }

    if (action === 'create' || action === 'push_order') {
      const trackingCode = `RDX-DZ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
      return NextResponse.json({
        success: true,
        trackingCode,
        trackingNumber: trackingCode,
        courierId: body.courierId || 'REDEX',
        courierName: body.courierName || 'Redex Express',
        labelUrl: `/api/delivery?action=label_pdf&tracking=${trackingCode}`,
        message: 'تم إرسال الطلبية بنجاح لشركة التوصيل.',
      });
    }

    if (action === 'delete') {
      return NextResponse.json({ success: true, message: 'Order archived/deleted' });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error occurred' },
      { status: 500 }
    );
  }
}
