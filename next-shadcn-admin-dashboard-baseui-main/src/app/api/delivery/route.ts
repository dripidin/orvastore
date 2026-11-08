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

export const dynamic = 'force-dynamic';

function formatWilayaLabel(code?: number, name?: string): string {
  if (!name) return '—';
  if (code && !name.includes(String(code))) {
    return `${code.toString().padStart(2, '0')} - ${name}`;
  }
  return name;
}

/**
 * Common order deletion helper:
 * 1. Cancels parcel on Redex (if it has a tracking code)
 * 2. Removes order from Supabase
 * 3. Removes order from persistent fallback store
 */
async function executeOrderDeletion(orderIdOrTracking: string) {
  const target = String(orderIdOrTracking || '').trim();
  if (!target) return { success: false, error: 'Order ID or Tracking code is required' };

  let trackingToDelete: string | null = null;
  const supabase = getSupabaseServerClient() as any;

  // 1. Find tracking if target is an order ID
  try {
    const { data: orderRow } = await supabase
      .from('orders')
      .select('redex_tracking_code, tracking_number')
      .or(`id.eq.${target},order_id.eq.${target},order_number.eq.${target}`)
      .maybeSingle();

    if (orderRow) {
      trackingToDelete = orderRow.redex_tracking_code || orderRow.tracking_number;
    }
  } catch (findErr) {
    console.warn('[API /api/delivery] Deletion search warning:', findErr);
  }

  if (!trackingToDelete && target.startsWith('EC')) {
    trackingToDelete = target;
  }

  // 2. Cancel/Delete on Redex if tracking is present
  if (trackingToDelete) {
    try {
      const ecotrack = getEcoTrackClient();
      await ecotrack.deleteOrder(trackingToDelete);
    } catch (courierErr) {
      console.warn('[API /api/delivery] Courier deletion attempt warning:', courierErr);
    }
  }

  // 3. Delete from Supabase
  try {
    await supabase
      .from('orders')
      .delete()
      .or(`id.eq.${target},order_id.eq.${target},order_number.eq.${target},redex_tracking_code.eq.${target},tracking_number.eq.${target}`);
  } catch (dbErr) {
    console.warn('[API /api/delivery] Supabase delete warning:', dbErr);
  }

  // 4. Delete from fallback store
  const allStored = getStoredFallbackOrders();
  const filtered = allStored.filter(
    (fb) =>
      fb.id !== target &&
      fb.orderNumber !== target &&
      (fb as any).redex_tracking_code !== target &&
      (fb as any).trackingNumber !== target
  );
  if (filtered.length !== allStored.length) {
    saveAllFallbackOrders(filtered);
  }

  return { success: true, message: `تم حذف الطلبية #${target} بنجاح من قاعدة البيانات ومنصة التوصيل.` };
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

    // If tracking indicates an advanced or terminal status, update Supabase & fallback
    if (trackingInfo.success && trackingInfo.status) {
      const statusCode = trackingInfo.status.toLowerCase();
      let newDbStatus: string | null = null;
      if (['livred', 'livre_non_encaisse', 'encaisse_non_paye', 'encaissed', 'payed', 'paye_et_archive'].includes(statusCode)) {
        newDbStatus = 'DELIVERED';
      } else if (['return_asked', 'return_in_transit', 'retour_chez_livreur', 'retour_transit_entrepot', 'retour_en_traitement', 'retour_recu', 'return_received', 'retour_archive'].includes(statusCode)) {
        newDbStatus = 'RETURNED';
      } else if (['annule'].includes(statusCode)) {
        newDbStatus = 'CANCELLED';
      } else if (['en_livraison', 'vers_wilaya', 'en_hub', 'dispatched_to_driver', 'picked'].includes(statusCode)) {
        newDbStatus = 'SHIPPED';
      }

      if (newDbStatus) {
        try {
          const supabase = getSupabaseServerClient() as any;
          await supabase
            .from('orders')
            .update({
              status: newDbStatus,
              delivery_status: newDbStatus,
              updated_at: new Date().toISOString(),
            })
            .or(`redex_tracking_code.eq.${tracking},tracking_number.eq.${tracking}`);
        } catch (dbErr) {
          console.warn('[API /api/delivery] Supabase sync on tracking update:', dbErr);
        }

        const allStored = getStoredFallbackOrders();
        let fallbackUpdated = false;
        for (const fb of allStored) {
          if ((fb as any).redex_tracking_code === tracking || (fb as any).trackingNumber === tracking) {
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
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: dbOrders, error } = await supabase
        .from('orders')
        .select('id, order_id, redex_tracking_code, tracking_number, status')
        .or('in_redex.eq.true,courier_provider.eq.REDEX,redex_tracking_code.not.is.null')
        .not('status', 'in', '("DELIVERED","RETURNED","CANCELLED")')
        .limit(100);

      if (error || !Array.isArray(dbOrders) || dbOrders.length === 0) {
        return NextResponse.json({ success: true, updatedCount: 0, message: 'لا توجد شحنات نشطة تحتاج للمزامنة حالياً.' });
      }

      const trackings: string[] = [];
      for (const row of dbOrders) {
        const tracking = row.redex_tracking_code || row.tracking_number;
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
              .update({ status: newDbStatus, delivery_status: newDbStatus, updated_at: new Date().toISOString() })
              .or(`redex_tracking_code.eq.${tracking},tracking_number.eq.${tracking}`);
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

  // 5. Platform Data: Get Communes (page-2026-11-08-18-58-29.md)
  if (action === 'get_communes') {
    const wilayaId = searchParams.get('wilaya_id') ? parseInt(searchParams.get('wilaya_id')!, 10) : undefined;
    const ecotrack = getEcoTrackClient();
    const communes = await ecotrack.getCommunes(wilayaId);
    return NextResponse.json({ success: true, data: communes, total: communes.length });
  }

  // 6. Platform Data: Get Fees (Tarifs des prestations)
  if (action === 'get_fees') {
    const ecotrack = getEcoTrackClient();
    const feesResult = await ecotrack.getFees();
    return NextResponse.json(feesResult);
  }

  // 7. Platform Data: Get Desks (Bureaux Stop Desk)
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

  // 9. Platform Data: Get Products List (Produits & Stock)
  if (action === 'get_products') {
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const ecotrack = getEcoTrackClient();
    const productsResult = await ecotrack.getProducts(page);
    return NextResponse.json(productsResult);
  }

  // 10. Fetch all orders (Supabase + Fallback Store + Mock)
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
        in_redex: Boolean((fb as any).in_redex),
        redex_tracking_code: (fb as any).redex_tracking_code || null,
        created_at: fb.createdAt,
        remarks: fb.remarks || [],
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

// ── POST HANDLER ────────────────────────────────────────────────────────────
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

    // Live Push & Auto-Validate with Redex (EcoTrack API)
    if (action === 'create' || action === 'push_order') {
      const orderId = body.orderId || body.orderNumber || body.id;
      if (!orderId) {
        return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
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
      let reference = orderId;

      const supabase = getSupabaseServerClient() as any;

      // Enrich from Supabase if fields are missing
      if (!clientName || !clientPhone || !wilayaName) {
        try {
          const { data: existingRow } = await supabase
            .from('orders')
            .select('*')
            .or(`id.eq.${orderId},order_id.eq.${orderId},order_number.eq.${orderId}`)
            .maybeSingle();

          if (existingRow) {
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
              codAmount = Number(existingRow.grand_total ? String(existingRow.grand_total).replace(/[^\d]/g, '') : existingRow.total || 5450);
            }
            productName = productName || existingRow.product_name || 'Pack ORVA';
          }
        } catch (fetchErr) {
          console.warn('[API /api/delivery] Could not fetch existing order from Supabase:', fetchErr);
        }
      }

      const finalWilayaCode = extractWilayaCode(wilayaCode || wilayaName);
      const cleanPhone = cleanAlgerianPhone(clientPhone);

      const ecotrack = getEcoTrackClient({
        baseUrl: body.baseUrl,
        token: body.token,
      });

      // Intelligent Commune Resolver: Resolves Arabic / arbitrary communes to valid Latin communes registered in Redex
      const resolved = await ecotrack.resolveCommuneForWilaya(finalWilayaCode, rawCommune);
      const finalCommune = resolved.resolvedCommune;
      const finalStopDeskCode = stopDeskCode || resolved.stopDeskStationCode || undefined;

      // Ensure customer's original address information is retained if commune was translated
      const finalAddress = rawCommune && rawCommune !== finalCommune
        ? `${rawCommune} — ${address}`
        : address;

      const finalNotes = rawCommune && rawCommune !== finalCommune
        ? (notes ? `${notes} (بلدية: ${rawCommune})` : `بلدية: ${rawCommune}`)
        : notes;

      // 1. Create order in Redex
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

      // 2. Auto-validate order immediately
      const validResult = await ecotrack.validOrder(trackingCode, 0);

      // 3. Update Supabase
      try {
        await supabase
          .from('orders')
          .update({
            in_redex: true,
            redex_tracking_code: trackingCode,
            tracking_number: trackingCode,
            courier_provider: 'REDEX',
            status: 'SHIPPED',
            delivery_status: 'SHIPPED',
            dispatched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .or(`id.eq.${orderId},order_id.eq.${orderId},order_number.eq.${orderId}`);
      } catch (dbErr) {
        console.warn('[API /api/delivery] Supabase dispatch update warning:', dbErr);
      }

      // 4. Update Fallback store
      const allStored = getStoredFallbackOrders();
      for (const fb of allStored) {
        if (fb.id === orderId || fb.orderNumber === orderId) {
          fb.status = 'SHIPPED' as any;
          (fb as any).in_redex = true;
          (fb as any).redex_tracking_code = trackingCode;
        }
      }
      saveAllFallbackOrders(allStored);

      return NextResponse.json({
        success: true,
        trackingCode,
        trackingNumber: trackingCode,
        courierId: 'redex',
        courierName: 'Redex Express (EcoTrack)',
        labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`,
        validation: validResult,
        message: 'تم إرسال الطلبية واعتمادها بنجاح لدى شركة Redex Express.',
      });
    }

    // Support legacy POST { action: 'delete' }
    if (action === 'delete') {
      const orderId = body.orderId || body.orderNumber || body.id || body.tracking;
      const result = await executeOrderDeletion(orderId);
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
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const orderId = searchParams.get('orderId') || searchParams.get('id') || searchParams.get('tracking') || body.orderId || body.id || body.tracking;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'معرّف الطلبية (orderId) مطلوب للحذف' }, { status: 400 });
    }

    const result = await executeOrderDeletion(orderId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Delete error occurred' }, { status: 500 });
  }
}
