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
import {
  getEcoTrackClient,
  extractWilayaCode,
  cleanAlgerianPhone,
  ECOTRACK_STATUS_MAP_AR,
} from '@/lib/couriers/ecotrack-client';
import { verifyAdminSession, getVerifiedAdminSession } from '@/lib/auth/admin-auth';
import {
  generateOperationId,
  createRecoveryReceipt,
  verifyRecoveryReceipt,
  acquirePreCarrierReservation,
  recordCarrierAcceptedFailure,
  recordReconciliationSuccess,
  executeSafeReconciliation,
} from '@/lib/couriers/delivery-reconciliation';

export const dynamic = 'force-dynamic';

function formatWilayaLabel(code?: number, name?: string): string {
  if (!name) return '—';
  if (code && !name.includes(String(code))) {
    return `${code.toString().padStart(2, '0')} - ${name}`;
  }
  return name;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORVA_MANUAL_STATUSES = new Set(['PENDING', 'CONFIRMED', 'CANCELLED']);

function buildOrderIdFilter(orderId: string): string {
  const clean = String(orderId).trim().replace(/[,()]/g, '');
  const parts = [`order_id.eq.${clean}`, `order_number.eq.${clean}`];
  if (UUID_PATTERN.test(clean)) parts.unshift(`id.eq.${clean}`);
  return parts.join(',');
}

/**
 * ORVA-only status change: writes orders.status in Supabase and never calls Redex.
 */
async function updateOrvaOrderStatus(
  orderId: string,
  normalizedStatus: string,
  actor: string
): Promise<{ success: boolean; error?: string; httpStatus: number }> {
  let supabase: any;
  try {
    supabase = getSupabaseServerClient() as any;
  } catch (err: any) {
    const allStored = getStoredFallbackOrders();
    let updated = false;
    for (const fb of allStored) {
      if (fb.id === orderId || fb.orderNumber === orderId) {
        fb.status = normalizedStatus as any;
        updated = true;
      }
    }
    if (updated && process.env.NODE_ENV !== 'production') {
      saveAllFallbackOrders(allStored);
      return { success: true, httpStatus: 200 };
    }
    return { success: false, error: 'Database unavailable: status not saved', httpStatus: 503 };
  }

  const filter = buildOrderIdFilter(orderId);
  const readQuery = supabase.from('orders').select('id, status, remarks').or(filter);
  const { data: existing, error: readErr } = await (typeof readQuery.limit === 'function'
    ? readQuery.limit(1).maybeSingle()
    : readQuery.maybeSingle());

  if (readErr) {
    console.error('[API /api/delivery] Status read failed:', readErr.message);
    return { success: false, error: `Database error: ${readErr.message}`, httpStatus: 500 };
  }
  if (!existing) {
    return { success: false, error: `Order ${orderId} not found`, httpStatus: 404 };
  }

  const remarks = Array.isArray(existing.remarks) ? existing.remarks : [];
  const updateBuilder = supabase
    .from('orders')
    .update({
      status: normalizedStatus,
      remarks: [
        ...remarks,
        {
          event: 'STATUS_CHANGE',
          from: existing.status,
          to: normalizedStatus,
          actor,
          source: 'orva_dashboard',
          timestamp_utc: new Date().toISOString(),
        },
      ],
      updated_at: new Date().toISOString(),
    });
  const updateTarget = typeof updateBuilder.eq === 'function'
    ? updateBuilder.eq('id', existing.id)
    : updateBuilder.or(filter);
  const { data: updatedRows, error: updateErr } = await updateTarget.select('id, status');

  if (updateErr) {
    console.error('[API /api/delivery] Status update failed:', updateErr.message);
    return { success: false, error: `Database error: ${updateErr.message}`, httpStatus: 500 };
  }
  if (!updatedRows || updatedRows.length === 0) {
    return { success: false, error: `Order ${orderId} was not updated`, httpStatus: 409 };
  }
  return { success: true, httpStatus: 200 };
}

/**
 * Standard Order Cancellation (v2.1.0):
 * 1. Cancels parcel on Redex if it has an active tracking code
 * 2. Updates Supabase orders status to 'CANCELLED' without deleting the record
 * 3. Appends cancellation event to order remarks/timeline
 * 4. Updates deliveries table status to 'CANCELLED'
 */
async function executeOrderCancellation(orderIdOrTracking: string, reason?: string, actor?: string) {
  const target = String(orderIdOrTracking || '').trim();
  if (!target) return { success: false, error: 'معرّف الطلبية أو رقم التتبع مطلوب للإلغاء' };

  const supabase = getSupabaseServerClient() as any;
  let trackingCode: string | null = null;
  let resolvedOrderId = target;
  let previousRemarks: any[] = [];
  let previousStatus = 'PENDING';

  // 1. Find order record in Supabase
  try {
    const { data: orderRow } = await supabase
      .from('orders')
      .select('*')
      .or(`${buildOrderIdFilter(target)},tracking_code.eq.${target},redex_tracking_code.eq.${target}`)
      .maybeSingle();

    if (orderRow) {
      resolvedOrderId = orderRow.order_id || orderRow.order_number || orderRow.id;
      trackingCode = orderRow.tracking_code || orderRow.redex_tracking_code;
      previousStatus = orderRow.status || 'PENDING';
      if (Array.isArray(orderRow.remarks)) {
        previousRemarks = orderRow.remarks;
      }
    }
  } catch (findErr) {
    console.warn('[API /api/delivery] Cancellation search warning:', findErr);
  }

  if (!trackingCode && target.startsWith('EC')) {
    trackingCode = target;
  }

  // 2. Cancel on Redex if tracking is present
  let redexCancelled = false;
  let redexError: string | null = null;
  if (trackingCode) {
    try {
      const ecotrack = getEcoTrackClient();
      const cancelRes = await ecotrack.deleteOrder(trackingCode);
      redexCancelled = cancelRes.success;
      if (!cancelRes.success) {
        redexError = cancelRes.error || null;
      }
    } catch (courierErr: any) {
      console.warn('[API /api/delivery] Courier cancellation attempt warning:', courierErr);
      redexError = courierErr?.message || 'تعذر إلغاء الطرد في Redex';
    }
  }

  const cancelEvent = {
    event: 'ORDER_CANCELLED',
    reason: reason || 'إلغاء الطلبية من لوحة التحكم (Admin Cancel)',
    actor: actor || 'Admin',
    timestamp_utc: new Date().toISOString(),
    previous_status: previousStatus,
    redex_tracking_code: trackingCode,
    redex_cancelled: redexCancelled,
    redex_error: redexError,
  };

  const updatedRemarks = [...previousRemarks, cancelEvent];

  // 3. Update Supabase orders table (NEVER DELETE, keep history)
  let dbSuccess = false;
  try {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'CANCELLED',
        remarks: updatedRemarks,
        updated_at: new Date().toISOString(),
      })
      .or(buildOrderIdFilter(resolvedOrderId))
      .select('id, status');

    dbSuccess = !updateErr && Array.isArray(updatedRows) && updatedRows.length > 0;
    if (updateErr) {
      console.warn('[API /api/delivery] Supabase cancellation update error:', updateErr);
    } else if (!dbSuccess) {
      console.warn('[API /api/delivery] Supabase cancellation: 0 rows modified by query. Verify RLS policies and ID:', resolvedOrderId);
    }
  } catch (dbErr) {
    console.warn('[API /api/delivery] Supabase cancellation exception:', dbErr);
  }

  // 4. Update Supabase deliveries table
  try {
    await supabase
      .from('deliveries')
      .update({
        status: 'CANCELLED',
        carrier_status: 'annule',
        carrier_status_ar: 'ملغى لدى شركة التوصيل',
        updated_at: new Date().toISOString(),
      })
      .or(`order_id.eq.${resolvedOrderId},tracking_number.eq.${trackingCode}`);
  } catch (delivErr) {
    // Deliveries table may not be migrated yet
  }

  // 5. Update fallback persistent store
  const allStored = getStoredFallbackOrders();
  for (const fb of allStored) {
    if (
      fb.id === resolvedOrderId ||
      fb.orderNumber === resolvedOrderId ||
      (fb as any).redex_tracking_code === trackingCode ||
      (fb as any).tracking_code === trackingCode
    ) {
      fb.status = 'CANCELLED' as any;
      if (!fb.remarks) fb.remarks = [];
      fb.remarks.push(cancelEvent);
    }
  }
  saveAllFallbackOrders(allStored);

  return {
    success: true,
    orderId: resolvedOrderId,
    trackingCode,
    redexCancelled,
    status: 'cancelled',
    message: redexCancelled
      ? `تم إلغاء الطلبية #${resolvedOrderId} والشحنة لدى Redex (${trackingCode}) بنجاح.`
      : `تم إلغاء الطلبية #${resolvedOrderId} محلياً في النظام بنجاح.`,
  };
}

