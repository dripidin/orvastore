import { type NextRequest, NextResponse } from "next/server";

import { getVerifiedAdminSession } from "@/lib/auth/admin-auth";
import { getCourierProviderManager } from "@/lib/couriers";
import { computeCourierStatusBridgeUpdate } from "@/lib/delivery/status-bridge";
import { getWilayaNameAr69 } from "@/lib/geo/algeria-69";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "@/lib/orders-store";
import { persistAuthoritativeOrderPatch } from "@/lib/reconciliation/reconciliation-engine";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ActionKind =
  | "sync_status"
  | "sync_cod_amount"
  | "sync_status_and_amount"
  | "apply_upsell_quantity"
  | "apply_stop_desk_tariff"
  | "import_to_store"
  | "push_to_courier"
  | "resolve_duplicate"
  | "manual_override_status"
  | "live_refresh_via_api";

async function safeUpdateOrderExtra(supabase: any, orderIdOrNumber: string, extra: Record<string, unknown>) {
  if (!supabase || Object.keys(extra).length === 0) return;
  try {
    await supabase.from("orders").update(extra).or(`order_id.eq.${orderIdOrNumber},order_number.eq.${orderIdOrNumber}`);
  } catch {
    // Ignore when new SQL columns haven't been added on live DB yet
  }
}