/**
 * Hard Delete Order (Only for cleanup when specifically required)
 */
async function executeOrderHardDeletion(orderIdOrTracking: string) {
  const target = String(orderIdOrTracking || '').trim();
  if (!target) return { success: false, error: 'Order ID is required' };

  const supabase = getSupabaseServerClient() as any;

  // Cancel on Redex first
  try {
    const { data: orderRow } = await supabase
      .from('orders')
      .select('tracking_code, redex_tracking_code')
      .or(buildOrderIdFilter(target))
      .maybeSingle();

    const tracking = orderRow?.tracking_code || orderRow?.redex_tracking_code || (target.startsWith('EC') ? target : null);
    if (tracking) {
      const ecotrack = getEcoTrackClient();
      await ecotrack.deleteOrder(tracking);
    }
  } catch (err) {
    console.warn('[API /api/delivery] Hard delete Redex check error:', err);
  }

  // Delete from Supabase orders & deliveries
  try {
    await supabase
      .from('orders')
      .delete()
      .or(buildOrderIdFilter(target));
    await supabase
      .from('deliveries')
      .delete()
      .or(`order_id.eq.${target}`);
  } catch (dbErr) {
    console.warn('[API /api/delivery] Supabase hard delete warning:', dbErr);
  }

  // Remove from fallback store
  const allStored = getStoredFallbackOrders();
  const filtered = allStored.filter(
    (fb) =>
      fb.id !== target &&
      fb.orderNumber !== target &&
      (fb as any).redex_tracking_code !== target &&
      (fb as any).tracking_code !== target
  );
  if (filtered.length !== allStored.length) {
    saveAllFallbackOrders(filtered);
  }

  return { success: true, message: `تم حذف الطلبية #${target} نهائياً.` };
}

// ── GET HANDLER ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'get_all_orders';

  // 1. Single Tracking Info & Timeline Sync
  if (action === 'track' || action === 'get_tracking') {
    const tracking = searchParams.get('tracking')?.trim();
    if (!tracking) {
      return NextResponse.json({ success: false, error: 'Tracking code is required' }, { status: 400 });
    }

    const ecotrack = getEcoTrackClient();
    const trackingInfo = await ecotrack.getTrackingInfo(tracking);

    // If tracking indicates an advanced or terminal status, update deliveries & orders
    if (trackingInfo.success && trackingInfo.status) {
      const statusCode = trackingInfo.status.toLowerCase();
      let newDbStatus: string | null = null;
      let newDeliveryStatus = 'IN_TRANSIT';

      if (['livred', 'livre_non_encaisse', 'encaisse_non_paye', 'encaissed', 'payed', 'paye_et_archive'].includes(statusCode)) {
        newDbStatus = 'DELIVERED';
        newDeliveryStatus = 'DELIVERED';
      } else if (['return_asked', 'return_in_transit', 'retour_chez_livreur', 'retour_transit_entrepot', 'retour_en_traitement', 'retour_recu', 'return_received', 'retour_archive'].includes(statusCode)) {
        newDbStatus = 'RETURNED';
        newDeliveryStatus = 'RETURNED';
      } else if (['annule'].includes(statusCode)) {
        newDbStatus = 'CANCELLED';
        newDeliveryStatus = 'CANCELLED';
      } else if (['en_livraison', 'dispatched_to_driver'].includes(statusCode)) {
        newDeliveryStatus = 'OUT_FOR_DELIVERY';
      } else if (['prete_a_expedier', 'order_information_received_by_carrier'].includes(statusCode)) {
        newDeliveryStatus = 'CREATED';
      }

      const supabase = getSupabaseServerClient() as any;

      // Update deliveries table
      try {
        await supabase
          .from('deliveries')
          .update({
            status: newDeliveryStatus,
            carrier_status: statusCode,
            carrier_status_ar: trackingInfo.statusAr || ECOTRACK_STATUS_MAP_AR[statusCode] || statusCode,
            raw_response: {
              activity: trackingInfo.activity,
              currentStation: trackingInfo.currentStation,
              financialStatus: trackingInfo.financialStatus,
              last_synced_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('tracking_number', tracking);
      } catch (delivErr) {
        // deliveries table fallback
      }

      // Update orders table if terminal status
      if (newDbStatus) {
        try {
          await supabase
            .from('orders')
            .update({
              status: newDbStatus,
              updated_at: new Date().toISOString(),
            })
            .or(`tracking_code.eq.${tracking},redex_tracking_code.eq.${tracking}`);
        } catch (dbErr) {
          console.warn('[API /api/delivery] Supabase sync on tracking update:', dbErr);
        }

        const allStored = getStoredFallbackOrders();
        let fallbackUpdated = false;
        for (const fb of allStored) {
          if ((fb as any).redex_tracking_code === tracking || (fb as any).tracking_code === tracking) {
            fb.status = newDbStatus as any;
            fallbackUpdated = true;
          }
        }
        if (fallbackUpdated) saveAllFallbackOrders(allStored);
      }
    }

    return NextResponse.json(trackingInfo);
  }

  // 2. Official PDF Label Streaming Proxy
  if (action === 'label_pdf') {
    if (!await verifyAdminSession(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Admin session required to download shipping labels' },
        { status: 401 }
      );
    }

    const tracking = searchParams.get('tracking')?.trim();
    if (!tracking) {
      return NextResponse.json({ success: false, error: 'Tracking code is required' }, { status: 400 });
    }

    const ecotrack = getEcoTrackClient();
    const pdfResult = await ecotrack.fetchLabelPdf(tracking);

    if (!pdfResult.success || !pdfResult.buffer) {
      return NextResponse.json(
        { success: false, error: pdfResult.error || 'Failed to retrieve PDF label from Redex' },
        { status: 502 }
      );
    }

    return new NextResponse(pdfResult.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="redex-label-${tracking}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 3. Bulk Sync Active Orders with Redex
  if (action === 'sync_all_active') {
    if (!await verifyAdminSession(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin session required' }, { status: 401 });
    }
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select('id, order_id, order_number, tracking_code, redex_tracking_code, status')
        .or('in_redex.eq.true,courier.eq.REDEX,tracking_code.not.is.null,redex_tracking_code.not.is.null')
        .not('status', 'in', '("DELIVERED","RETURNED","CANCELLED")')
        .limit(100);

      if (error || !Array.isArray(dbOrders) || dbOrders.length === 0) {
        return NextResponse.json({ success: true, updatedCount: 0, message: 'لا توجد شحنات نشطة تحتاج للمزامنة حالياً.' });
      }

      const trackings: string[] = [];
      for (const row of dbOrders) {
        const tracking = row.tracking_code || row.redex_tracking_code;
        if (tracking && !trackings.includes(tracking)) {
          trackings.push(tracking);
        }
      }

      if (!trackings.length) {
        return NextResponse.json({ success: true, updatedCount: 0, message: 'لم يتم العثور على أرقام تتبع صالحة.' });
      }

      const ecotrack = getEcoTrackClient();
      const bulkResult = await ecotrack.getBulkOrdersStatus(trackings);

      let updatedCount = 0;
      if (bulkResult.success && bulkResult.data) {
        for (const [tracking, info] of Object.entries(bulkResult.data)) {
          const rawStatus = (info?.status || '').toLowerCase();
          let newDbStatus: string | null = null;
          if (['livred', 'livre_non_encaisse', 'encaisse_non_paye', 'encaissed', 'payed', 'paye_et_archive'].includes(rawStatus)) {
            newDbStatus = 'DELIVERED';
          } else if (['retour_recu', 'return_received', 'retour_archive', 'retour_en_traitement'].includes(rawStatus)) {
            newDbStatus = 'RETURNED';
          } else if (['annule'].includes(rawStatus)) {
            newDbStatus = 'CANCELLED';
          }

          if (newDbStatus) {
            await supabase
              .from('orders')
              .update({ status: newDbStatus, updated_at: new Date().toISOString() })
              .or(`tracking_code.eq.${tracking},redex_tracking_code.eq.${tracking}`);
            updatedCount++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        checkedCount: trackings.length,
        updatedCount,
        message: `تمت مزامنة ${trackings.length} شحنة مع Redex بنجاح وتحديث ${updatedCount} طلب.`,
      });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err?.message || 'Sync error' }, { status: 500 });
    }
  }

  // 4. Test Connection with Redex
  if (action === 'test_connection') {
    const ecotrack = getEcoTrackClient();
    const result = await ecotrack.testConnection();
    return NextResponse.json(result);
  }

  // 5. Platform Data: Get Communes
  if (action === 'get_communes') {
    const wilayaId = searchParams.get('wilaya_id') ? parseInt(searchParams.get('wilaya_id')!, 10) : undefined;
    const ecotrack = getEcoTrackClient();
    const communes = await ecotrack.getCommunes(wilayaId);
    return NextResponse.json({ success: true, data: communes, total: communes.length });
  }

  // 6. Platform Data: Get Fees
  if (action === 'get_fees') {
    const ecotrack = getEcoTrackClient();
    const feesResult = await ecotrack.getFees();
    return NextResponse.json(feesResult);
  }

  // 7. Platform Data: Get Desks
  if (action === 'get_desks') {
    const ecotrack = getEcoTrackClient();
    const desksResult = await ecotrack.getDesks();
    return NextResponse.json(desksResult);
  }

  // 8. Platform Data: Get Wilayas
  if (action === 'get_wilayas') {
    const ecotrack = getEcoTrackClient();
    const wilayasResult = await ecotrack.getWilayas();
    return NextResponse.json(wilayasResult);
  }

  // 9. Platform Data: Get Products List
  if (action === 'get_products') {
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const ecotrack = getEcoTrackClient();
    const productsResult = await ecotrack.getProducts(page);
    return NextResponse.json(productsResult);
  }

  // 10. Fetch all orders (Supabase + Deliveries + Fallback)
  if (action === 'get_all_orders') {
    if (!await verifyAdminSession(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Admin session required' }, { status: 401 });
    }
    const combinedOrders: any[] = [];
    const seenIds = new Set<string>();
    let supabaseSuccess = false;

    // 1. Fetch from Supabase
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(dbOrders)) {
        supabaseSuccess = true;

        // Fetch deliveries records to link shipping state
        let deliveriesMap = new Map<string, any>();
        try {
          const { data: delivRows } = await supabase
            .from('deliveries')
            .select('*');
          if (Array.isArray(delivRows)) {
            for (const d of delivRows) {
              if (d.order_id) deliveriesMap.set(String(d.order_id), d);
              if (d.tracking_number) deliveriesMap.set(String(d.tracking_number), d);
            }
          }
        } catch {
          // deliveries table optional if not yet migrated
        }

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

          const resolvedTracking = row.tracking_code || row.redex_tracking_code || null;
          const deliveryInfo = deliveriesMap.get(id) || (resolvedTracking ? deliveriesMap.get(resolvedTracking) : null);

          // Operational status only
          const opStatus = (row.status || 'pending').toLowerCase();

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
            priceNum: Number(row.price_num || row.unit_price || row.subtotal || 4950),
            productTotal: row.product_total
              ? String(row.product_total)
              : row.subtotal
                ? `${Number(row.subtotal)} د.ج`
                : undefined,
            subtotal: row.subtotal != null ? Number(row.subtotal) : undefined,
            deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : undefined,
            totalPayable: row.total_payable != null ? Number(row.total_payable) : (row.total != null ? Number(row.total) : undefined),
            shippingFee: row.shipping_fee ? String(row.shipping_fee) : `${Number(row.delivery_fee || 500)} د.ج`,
            grandTotal: row.grand_total ? String(row.grand_total) : `${Number(row.total_payable || row.total_price || row.total || 5450)} د.ج`,
            status: opStatus,
            in_redex: Boolean(row.in_redex) || Boolean(resolvedTracking),
            redex_tracking_code: resolvedTracking,
            tracking_code: resolvedTracking,
            tracking_number: resolvedTracking,
            carrier_status: deliveryInfo?.carrier_status || (resolvedTracking ? 'prete_a_expedier' : null),
            carrier_status_ar: deliveryInfo?.carrier_status_ar || (resolvedTracking ? 'جاهز للإرسال' : null),
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

      const resolvedTracking = (fb as any).redex_tracking_code || (fb as any).tracking_code || null;

      combinedOrders.push({
        orderId: id,
        storeId: (fb as any).storeId || 'orvastore',
        fullName: fb.customerName || '—',
        phone: fb.customerPhone || '',
        wilaya: formatWilayaLabel(fb.wilayaCode, fb.wilayaName),
        commune: fb.communeName || '—',
        deliveryType: fb.deliveryType === 'STOP_DESK' ? 'استلام من المكتب (Stop Desk)' : 'توصيل للمنزل',
        deliveryTime: '24 - 48 H',
        quantity: 1,
        productName: fb.productName || 'Pack ORVA',
        priceNum: fb.productPrice || 4950,
        shippingFee: `${fb.shippingFee || 500} د.ج`,
        grandTotal: `${fb.totalPayable} د.ج`,
        status: (fb.status || 'pending').toLowerCase(),
        in_redex: Boolean((fb as any).in_redex) || Boolean(resolvedTracking),
        redex_tracking_code: resolvedTracking,
        tracking_code: resolvedTracking,
        tracking_number: resolvedTracking,
        carrier_status: resolvedTracking ? 'prete_a_expedier' : null,
        carrier_status_ar: resolvedTracking ? 'جاهز للإرسال' : null,
        created_at: fb.createdAt,
        remarks: fb.remarks || [],
      });
    }

    // 3. ZERO MOCK DATA IN PRODUCTION:
    // Only inject default mock orders if database is completely empty and no fallback orders exist (e.g. brand new fresh dev clone)
    if (combinedOrders.length === 0 && !supabaseSuccess) {
      for (const mock of DEFAULT_MOCK_ORDERS) {
        const id = String(mock.orderId || mock.id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          combinedOrders.push(mock);
        }
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

// ── IN-MEMORY CONCURRENCY LOCKS (Layer 1 Protection) ───────────────────────
interface ValidationMemoryLock {
  leaseId: string;
  expiresAt: number;
  actor: string;
}

const memoryLockMap: Map<string, ValidationMemoryLock> =
  (globalThis as any).__validationMemoryLocks ||
  ((globalThis as any).__validationMemoryLocks = new Map());

// ── POST HANDLER ────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const adminSession = await getVerifiedAdminSession(request);
  if (!adminSession || !adminSession.sid) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Valid admin session with session identifier required' },
      { status: 401 }
    );
  }
  if (adminSession.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Forbidden: Admin role required' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);

  try {
    const body = await request.json().catch(() => ({}));
    const action = searchParams.get('action') || body.action;

    // Update Status
    if (action === 'update_status') {
      const { orderId, status } = body;
      if (!orderId || !status) {
        return NextResponse.json({ success: false, error: 'orderId and status required' }, { status: 400 });
      }

      const normalizedStatus = String(status).toUpperCase();
      if (!ORVA_MANUAL_STATUSES.has(normalizedStatus)) {
        return NextResponse.json(
          { success: false, error: `Status '${status}' cannot be set manually. Allowed: pending, confirmed, cancelled.` },
          { status: 400 }
        );
      }

      const actorLabel = `admin:${String(adminSession.sid).slice(0, 8)}`;
      const result = await updateOrvaOrderStatus(String(orderId), normalizedStatus, actorLabel);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.httpStatus }
        );
      }

      return NextResponse.json({
        success: true,
        orderId,
        status: normalizedStatus.toLowerCase(),
        message: 'Order status updated successfully',
      });
    }

    // Bulk Update Status
    if (action === 'bulk_update_status') {
      const { orderIds, status } = body;
      if (!Array.isArray(orderIds) || !status) {
        return NextResponse.json({ success: false, error: 'orderIds array and status required' }, { status: 400 });
      }

      const normalizedStatus = String(status).toUpperCase();
      if (!ORVA_MANUAL_STATUSES.has(normalizedStatus)) {
        return NextResponse.json(
          { success: false, error: `Status '${status}' cannot be set manually. Allowed: pending, confirmed, cancelled.` },
          { status: 400 }
        );
      }

      const actorLabel = `admin:${String(adminSession.sid).slice(0, 8)}`;
      const updatedOrderIds: string[] = [];
      const failed: { orderId: string; error: string }[] = [];
      for (const id of orderIds) {
        const result = await updateOrvaOrderStatus(String(id), normalizedStatus, actorLabel);
        if (result.success) updatedOrderIds.push(String(id));
        else failed.push({ orderId: String(id), error: result.error || 'Update failed' });
      }

      return NextResponse.json(
        {
          success: updatedOrderIds.length > 0,
          updatedCount: updatedOrderIds.length,
          failedCount: failed.length,
          updatedOrderIds,
          failed,
          error: updatedOrderIds.length === 0 ? failed[0]?.error || 'No orders updated' : undefined,
        },
        { status: updatedOrderIds.length > 0 ? 200 : 500 }
      );
    }

    // Cancel Order (Non-destructive: Cancels parcel on Redex and sets status CANCELLED)
    if (action === 'cancel_order') {
      const orderId = body.orderId || body.id || body.orderNumber || body.tracking;
      const reason = body.reason || 'إلغاء الطلبية من قبل الإدارة';
      const actor = body.actor || 'Admin';

      const result = await executeOrderCancellation(orderId, reason, actor);
      return NextResponse.json(result);
    }

    // Switch / Reroute Order
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
        reason: body.reason || 'تحويل الطلبية بناءً على طلب الزبون',
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

    // Explicit Reconcile Order (Idempotent Recovery Worker - Stage 2 Remediation B)
    // Strictly interrogates carrier state first and NEVER calls validOrder()!
    if (action === 'reconcile_order') {
      if (!adminSession?.sid) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Session identifier missing' }, { status: 401 });
      }
      if (adminSession.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Forbidden: Admin role required' }, { status: 403 });
      }
      const verifiedActor = `admin:${adminSession.sid.slice(0, 8)}`;
      const tracking = (
        searchParams.get('tracking') ||
        body.tracking ||
        body.trackingCode ||
        body.trackingNumber ||
        ''
      ).trim();

      if (!tracking) {
        return NextResponse.json({ success: false, error: 'Tracking code required for reconciliation' }, { status: 400 });
      }

      const rawAsk = body.askCollection ?? body.ask_collection ?? 0;
      const askCollection = Number(rawAsk) === 1 ? 1 : 0;
      const operationId = generateOperationId(tracking, askCollection, body.operationId || body.operation_id);
      const ecotrack = getEcoTrackClient({ baseUrl: body.baseUrl, token: body.token });
      const supabase = getSupabaseServerClient() as any;

      const reconResult = await executeSafeReconciliation({
        operationId,
        trackingCode: tracking,
        askCollection,
        verifiedActor,
        ecotrackClient: ecotrack,
        supabase,
      });

      return NextResponse.json(reconResult, { status: reconResult.success ? 200 : 422 });
    }

    // Manual Order Validation (Redex Requirement B / Remediation A.2 Integrity Fix)
    // Explicit, authorized manual operation to lock parcel into Redex pickup/collection flow
    if (action === 'validate_order' || action === 'valid_order') {
      const tracking = (
        searchParams.get('tracking') ||
        body.tracking ||
        body.trackingCode ||
        body.trackingNumber ||
        ''
      ).trim();
      const orderId = body.orderId || body.orderNumber || body.id;

      // 1. Strict askCollection validation (must be exactly 0 or 1)
      const rawAsk = body.askCollection ?? body.ask_collection;
      if (rawAsk !== 0 && rawAsk !== 1 && rawAsk !== '0' && rawAsk !== '1') {
        return NextResponse.json({
          success: false,
          error: 'قيمة askCollection غير صالحة. يجب أن تكون 0 (إيداع في مركز التوزيع) أو 1 (طلب استلام من المتجر عبر سائق).',
        }, { status: 400 });
      }
      const askCollection = Number(rawAsk);

      // Approved Redex Status Mapping (Finding 2)
      const carrierStatus = askCollection === 1 ? 'en_ramassage' : 'vers_station';
      const carrierStatusAr = askCollection === 1 ? 'قيد الاستلام من المتجر' : 'في الطريق إلى مركز التوزيع';

      // 2. Derive trusted audit actor exclusively from verified admin session claims (Findings 1 & 7, Remediation A.3)
      if (!adminSession?.sid) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Session identifier missing' }, { status: 401 });
      }
      if (adminSession.role !== 'admin') {
        return NextResponse.json({ success: false, error: 'Forbidden: Admin role required' }, { status: 403 });
      }
      const verifiedActor = `admin:${adminSession.sid.slice(0, 8)}`;

      let resolvedTracking = tracking;
      let resolvedOrderId = orderId ? String(orderId).trim() : '';
      const supabase = getSupabaseServerClient() as any;

      // 3. Resolve tracking code if only orderId was provided
      if (!resolvedTracking && resolvedOrderId) {
        try {
          const { data: orderRow } = await supabase
            .from('orders')
            .select('tracking_code, redex_tracking_code, order_id')
            .or(buildOrderIdFilter(resolvedOrderId))
            .maybeSingle();

          if (orderRow) {
            resolvedTracking = orderRow.tracking_code || orderRow.redex_tracking_code || '';
            if (orderRow.order_id) resolvedOrderId = orderRow.order_id;
          }
        } catch (findErr) {
          console.warn('[API /api/delivery] Order resolution for validation warning:', findErr);
        }

        if (!resolvedTracking) {
          const allStored = getStoredFallbackOrders();
          const fbMatch = allStored.find((f: any) => f.id === resolvedOrderId || f.orderNumber === resolvedOrderId);
          if (fbMatch) {
            resolvedTracking = (fbMatch as any).tracking_code || (fbMatch as any).redex_tracking_code || '';
            resolvedOrderId = (fbMatch as any).orderNumber || fbMatch.id || resolvedOrderId;
          }
        }
      }

      // If only tracking was provided (e.g. barcode scan), resolve the parent order_id (DEF-07 Fix)
      if (resolvedTracking && !resolvedOrderId) {
        try {
          const { data: orderRow } = await supabase
            .from('orders')
            .select('order_id, id')
            .or(`tracking_code.eq.${resolvedTracking},redex_tracking_code.eq.${resolvedTracking}`)
            .maybeSingle();

          if (orderRow) {
            resolvedOrderId = orderRow.order_id || orderRow.id || '';
          }
        } catch (findErr) {
          console.warn('[API /api/delivery] Order resolution by tracking warning:', findErr);
        }

        if (!resolvedOrderId) {
          const allStored = getStoredFallbackOrders();
          const fbMatch = allStored.find((f: any) =>
            f.tracking_code === resolvedTracking ||
            f.redex_tracking_code === resolvedTracking
          );
          if (fbMatch) {
            resolvedOrderId = fbMatch.orderNumber || fbMatch.id || '';
          }
        }
      }

      if (!resolvedTracking) {
        return NextResponse.json({
          success: false,
          error: 'رقم التتبع (tracking) أو معرّف الطلبية (orderId) مطلوب لتأكيد الإرسالية',
        }, { status: 400 });
      }

      // 4. Pre-Validation State Inspection & Missing Delivery Record Check
      let existingDelivery: any = null;
      try {
        const { data: dRow, error: findErr } = await supabase
          .from('deliveries')
          .select('*')
          .eq('tracking_number', resolvedTracking)
          .maybeSingle();
        if (!findErr && dRow && (dRow.tracking_number || dRow.id)) {
          existingDelivery = dRow;
        }
      } catch (dErr) {
        console.warn('[API /api/delivery] Deliveries lookup exception:', dErr);
      }

      const allStoredFallback = getStoredFallbackOrders();
      const existingFb = allStoredFallback.find(
        (f: any) => f.tracking_code === resolvedTracking || f.redex_tracking_code === resolvedTracking || (Boolean(orderId) && (f.id === orderId || f.orderNumber === orderId))
      );

      // Explicitly reject missing delivery record (Do not treat missing records as already validated)
      if (!existingDelivery && !existingFb) {
        return NextResponse.json({
          success: false,
          error: `سجل الشحنة غير موجود في النظام برقم التتبع (${resolvedTracking}). يجب إنشاء الإرسالية أولاً قبل تأكيدها.`,
        }, { status: 404 });
      }

      const currentStatus = existingDelivery?.carrier_status || (existingFb as any)?.carrier_status || 'prete_a_expedier';
      const existingLifecycle = existingDelivery?.raw_response?.validation_lifecycle || (existingFb as any)?.validation_lifecycle;
      const carrierAlreadyAccepted = Boolean(existingDelivery?.raw_response?.carrier_accepted || (existingFb as any)?.carrier_accepted);

      // 5. Idempotent Return for Already Synchronized Parcels
      if (
        (existingLifecycle === 'SYNCHRONIZED' || currentStatus === 'en_ramassage' || currentStatus === 'vers_station') &&
        (existingDelivery?.raw_response?.validated === true || (existingFb as any)?.validated === true)
      ) {
        return NextResponse.json({
          success: true,
          alreadyValidated: true,
          trackingCode: resolvedTracking,
          status: currentStatus,
          carrierStatus: currentStatus,
          carrierStatusAr: existingDelivery?.carrier_status_ar || (existingFb as any)?.carrier_status_ar || carrierStatusAr,
          askCollection,
          validatedBy: existingDelivery?.raw_response?.validated_by || (existingFb as any)?.validated_by || verifiedActor,
          supabaseSynced: true,
          message: 'هذا الطرد تم تأكيده ومزامنته مسبقاً لدى شركة التوصيل.',
        }, { status: 200 });
      }

      // 6. State Progression Gate (Never regress downstream logistical states)
      const nonRegressibleStatuses = [
        'en_station', 'vers_hub', 'en_hub', 'vers_wilaya', 'en_preparation',
        'dispatched_to_driver', 'en_livraison', 'livred', 'livre', 'livre_non_encaisse',
        'encaisse_non_paye', 'encaissed', 'payed', 'paye_et_archive', 'return_asked',
        'return_in_transit', 'retour_chez_livreur', 'retour_transit_entrepot',
        'retour_en_traitement', 'retour_recu', 'return_received', 'retour_archive', 'annule'
      ];
      if (nonRegressibleStatuses.includes(currentStatus.toLowerCase())) {
        return NextResponse.json({
          success: false,
          error: `لا يمكن تأكيد الشحنة: حالة الطرد الحالية (${currentStatus}) متقدمة في مسار التوصيل ولا يمكن إرجاعها إلى مرحلة الاستلام.`,
          trackingCode: resolvedTracking,
          currentStatus,
          alreadyProgressed: true,
        }, { status: 409 });
      }

      // 7. Check In-Progress Leases & Memory Locks (Remediation A.3 - Requirements 1, 2 & 3)
      const LEASE_DURATION_MS = 30000; // 30 seconds
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const memoryLock = memoryLockMap.get(resolvedTracking);
      const isMemoryLockActive = Boolean(memoryLock && memoryLock.expiresAt > nowMs);

      const existingLeaseExpiresAt = existingDelivery?.raw_response?.lease_expires_at || (existingFb as any)?.lease_expires_at;
      const isDbLeaseActive = (currentStatus === 'validation_in_progress' || existingLifecycle === 'VALIDATION_IN_PROGRESS') &&
        Boolean(existingLeaseExpiresAt && new Date(existingLeaseExpiresAt).getTime() > nowMs);

      if (isMemoryLockActive || isDbLeaseActive) {
        // Wait briefly for in-flight validation to complete if active
        const startWait = Date.now();
        while (Date.now() - startWait < 3000) {
          await new Promise((r) => setTimeout(r, 60));
          const latestLock = memoryLockMap.get(resolvedTracking);
          if (!latestLock || latestLock.expiresAt <= Date.now()) {
            break;
          }
        }

        // Check if finished by concurrent process
        const freshStored = getStoredFallbackOrders();
        const freshFb = freshStored.find((f: any) => (f as any).tracking_code === resolvedTracking || (f as any).redex_tracking_code === resolvedTracking);
        const freshStatus = (freshFb as any)?.carrier_status;
        if (freshFb && (freshFb as any).validated && (freshStatus === 'en_ramassage' || freshStatus === 'vers_station')) {
          return NextResponse.json({
            success: true,
            alreadyValidated: true,
            concurrentInterferenceHandled: true,
            trackingCode: resolvedTracking,
            status: freshStatus,
            carrierStatus: freshStatus,
            carrierStatusAr: (freshFb as any).carrier_status_ar || carrierStatusAr,
            message: 'تم تأكيد الشحنة بنجاح بواسطة العملية المتزامنة.',
          }, { status: 200 });
        }

        return NextResponse.json({
          success: false,
          error: 'عملية تأكيد الإرسالية قيد التنفيذ حالياً بواسطة مشغّل آخر. يرجى الانتظار.',
          inProgress: true,
          trackingCode: resolvedTracking,
        }, { status: 409 });
      }

      // Immediately acquire in-process memory lock synchronously to close the event loop window
      const initialLeaseId = crypto.randomUUID();
      memoryLockMap.set(resolvedTracking, {
        leaseId: initialLeaseId,
        expiresAt: nowMs + LEASE_DURATION_MS,
        actor: verifiedActor,
      });

      // Check if lease expired while stuck in VALIDATION_IN_PROGRESS (Requirement 3: Never blindly re-call Redex!)
      const isStuckLeaseExpired = (currentStatus === 'validation_in_progress' || existingLifecycle === 'VALIDATION_IN_PROGRESS') &&
        (!existingLeaseExpiresAt || new Date(existingLeaseExpiresAt).getTime() <= nowMs);

      let carrierConfirmedAccepted = carrierAlreadyAccepted;

      // 7.1 Pre-carrier durable reservation in dedicated delivery_validation_reconciliations table (Stage 2 Stabilization / DEF-07 Fix)
      const parentOrderId = String(resolvedOrderId || existingDelivery?.order_id || (existingFb as any)?.orderNumber || (existingFb as any)?.id || '');
      const operationId = generateOperationId(resolvedTracking, askCollection, body.operationId || body.operation_id);

      let preReservation: any = null;
      if (parentOrderId && parentOrderId !== resolvedTracking) {
        try {
          preReservation = await acquirePreCarrierReservation(supabase, {
            operationId,
            trackingCode: resolvedTracking,
            orderId: parentOrderId,
            askCollection,
            targetCarrierStatus: carrierStatus as 'en_ramassage' | 'vers_station',
            verifiedActor,
          });
        } catch (presErr) {
          console.warn('[API /api/delivery] Pre-carrier reservation warning:', presErr);
        }
      }

      if (preReservation?.alreadyReconciled) {
        memoryLockMap.delete(resolvedTracking);
        return NextResponse.json({
          success: true,
          alreadyValidated: true,
          operationId,
          trackingCode: resolvedTracking,
          status: carrierStatus,
          carrierStatus,
          carrierStatusAr: existingDelivery?.carrier_status_ar || (existingFb as any)?.carrier_status_ar || carrierStatusAr,
          askCollection,
          validatedBy: existingDelivery?.raw_response?.validated_by || (existingFb as any)?.validated_by || verifiedActor,
          supabaseSynced: true,
          reconciliationState: 'RECONCILED',
          message: 'هذا الطرد تم تأكيده ومزامنته مسبقاً لدى شركة التوصيل (Durable Idempotent Recovery).',
        }, { status: 200 });
      }

      if (preReservation?.conflict) {
        memoryLockMap.delete(resolvedTracking);
        return NextResponse.json({
          success: false,
          error: preReservation.error || 'عملية تأكيد الإرسالية قيد التنفيذ حالياً بواسطة مشغّل آخر. يرجى الانتظار.',
          inProgress: true,
          operationId,
          trackingCode: resolvedTracking,
        }, { status: 409 });
      }

      if (preReservation?.dbError) {
        console.warn('[API /api/delivery] Pre-carrier reservation DB warning:', preReservation.error);
      }

      if (preReservation?.alreadyAccepted) {
        carrierConfirmedAccepted = true;
      }

      if (isStuckLeaseExpired && !carrierConfirmedAccepted) {
        // Query courier to inspect actual external state before deciding whether to call validOrder
        try {
          const ecotrackInspect = getEcoTrackClient({ baseUrl: body.baseUrl, token: body.token });
          const trackInfo = await ecotrackInspect.getTrackingInfo(resolvedTracking);
          if (trackInfo && trackInfo.success && Array.isArray(trackInfo.activity) && trackInfo.activity.length > 0) {
            const hasProgressedAtCarrier = trackInfo.activity.some((act: any) => {
              const s = String(act.status || '').toLowerCase();
              return s === 'en_ramassage' || s === 'vers_station' || nonRegressibleStatuses.includes(s);
            });
            if (hasProgressedAtCarrier) {
              carrierConfirmedAccepted = true;
            }
          }
        } catch (tErr) {
          console.warn('[API /api/delivery] Carrier status inspection warning during lease recovery:', tErr);
        }
      }

      // 8. Atomic Database Reservation BEFORE external carrier call (Requirements 1 & 2)
      const leaseId = initialLeaseId;
      const leaseExpiresAt = new Date(nowMs + LEASE_DURATION_MS).toISOString();

      let leaseAcquired = false;
      let leaseError: any = null;

      try {
        const statusCondition = isStuckLeaseExpired
          ? `carrier_status.eq.prete_a_expedier,carrier_status.eq.validation_in_progress`
          : `carrier_status.eq.prete_a_expedier`;

        const { data: lRows, error: lErr } = await supabase
          .from('deliveries')
          .update({
            carrier_status: 'validation_in_progress',
            carrier_status_ar: 'جارٍ التأكيد لدى شركة التوصيل...',
            raw_response: {
              ...(existingDelivery?.raw_response || {}),
              validation_lifecycle: 'VALIDATION_IN_PROGRESS',
              lease_id: leaseId,
              leased_at: nowIso,
              lease_expires_at: leaseExpiresAt,
              lease_holder: verifiedActor,
              carrier_accepted: carrierConfirmedAccepted,
            },
            updated_at: nowIso,
          })
          .eq('tracking_number', resolvedTracking)
          .or(statusCondition)
          .select('id, tracking_number, carrier_status');

        leaseError = lErr;
        leaseAcquired = !lErr && Array.isArray(lRows) && lRows.length > 0;
      } catch (lEx: any) {
        leaseError = lEx;
      }

      // Mirror atomic lease in fallback store
      let fbLeased = false;
      for (const fb of allStoredFallback) {
        if ((fb as any).tracking_code === resolvedTracking || (fb as any).redex_tracking_code === resolvedTracking) {
          const fbStatus = (fb as any).carrier_status;
          const fbLeaseExp = (fb as any).lease_expires_at;
          const fbExpired = fbStatus === 'validation_in_progress' && fbLeaseExp && new Date(fbLeaseExp).getTime() <= nowMs;
          if (
            fbStatus === 'prete_a_expedier' ||
            fbExpired ||
            (fb as any).validation_lifecycle === 'RECONCILIATION_REQUIRED'
          ) {
            (fb as any).carrier_status = 'validation_in_progress';
            (fb as any).carrier_status_ar = 'جارٍ التأكيد لدى شركة التوصيل...';
            (fb as any).validation_lifecycle = 'VALIDATION_IN_PROGRESS';
            (fb as any).lease_id = leaseId;
            (fb as any).leased_at = nowIso;
            (fb as any).lease_expires_at = leaseExpiresAt;
            (fb as any).lease_holder = verifiedActor;
            fbLeased = true;
          }
        }
      }
      if (fbLeased) {
        saveAllFallbackOrders(allStoredFallback);
        if (!existingDelivery) {
          leaseAcquired = true;
        }
      }

      // If lease was not acquired, another concurrent request beat us to it!
      if (!leaseAcquired && !leaseError) {
        memoryLockMap.delete(resolvedTracking);
        return NextResponse.json({
          success: false,
          error: 'عملية تأكيد الإرسالية قيد التنفيذ حالياً بواسطة مشغّل آخر أو تم تغيير حالتها.',
          inProgress: true,
          trackingCode: resolvedTracking,
        }, { status: 409 });
      }

      // 9. External Carrier Validation (Redex / EcoTrack)
      // Only executed if NOT already confirmed accepted by the carrier
      let validResult: any = { success: true, message: 'Commande déjà acceptée par le transporteur (reconciliation retry)' };
      if (!carrierConfirmedAccepted) {
        const ecotrack = getEcoTrackClient({
          baseUrl: body.baseUrl,
          token: body.token,
        });

        validResult = await ecotrack.validOrder(resolvedTracking, askCollection);

        if (!validResult.success) {
          memoryLockMap.delete(resolvedTracking);
          // Carrier rejected the validation: safely release lease / revert to prete_a_expedier
          try {
            await supabase
              .from('deliveries')
              .update({
                carrier_status: 'prete_a_expedier',
                carrier_status_ar: 'جاهز للإرسال',
                raw_response: {
                  ...(existingDelivery?.raw_response || {}),
                  validation_lifecycle: 'FAILED',
                  last_error: validResult.error || 'Carrier validation rejected',
                  lease_expires_at: nowIso,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('tracking_number', resolvedTracking)
              .eq('carrier_status', 'validation_in_progress')
              .select('id');
          } catch (_) {}

          for (const fb of allStoredFallback) {
            if ((fb as any).tracking_code === resolvedTracking || (fb as any).redex_tracking_code === resolvedTracking) {
              (fb as any).carrier_status = 'prete_a_expedier';
              (fb as any).carrier_status_ar = 'جاهز للإرسال';
              (fb as any).validation_lifecycle = 'FAILED';
              (fb as any).last_error = validResult.error;
              (fb as any).lease_expires_at = null;
            }
          }
          saveAllFallbackOrders(allStoredFallback);

          return NextResponse.json({
            success: false,
            error: validResult.error || 'فشل تأكيد إرسالية الطرد لدى Redex Express',
            trackingCode: resolvedTracking,
            raw: validResult,
          }, { status: 422 });
        }
      }

      // 10. Commit Final Synchronized State to Supabase
      let delivUpdated = false;
      let delivError: any = null;
      let updatedDeliveryRows: any[] = [];

      try {
        const { data: uRows, error: uErr } = await supabase
          .from('deliveries')
          .update({
            status: 'IN_TRANSIT',
            carrier_status: carrierStatus,
            carrier_status_ar: carrierStatusAr,
            raw_response: {
              ...(existingDelivery?.raw_response || {}),
              validated: true,
              validated_at: nowIso,
              validated_by: verifiedActor,
              ask_collection: askCollection,
              carrier_accepted: true,
              validation_lifecycle: 'SYNCHRONIZED',
              validation_message: validResult.message,
              lease_expires_at: null,
              lease_id: null,
            },
            updated_at: nowIso,
          })
          .eq('tracking_number', resolvedTracking)
          .or(`carrier_status.eq.validation_in_progress,carrier_status.eq.prete_a_expedier`)
          .select('id, tracking_number, carrier_status');

        delivError = uErr;
        updatedDeliveryRows = uRows || [];
        delivUpdated = !uErr && updatedDeliveryRows.length > 0;
      } catch (dbEx: any) {
        delivError = dbEx;
      }

      // Handle Supabase Persistence Failure (Carrier Succeeded, Database Failed)
      // When Supabase fails, DO NOT report success! Record RECONCILIATION_REQUIRED in durable and fallback stores.
      if (delivError || (!delivUpdated && !existingFb)) {
        memoryLockMap.delete(resolvedTracking);
        console.error('[API /api/delivery] Supabase persistence error during validation:', delivError);

        // 1. Record failure in dedicated delivery_validation_reconciliations table
        if (parentOrderId && parentOrderId !== resolvedTracking) {
          try {
            await recordCarrierAcceptedFailure(supabase, {
              operationId,
              trackingCode: resolvedTracking,
              orderId: parentOrderId,
              askCollection,
              targetCarrierStatus: carrierStatus as 'en_ramassage' | 'vers_station',
              verifiedActor,
              dbError: delivError?.message || 'Supabase write failed',
            });
          } catch (_) {}
        }

        // 2. Sign tamper-evident client recovery receipt for total database outage resilience
        const recoveryReceipt = createRecoveryReceipt({
          operationId,
          trackingCode: resolvedTracking,
          orderId: parentOrderId,
          askCollection,
          carrierAccepted: true,
          carrierStatus,
          actor: verifiedActor,
          issuedAt: nowMs,
          expiresAt: nowMs + 7 * 24 * 3600 * 1000,
        }, process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'orva-recovery-secret-fallback-32c');

        for (const fb of allStoredFallback) {
          if ((fb as any).tracking_code === resolvedTracking || (fb as any).redex_tracking_code === resolvedTracking) {
            (fb as any).carrier_status = carrierStatus;
            (fb as any).carrier_status_ar = carrierStatusAr;
            (fb as any).carrier_accepted = true;
            (fb as any).validation_lifecycle = 'RECONCILIATION_REQUIRED';
            (fb as any).last_error = delivError?.message || 'Supabase write failed';
            (fb as any).validated_by = verifiedActor;
            (fb as any).validated_at = nowIso;
            (fb as any).lease_expires_at = null;
            (fb as any).operation_id = operationId;
          }
        }
        saveAllFallbackOrders(allStoredFallback);

        return NextResponse.json({
          success: false,
          error: 'تم تأكيد الشحنة لدى Redex Express بنجاح، ولكن فشلت المزامنة مع قاعدة البيانات المحلية. الشحنة موضوعة في حالة RECONCILIATION_REQUIRED للمزامنة لاحقاً.',
          operationId,
          trackingCode: resolvedTracking,
          carrierAccepted: true,
          supabaseSynced: false,
          reconciliationRequired: true,
          retryable: true,
          recoveryReceipt,
          details: delivError?.message,
        }, { status: 502 });
      }

      // Record successful reconciliation state in delivery_validation_reconciliations
      try {
        await recordReconciliationSuccess(supabase, {
          operationId,
          carrierStatus,
        });
      } catch (_) {}

      // 11. Update Orders Remarks with Deduplication Protection
      let orderRemarksSynced = false;
      try {
        const { data: existingOrder, error: oFetchErr } = await supabase
          .from('orders')
          .select('id, remarks')
          .or(`tracking_code.eq.${resolvedTracking},redex_tracking_code.eq.${resolvedTracking}`)
          .maybeSingle();

        if (existingOrder && !oFetchErr) {
          const prevRemarks = Array.isArray(existingOrder.remarks) ? existingOrder.remarks : [];
          const alreadyLogged = prevRemarks.some((r: any) =>
            r?.event === 'PARCEL_VALIDATED_MANUALLY' && r?.tracking === resolvedTracking
          );
          const statusPatch = carrierStatus === 'vers_station' ? { status: 'REDEX_STATION' } : {};

          if (!alreadyLogged) {
            const validationEvent = {
              event: 'PARCEL_VALIDATED_MANUALLY',
              tracking: resolvedTracking,
              ask_collection: askCollection,
              carrier_status: carrierStatus,
              carrier_status_ar: carrierStatusAr,
              actor: verifiedActor,
              timestamp_utc: nowIso,
              validation_message: validResult.message,
            };
            const { data: rRows, error: rErr } = await supabase
              .from('orders')
              .update({
                ...statusPatch,
                remarks: [...prevRemarks, validationEvent],
                updated_at: nowIso,
              })
              .eq('id', existingOrder.id)
              .select('id');

            orderRemarksSynced = !rErr && Array.isArray(rRows) && rRows.length > 0;
          } else {
            if (statusPatch.status) {
              await supabase
                .from('orders')
                .update({ ...statusPatch, updated_at: nowIso })
                .eq('id', existingOrder.id);
            }
            orderRemarksSynced = true; // Already recorded, no duplicate appended
          }
        }
      } catch (remarkEx) {
        console.warn('[API /api/delivery] Remarks update warning:', remarkEx);
      }

      // 12. Mirror State to Fallback Store & Release In-Memory Lock
      memoryLockMap.delete(resolvedTracking);
      for (const fb of allStoredFallback) {
        if ((fb as any).tracking_code === resolvedTracking || (fb as any).redex_tracking_code === resolvedTracking) {
          (fb as any).carrier_status = carrierStatus;
          (fb as any).carrier_status_ar = carrierStatusAr;
          (fb as any).validated = true;
          (fb as any).carrier_accepted = true;
          (fb as any).validation_lifecycle = 'SYNCHRONIZED';
          (fb as any).validated_at = nowIso;
          (fb as any).validated_by = verifiedActor;
          (fb as any).lease_expires_at = null;
          (fb as any).lease_id = null;
        }
      }
      saveAllFallbackOrders(allStoredFallback);

      return NextResponse.json({
        success: true,
        trackingCode: resolvedTracking,
        status: carrierStatus,
        carrierStatus,
        carrierStatusAr,
        askCollection,
        validatedBy: verifiedActor,
        supabaseSynced: true,
        validationLifecycle: 'SYNCHRONIZED',
        reconciled: Boolean(carrierConfirmedAccepted),
        validation: validResult,
        message: `تم تأكيد إرسالية الطرد بنجاح لدى Redex Express (${carrierStatusAr}). رقم التتبع: ${resolvedTracking}`,
      });
    }

    // Live Push to Redex (EcoTrack API) — Requirement B: Initial parcel creation (Prêt à expédier)
    if (action === 'create' || action === 'push_order') {
      const orderId = body.orderId || body.orderNumber || body.id;
      if (!orderId) {
        return NextResponse.json({ success: false, error: 'معرّف الطلبية (orderId) مطلوب للإرسال' }, { status: 400 });
      }

      let clientName = body.fullName || body.customerName || body.client || '';
      let clientPhone = body.phone || body.customerPhone || '';
      let clientPhone2 = body.phone2 || body.customerPhone2 || '';
      let wilayaName = body.wilaya || body.wilayaName || '';
      let wilayaCode = body.wilayaCode;
      let rawCommune = body.commune || body.communeName || '';
      let address = body.address || body.deliveryAddress || rawCommune || 'Centre Ville';
      let deliveryType = body.deliveryType || 'home';
      let stopDeskFlag = deliveryType === 'desk' || deliveryType === 'STOP_DESK' || String(deliveryType).includes('مكتب') ? 1 : 0;
      let stopDeskCode = body.stopDeskId || body.code_postal || '';
      let codAmount = body.codAmountDzd ?? body.priceNum ?? body.price ?? 0;
      let productName = body.productName || body.items || 'Pack ORVA';
      let notes = body.notes || body.remarque || '';
      let reference = String(orderId);

      const supabase = getSupabaseServerClient() as any;

      // 1. Fetch order from Supabase for enrichment and duplicate protection
      let existingTracking: string | null = null;
      try {
        const { data: existingRow } = await supabase
          .from('orders')
          .select('*')
          .or(buildOrderIdFilter(orderId))
          .maybeSingle();

        if (existingRow) {
          existingTracking = existingRow.redex_tracking_code || existingRow.tracking_code || null;
          clientName = clientName || existingRow.full_name || existingRow.customer_name || 'Client';
          clientPhone = clientPhone || existingRow.phone || existingRow.customer_phone || '';
          clientPhone2 = clientPhone2 || existingRow.phone2 || '';
          wilayaName = wilayaName || existingRow.wilaya || existingRow.wilaya_name || '';
          wilayaCode = wilayaCode || existingRow.wilaya_code;
          rawCommune = rawCommune || existingRow.commune || existingRow.commune_name || '';
          address = address || existingRow.address || rawCommune || 'Centre Ville';
          if (existingRow.delivery_type) {
            stopDeskFlag = existingRow.delivery_type.includes('مكتب') || existingRow.delivery_type === 'STOP_DESK' ? 1 : 0;
          }
          if (!codAmount) {
            codAmount = Number(
              existingRow.grand_total
                ? String(existingRow.grand_total).replace(/[^\d]/g, '')
                : existingRow.total_price || existingRow.total || 5450
            );
          }
          productName = productName || existingRow.product_name || 'Pack ORVA';
        }
      } catch (fetchErr) {
        console.warn('[API /api/delivery] Could not fetch existing order from Supabase:', fetchErr);
      }

      // 1.1 Check fallback store for tracking if not found in Supabase
      if (!existingTracking) {
        const allStored = getStoredFallbackOrders();
        const fbMatch = allStored.find((f) => f.id === orderId || f.orderNumber === orderId);
        if (fbMatch && ((fbMatch as any).redex_tracking_code || (fbMatch as any).tracking_code)) {
          existingTracking = (fbMatch as any).redex_tracking_code || (fbMatch as any).tracking_code;
        }
      }

      // 1.2 Duplicate Dispatch Prevention Guard
      if (existingTracking && !body.forceRecreate) {
        return NextResponse.json({
          success: false,
          error: `هذا الطلب تم إرساله مسبقاً إلى Redex برقم تتبع نشط (${existingTracking}). يرجى استخدام تحويل الطلبية أو طباعة الوصل مباشرة.`,
          trackingCode: existingTracking,
          trackingNumber: existingTracking,
          alreadyDispatched: true,
          labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(existingTracking)}`,
        }, { status: 409 });
      }

      // 2. Validate essential inputs
      const finalWilayaCode = extractWilayaCode(wilayaCode || wilayaName);
      if (!finalWilayaCode || finalWilayaCode < 1 || finalWilayaCode > 58) {
        return NextResponse.json({
          success: false,
          error: `رمز ولاية غير صالح (${wilayaCode || wilayaName}). يجب اختيار ولاية جزائرية بين 1 و 58.`,
        }, { status: 400 });
      }

      const cleanPhone = cleanAlgerianPhone(clientPhone);
      if (!cleanPhone || cleanPhone.length < 9) {
        return NextResponse.json({
          success: false,
          error: `رقم هاتف العميل غير صالح (${clientPhone}). يجب إدخال 10 أرقام صحيحة.`,
        }, { status: 400 });
      }

      if (!Number(codAmount) || Number(codAmount) <= 0) {
        return NextResponse.json({
          success: false,
          error: 'مبلغ الدفع عند الاستلام (COD) يجب أن يكون أكبر من 0 د.ج.',
        }, { status: 400 });
      }

      const ecotrack = getEcoTrackClient({
        baseUrl: body.baseUrl,
        token: body.token,
      });

      // 3. Intelligent Commune Resolver
      const resolved = await ecotrack.resolveCommuneForWilaya(finalWilayaCode, rawCommune);
      const finalCommune = resolved.resolvedCommune;
      const finalStopDeskCode = stopDeskCode || resolved.stopDeskStationCode || undefined;

      const finalAddress = rawCommune && rawCommune !== finalCommune
        ? `${rawCommune} — ${address}`
        : address;

      const finalNotes = rawCommune && rawCommune !== finalCommune
        ? (notes ? `${notes} (بلدية: ${rawCommune})` : `بلدية: ${rawCommune}`)
        : notes;

      // 4. Create parcel in Redex
      const createResult = await ecotrack.createOrder({
        reference,
        nom_client: clientName,
        telephone: cleanPhone,
        telephone_2: clientPhone2 ? cleanAlgerianPhone(clientPhone2) : undefined,
        adresse: finalAddress,
        commune: finalCommune,
        code_wilaya: finalWilayaCode,
        montant: Number(codAmount),
        type: 1, // Livraison
        stop_desk: stopDeskFlag,
        code_postal: finalStopDeskCode,
        produit: productName,
        remarque: finalNotes,
        boutique: 'ORVA Store',
      });

      if (!createResult.success || !createResult.tracking) {
        return NextResponse.json({
          success: false,
          error: createResult.error || 'فشل إرسال الطلب إلى شركة التوصيل Redex',
          raw: createResult.raw,
        }, { status: 422 });
      }

      const trackingCode = createResult.tracking;

      // 5. Redex Requirement B (Defect APP-01 Remediation):
      // Initial parcel creation calls createOrder() only and preserves the initial "Prêt à expédier" state.
      // Auto-validation (validOrder) is strictly prohibited upon creation.

      // 6. Record shipment in deliveries table
      let delivUpsertSuccess = false;
      try {
        const { error: delivErr } = await supabase
          .from('deliveries')
          .upsert({
            order_id: String(orderId),
            provider: 'REDEX',
            tracking_number: trackingCode,
            status: 'CREATED',
            carrier_status: 'prete_a_expedier',
            carrier_status_ar: 'جاهز للإرسال',
            raw_response: {
              redex_response: createResult.raw,
              validated: false,
              pushed_at: new Date().toISOString(),
              commune_resolved: finalCommune,
              original_commune: rawCommune,
            },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tracking_number' });

        delivUpsertSuccess = !delivErr;
        if (delivErr) {
          console.warn('[API /api/delivery] Deliveries table record error:', delivErr);
        }
      } catch (delivErr) {
        console.warn('[API /api/delivery] Deliveries table record warning:', delivErr);
      }

      // 7. Update Supabase orders table: Mark in_redex and tracking codes, transition to PUSHED (ORVA: "Pushed to Redex")
      let orderUpdateSuccess = false;
      try {
        const { data: updatedOrderRows, error: orderUpdateErr } = await supabase
          .from('orders')
          .update({
            in_redex: true,
            redex_tracking_code: trackingCode,
            tracking_code: trackingCode,
            courier: 'REDEX',
            status: 'PUSHED',
            updated_at: new Date().toISOString(),
          })
          .or(buildOrderIdFilter(orderId))
          .select('id, status');

        orderUpdateSuccess = !orderUpdateErr && Array.isArray(updatedOrderRows) && updatedOrderRows.length > 0;
        if (orderUpdateErr) {
          console.warn('[API /api/delivery] Supabase dispatch update warning:', orderUpdateErr);
        }
      } catch (dbErr) {
        console.warn('[API /api/delivery] Supabase dispatch update exception:', dbErr);
      }

      const supabaseUpdated = delivUpsertSuccess && orderUpdateSuccess;

      // 8. Update Fallback store
      const allStored = getStoredFallbackOrders();
      let matchedInFallback = false;
      for (const fb of allStored) {
        if (fb.id === orderId || fb.orderNumber === orderId) {
          fb.status = 'PUSHED' as any;
          (fb as any).in_redex = true;
          (fb as any).redex_tracking_code = trackingCode;
          (fb as any).tracking_code = trackingCode;
          (fb as any).carrier_status = 'prete_a_expedier';
          (fb as any).carrier_status_ar = 'جاهز للإرسال';
          matchedInFallback = true;
        }
      }
      if (!matchedInFallback) {
        allStored.push({
          id: String(orderId),
          orderNumber: String(orderId),
          customerName: body.fullName || 'Client',
          customerPhone: cleanPhone,
          customerPhone2: clientPhone2 ? cleanAlgerianPhone(clientPhone2) : null,
          wilayaCode: finalWilayaCode,
          wilayaName: body.wilaya || '',
          communeName: finalCommune,
          deliveryType: stopDeskFlag === 1 ? 'STOP_DESK' : 'DOMICILE',
          deliveryAddress: finalAddress,
          packId: 'custom',
          productName,
          productPrice: Number(codAmount),
          shippingFee: 0,
          totalPayable: Number(codAmount),
          status: 'PUSHED',
          originHub: 'BISKRA_07',
          createdAt: new Date().toISOString(),
          remarks: [],
          in_redex: true,
          redex_tracking_code: trackingCode,
          tracking_code: trackingCode,
          carrier_status: 'prete_a_expedier',
          carrier_status_ar: 'جاهز للإرسال',
        } as any);
      }
      saveAllFallbackOrders(allStored);

      return NextResponse.json({
        success: true,
        trackingCode,
        trackingNumber: trackingCode,
        status: 'prete_a_expedier',
        carrierStatus: 'prete_a_expedier',
        carrierStatusAr: 'جاهز للإرسال',
        orderStatus: 'PUSHED',
        courierId: 'redex',
        courierName: 'Redex Express (EcoTrack)',
        labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`,
        validated: false,
        supabaseSynced: supabaseUpdated,
        message: `تم إنشاء إرسالية الطلبية #${orderId} بنجاح لدى Redex Express (جاهز للإرسال). رقم التتبع: ${trackingCode}`,
      });
    }

    // Hard delete legacy support
    if (action === 'delete' || action === 'hard_delete') {
      const orderId = body.orderId || body.orderNumber || body.id || body.tracking;
      const result = await executeOrderHardDeletion(orderId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error occurred' },
      { status: 500 }
    );
  }
}

// ── DELETE HANDLER ──────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  if (!await verifyAdminSession(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Admin session required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const orderId = searchParams.get('orderId') || searchParams.get('id') || searchParams.get('tracking') || body.orderId || body.id || body.tracking;
    const isHardDelete = searchParams.get('hard') === 'true' || body.hard === true;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'معرّف الطلبية (orderId) مطلوب' }, { status: 400 });
    }

    if (isHardDelete) {
      const result = await executeOrderHardDeletion(orderId);
      return NextResponse.json(result);
    }

    // Default DELETE is cancellation (preserves order history)
    const result = await executeOrderCancellation(orderId, body.reason, body.actor);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Delete error occurred' }, { status: 500 });
  }
}