export async function POST(request: NextRequest) {
  const adminSession = await getVerifiedAdminSession(request);
  if (!adminSession || !adminSession.sid || adminSession.role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const actor = `admin:${adminSession.sid.slice(0, 8)}`;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "") as ActionKind;
  const items: Array<Record<string, any>> = Array.isArray(body.items) ? body.items : body.item ? [body.item] : [];

  if (!action || items.length === 0) {
    return NextResponse.json(
      { success: false, error: "الإجراء (action) وقائمة العناصر (items) مطلوبان" },
      { status: 400 },
    );
  }

  const supabase = isServiceRoleConfigured() ? (getSupabaseServerClient() as any) : null;
  const nowIso = new Date().toISOString();
  let successCount = 0;
  const results: Array<{ id?: string; trackingCode?: string; success: boolean; message: string }> = [];

  for (const item of items) {
    try {
      if (action === "sync_status") {
        const orderId = String(item.storeOrderId || item.reference || "").trim();
        const courierStatusRaw = String(item.courierStatusRaw || "en_transit");
        const bridgePatch = computeCourierStatusBridgeUpdate({
          currentStoreStatus: String(item.storeOrderStatus || "pending"),
          manualStatusOverride: false,
          courierStatusRaw,
          courierStatusAr: item.courierStatusAr,
          driverName: item.driverName,
          driverPhone: item.driverPhone,
          returnFeeDzd: item.returnFeeDzd,
          financialStatus: item.financialStatus,
          statusSource: "courier_excel",
        });

        const nextStatusUpper = (bridgePatch.nextStoreStatus || "shipped").toUpperCase();
        if (supabase && orderId) {
          await supabase
            .from("orders")
            .update({ status: nextStatusUpper, updated_at: nowIso })
            .or(`order_id.eq.${orderId},order_number.eq.${orderId}`);
          await safeUpdateOrderExtra(supabase, orderId, {
            courier_id: item.courierId || undefined,
            courier_status: bridgePatch.courier_status,
            courier_status_ar: bridgePatch.courier_status_ar,
            normalized_courier_status: bridgePatch.normalized_courier_status,
            courier_location_stage: bridgePatch.courier_location_stage,
            courier_last_synced_at: nowIso,
            status_source: "courier_excel",
            driver_name: item.driverName || undefined,
            driver_phone: item.driverPhone || undefined,
            financial_status: item.financialStatus || undefined,
            return_fee_dzd: item.returnFeeDzd || undefined,
          });
        }

        const fbAll = getStoredFallbackOrders();
        let fbChanged = false;
        for (const fb of fbAll) {
          if (fb.id === orderId || fb.orderNumber === orderId) {
            fb.status = nextStatusUpper as any;
            (fb as any).courier_status = bridgePatch.courier_status;
            (fb as any).courier_status_ar = bridgePatch.courier_status_ar;
            fbChanged = true;
          }
        }
        if (fbChanged) saveAllFallbackOrders(fbAll);

        successCount += 1;
        results.push({ id: orderId, success: true, message: `تمت المزامنة ← ${nextStatusUpper}` });
      } else if (
        action === "sync_cod_amount" ||
        action === "sync_status_and_amount" ||
        action === "apply_upsell_quantity" ||
        action === "apply_stop_desk_tariff"
      ) {
        const orderId = String(item.storeOrderId || item.reference || "").trim();
        const courierCod = Math.max(0, Number(item.montantDzd ?? 0));
        const healPatch = item.autoHealPatch || {};
        const effectivePatch = {
          ...healPatch,
          totalPayableDzd: courierCod > 0 ? courierCod : healPatch.totalPayableDzd,
          driverName: item.driverName || healPatch.driverName,
          driverPhone: item.driverPhone || healPatch.driverPhone,
          returnFeeDzd: item.returnFeeDzd ?? healPatch.returnFeeDzd,
          courierStatusRaw: item.courierStatusRaw || healPatch.courierStatusRaw,
          courierStatusAr: item.courierStatusAr || healPatch.courierStatusAr,
          financialStatus: item.financialStatus || healPatch.financialStatus,
        };
        if (action === "apply_stop_desk_tariff") {
          effectivePatch.deliveryType = "STOP_DESK";
        }
        await persistAuthoritativeOrderPatch({
          orderId,
          courierId: item.courierId,
          trackingCode: item.trackingCode,
          patch: effectivePatch,
        });
        successCount += 1;
        results.push({
          id: orderId,
          success: true,
          message:
            effectivePatch.adjustmentReasonAr ||
            `تم اعتماد بيانات التوصيل (${courierCod.toLocaleString("fr-DZ")} د.ج) بنجاح`,
        });
      } else if (action === "import_to_store") {
        const tracking = String(item.trackingCode || "").trim();
        const cid = String(item.courierId || "external")
          .trim()
          .toLowerCase();
        const richPatch = computeCourierStatusBridgeUpdate({
          currentStoreStatus: "pending",
          manualStatusOverride: false,
          courierStatusRaw: String(item.courierStatusRaw || "en_transit"),
          courierStatusAr: item.courierStatusAr,
          driverName: item.driverName,
          driverPhone: item.driverPhone,
          returnFeeDzd: item.returnFeeDzd,
          financialStatus: item.financialStatus,
          statusSource: "courier_excel",
        });

        const cleanOrderNum =
          String(item.reference || "").trim() ||
          (tracking ? `IMP-${tracking}` : `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        const wCode = Number(item.wilayaCode) || 16;
        const wName = item.wilayaName && item.wilayaName !== "—" ? item.wilayaName : getWilayaNameAr69(wCode);
        const total = Math.max(0, Number(item.montantDzd || 0));
        const feeMap = await getReturnFeesByWilayaMap(cid).catch(() => ({}) as Record<number, number>);
        const returnFee = Number(item.returnFeeDzd || feeMap[wCode] || 400);
        const targetStatusUpper = richPatch.nextStoreStatus.toUpperCase();

        // Idempotent DB insert/update
        if (supabase) {
          const { data: existing } = await supabase
            .from("orders")
            .select("id, order_id, order_number")
            .or(
              tracking
                ? `redex_tracking_code.eq.${tracking},tracking_code.eq.${tracking},order_number.eq.${cleanOrderNum}`
                : `order_number.eq.${cleanOrderNum}`,
            )
            .limit(1)
            .maybeSingle();

          if (!existing) {
            await supabase.from("orders").insert({
              order_id: cleanOrderNum,
              order_number: cleanOrderNum,
              customer_name: String(item.customerName || "زبون مستورد"),
              customer_phone: String(item.customerPhone || "0550000000"),
              wilaya_code: wCode,
              wilaya_name: wName,
              commune_name: String(item.commune || "المركز"),
              delivery_type: "DOMICILE",
              total_payable: total,
              total,
              status: targetStatusUpper,
              in_redex: Boolean(tracking),
              tracking_code: tracking || null,
              redex_tracking_code: tracking || null,
              courier: (item.courierName || cid).toUpperCase(),
              metadata: {
                importedFromReconciliation: true,
                importedBy: actor,
                isStoreOwnedReturn: Boolean(item.isStoreOwnedReturn),
                courierId: cid,
                returnFeeDzd: returnFee,
                boutique: item.boutique || null,
              },
            });
            await safeUpdateOrderExtra(supabase, cleanOrderNum, {
              courier_id: cid,
              courier_status: richPatch.courier_status,
              courier_status_ar: richPatch.courier_status_ar,
              normalized_courier_status: richPatch.normalized_courier_status,
              courier_location_stage: richPatch.courier_location_stage,
              return_fee_dzd: returnFee,
              status_source: "courier_excel",
              driver_name: item.driverName || undefined,
              driver_phone: item.driverPhone || undefined,
            });
          }
        }

        const fbAll = getStoredFallbackOrders();
        if (
          !fbAll.some(
            (f) => f.orderNumber === cleanOrderNum || (tracking && (f as any).redex_tracking_code === tracking),
          )
        ) {
          fbAll.push({
            id: cleanOrderNum,
            orderNumber: cleanOrderNum,
            customerName: String(item.customerName || "زبون مستورد"),
            customerPhone: String(item.customerPhone || "0550000000"),
            customerPhone2: null,
            wilayaCode: wCode,
            wilayaName: wName,
            communeName: String(item.commune || "المركز"),
            deliveryType: "DOMICILE",
            deliveryAddress: String(item.commune || wName),
            packId: "custom",
            productName: "طلب مستورد من شركة التوصيل",
            productPrice: total,
            shippingFee: 0,
            totalPayable: total,
            status: targetStatusUpper as any,
            originHub: "BISKRA_07",
            createdAt: nowIso,
            in_redex: Boolean(tracking),
            redex_tracking_code: tracking || null,
            courier_id: cid,
            courier_status: richPatch.courier_status,
            courier_status_ar: richPatch.courier_status_ar,
            return_fee_dzd: returnFee,
          } as any);
          saveAllFallbackOrders(fbAll);
        }

        successCount += 1;
        results.push({ trackingCode: tracking, id: cleanOrderNum, success: true, message: "تمت الإضافة للمتجر بنجاح" });
      } else if (action === "manual_override_status") {
        const orderId = String(item.storeOrderId || item.reference || "").trim();
        const manualStatus = String(body.manualStatus || item.manualStatus || "CONFIRMED").toUpperCase();
        if (supabase && orderId) {
          await supabase
            .from("orders")
            .update({ status: manualStatus, updated_at: nowIso })
            .or(`order_id.eq.${orderId},order_number.eq.${orderId}`);
          await safeUpdateOrderExtra(supabase, orderId, {
            manual_status_override: true,
            status_source: "manual_override",
          });
        }
        successCount += 1;
        results.push({ id: orderId, success: true, message: `تم تعديل الحالة يدوياً إلى ${manualStatus}` });
      } else if (action === "live_refresh_via_api") {
        const tracking = String(item.trackingCode || "").trim();
        const cid = String(item.courierId || "redex")
          .trim()
          .toLowerCase();
        if (!tracking) {
          results.push({ id: item.id, success: false, message: "لا يوجد رقم تتبع" });
          continue;
        }
        const { provider, credentials } = await getCourierProviderManager().resolveConfiguredProvider(cid);
        const live = provider.getDetailedTracking ? await provider.getDetailedTracking(tracking, credentials) : null;
        if (live?.success && item.storeOrderId && supabase) {
          const patch = computeCourierStatusBridgeUpdate({
            currentStoreStatus: item.storeOrderStatus || "shipped",
            manualStatusOverride: false,
            courierStatusRaw: live.status,
            courierStatusAr: live.statusAr,
            driverName: live.driverName,
            driverPhone: live.driverPhone,
            currentStation: live.currentStation,
            deskInfo: live.deskInfo,
            checkpoints: live.activity,
            remarks: live.remarks,
            statusSource: "courier_api",
          });
          if (patch.storeStatusChanged && patch.status) {
            await supabase
              .from("orders")
              .update({ status: patch.status.toUpperCase(), updated_at: nowIso })
              .or(`order_id.eq.${item.storeOrderId},order_number.eq.${item.storeOrderId}`);
          }
          await safeUpdateOrderExtra(supabase, String(item.storeOrderId), {
            courier_status: patch.courier_status,
            courier_status_ar: patch.courier_status_ar,
            driver_name: patch.driver_name,
            driver_phone: patch.driver_phone,
            current_station: patch.current_station,
            courier_location_stage: patch.courier_location_stage,
          });
        }
        successCount += live?.success ? 1 : 0;
        results.push({
          trackingCode: tracking,
          success: Boolean(live?.success),
          message: live?.statusAr || live?.error || "تم الفحص عبر API",
        });
      } else if (action === "push_to_courier") {
        const cid = String(body.courierId || item.courierId || "redex")
          .trim()
          .toLowerCase();
        const { provider, credentials } = await getCourierProviderManager().resolveConfiguredProvider(cid);
        const parcel = await provider.createParcel(
          {
            orderNumber: String(item.storeOrderId || item.reference || item.id),
            customerName: String(item.customerName || "Client"),
            customerPhone: String(item.customerPhone || ""),
            wilayaCode: Number(item.wilayaCode) || 16,
            wilayaName: String(item.wilayaName || "Alger"),
            communeName: String(item.commune || "Alger Centre"),
            address: String(item.commune || item.wilayaName || "Centre Ville"),
            deliveryType: "DOMICILE",
            amountToCollect: Number(item.montantDzd || item.storeTotalDzd || 0),
            productDescription: "Pack ORVA",
          },
          credentials,
        );
        if (parcel.success && parcel.trackingCode && item.storeOrderId && supabase) {
          await supabase
            .from("orders")
            .update({
              in_redex: true,
              tracking_code: parcel.trackingCode,
              redex_tracking_code: parcel.trackingCode,
              courier: cid.toUpperCase(),
              status: "PUSHED",
              updated_at: nowIso,
            })
            .or(`order_id.eq.${item.storeOrderId},order_number.eq.${item.storeOrderId}`);
        }
        if (parcel.success) successCount += 1;
        results.push({
          id: item.storeOrderId,
          trackingCode: parcel.trackingCode,
          success: parcel.success,
          message: parcel.success ? `تم الإرسال برقم ${parcel.trackingCode}` : parcel.error || "فشل الإرسال",
        });
      } else if (action === "resolve_duplicate") {
        const orderId = String(item.storeOrderId || "").trim();
        if (supabase && orderId && body.resolution === "cancel_store_duplicate") {
          await supabase
            .from("orders")
            .update({ status: "CANCELLED", updated_at: nowIso })
            .or(`order_id.eq.${orderId},order_number.eq.${orderId}`);
        }
        successCount += 1;
        results.push({ id: orderId || item.id, success: true, message: "تمت معالجة التكرار" });
      }
    } catch (err: any) {
      results.push({
        id: item.storeOrderId || item.id,
        success: false,
        message: err?.message || "تعذر تنفيذ الإجراء",
      });
    }
  }

  return NextResponse.json({
    success: successCount > 0 || results.length > 0,
    processed: results.length,
    successCount,
    results,
  });
}
