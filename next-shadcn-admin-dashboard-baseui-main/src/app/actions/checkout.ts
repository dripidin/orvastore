'use server';

import crypto from 'node:crypto';
import {
  CodOrderSubmission,
  CodOrderResult,
  codOrderSubmissionSchema,
  normalizeAlgerianPhone,
} from '@/lib/types/checkout';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminSettingsAction } from '@/app/actions/settings';

import {
  FallbackOrderRecord,
  fallbackOrdersStore,
  getStoredFallbackOrders,
  saveFallbackOrder,
  generateOrderNumber,
} from '@/lib/orders-store';
import { computeCanonicalPayloadHash } from '@/lib/payload-hash';

export type { FallbackOrderRecord };

// ── Non-Blocking Telegram Alert ─────────────────────────────────────────────

interface PackNotificationMeta {
  headerTitle: string;
  packDisplayName: string;
  packContents: string;
}

function getPackNotificationMeta(
  packId: string | undefined,
  productName: string,
  productPrice: number
): PackNotificationMeta {
  const priceFormatted = productPrice.toLocaleString();
  const cleanPack = (packId || '').toUpperCase().trim();

  if (cleanPack === 'PACK1') {
    return {
      headerTitle: `عرض 4 في 1 المتكامل (PACK 4EN1 — ${priceFormatted} د.ج)`,
      packDisplayName: `عرض 4 في 1 المتكامل (PACK 4EN1)`,
      packContents: `(منفاخ عجلات TOYOTA + علبة مفاتيح 46 قطعة STARCLE PRO + مفك مرن 11 قطعة + طقم 6 مفكات)`,
    };
  }

  if (cleanPack === 'PACK2') {
    return {
      headerTitle: `عرض 5 في 1 الفاخر (PACK 5EN1 — ${priceFormatted} د.ج)`,
      packDisplayName: `عرض 5 في 1 الفاخر (PACK 5EN1)`,
      packContents: `(ماكينة CROWN 20V ببطاريتين + طقم مفكات 6 قطع + علبة مفاتيح 46 قطعة + مفك مرن + قفازات)`,
    };
  }

  if (cleanPack === 'PACK3') {
    return {
      headerTitle: `عرض ماكينة اللحام والورشة (PACK 3 — ${priceFormatted} د.ج)`,
      packDisplayName: `عرض ماكينة اللحام والورشة (PACK 3)`,
      packContents: `(ماكينة لحام CROWN MMA-200 MINI + قفازات حماية GILAN + قناع لحام + كوابل نحاسية + طقم مفكات 6 قطع)`,
    };
  }

  return {
    headerTitle: `${productName} (${priceFormatted} د.ج)`,
    packDisplayName: productName,
    packContents: '',
  };
}

async function triggerTelegramAlert(params: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string | null;
  wilaya: string;
  commune: string;
  deliveryType: string;
  deliveryAddress?: string | null;
  productName: string;
  packId?: string;
  productPrice?: number;
  shippingFee?: number;
  quantity?: number;
  total: number;
}) {
  try {
    let token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    let chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
    let enabled = true;

    // Only query database settings if environment variables are missing
    if (!token || !chatId) {
      try {
        const settings = await getAdminSettingsAction();
        if (settings?.telegram) {
          token = token || (settings.telegram.botToken || '').trim();
          chatId = chatId || (settings.telegram.chatId || '').trim();
          enabled = settings.telegram.enabled !== false;
        }
      } catch (settingsErr) {
        console.warn('[Telegram Settings Read Error]:', settingsErr);
      }
    }

    if (!enabled || !token || !chatId) return;

    // Normalize -100 prefix for supergroups/channels (10 to 14 digit IDs)
    if (/^\d{10,14}$/.test(chatId)) {
      chatId = `-100${chatId}`;
    }

    const escapeHtml = (text: string) =>
      String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://orvastore.vercel.app').replace(/\/$/, '');
    const dashboardOrderUrl = `${appUrl}/admin.html?orderId=${encodeURIComponent(params.orderNumber)}`;

    const meta = getPackNotificationMeta(
      params.packId,
      params.productName,
      params.productPrice || params.total
    );

    const formattedDate = new Date().toLocaleString('ar-DZ', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const lines: string[] = [
      `👑 <b>طلب جديد: ${escapeHtml(meta.headerTitle)}</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🆔 <b>رقم الطلب:</b> <code>${escapeHtml(params.orderNumber)}</code>`,
      `👤 <b>الاسم الكامل:</b> ${escapeHtml(params.customerName)}`,
      `📱 <b>رقم الهاتف:</b> <code>${escapeHtml(params.customerPhone)}</code>`,
    ];

    if (params.customerPhone2) {
      lines.push(`📱 <b>رقم الهاتف 2:</b> <code>${escapeHtml(params.customerPhone2)}</code>`);
    }

    lines.push(`📍 <b>الولاية والبلدية:</b> ${escapeHtml(params.wilaya)} — ${escapeHtml(params.commune)}`);

    if (params.deliveryAddress && params.deliveryAddress !== 'Bureau Stop-Desk') {
      lines.push(`🏠 <b>العنوان:</b> ${escapeHtml(params.deliveryAddress)}`);
    }

    lines.push(`🚚 <b>نوع التوصيل:</b> ${escapeHtml(params.deliveryType)}`);
    lines.push(`⚡️ <b>مدة التوصيل:</b> 24 - 48 H`);
    lines.push(`📦 <b>العرض والكمية:</b> ${params.quantity || 1} قطعة — ${escapeHtml(meta.packDisplayName)}`);

    if (meta.packContents) {
      lines.push(escapeHtml(meta.packContents));
    }

    if (params.productPrice !== undefined) {
      lines.push(`💵 <b>سعر العرض:</b> ${params.productPrice} د.ج`);
    }
    if (params.shippingFee !== undefined) {
      lines.push(`🚚 <b>مصاريف التوصيل:</b> ${params.shippingFee} د.ج`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 <b>المجموع الكلي (COD):</b> <b>${params.total} د.ج</b>`);
    lines.push(`📅 <b>التاريخ:</b> ${formattedDate}`);
    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`📌 <i>الطلبية محفوظة في Supabase (لم تُرسل لشركة التوصيل بعد).</i>`);
    lines.push(`👉 <a href="${dashboardOrderUrl}">[لوحة التحكم (Admin Dashboard)]</a>`);
    lines.push(dashboardOrderUrl);

    const htmlText = lines.join('\n');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(2500),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      console.warn('[Telegram Dispatch Warning]:', data?.description || res.statusText || `HTTP ${res.status}`);
    } else {
      console.info('[Telegram Dispatch Success]: Alert delivered, message_id:', data?.result?.message_id);
    }
  } catch (err: any) {
    console.warn('[Telegram Alert Network Error]:', err?.message || err);
  }
}

// ── Non-Blocking Meta CAPI Purchase Event ────────────────────────────────────

async function triggerMetaCapiPurchase(params: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  total: number;
  packId: string;
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const capiToken = process.env.META_CAPI_TOKEN;
  if (!pixelId || !capiToken) return;

  const hashedPhone = crypto
    .createHash('sha256')
    .update(normalizeAlgerianPhone(params.customerPhone))
    .digest('hex');
  const hashedName = crypto
    .createHash('sha256')
    .update(params.customerName.toLowerCase().trim())
    .digest('hex');

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.orderNumber, // Deduplication key with client pixel
        action_source: 'website',
        user_data: {
          ph: [hashedPhone],
          fn: [hashedName],
        },
        custom_data: {
          currency: 'DZD',
          value: params.total,
          content_name: params.productName,
          content_ids: [params.packId],
        },
      },
    ],
  };

  try {
    await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${capiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2500),
    });
  } catch (err) {
    console.warn('[Meta CAPI Error]:', err);
  }
}

// ── Catalog price verification ──────────────────────────────────────────────

const LEGACY_PACK_PRICES: Record<string, number[]> = {
  PACK1: [4950],
  PACK2: [12950, 13390],
  PACK3: [15950],
};

/** Returns an error message when the submitted unit price does not match the admin catalog. */
async function verifyCatalogPrice(packId: string, productPrice: number): Promise<string | null> {
  const { getAllowedPricesForPack } = await import('@/lib/catalog/server');
  const allowed = await getAllowedPricesForPack(packId);
  if (allowed === null) {
    // Catalog unreachable: keep the legacy guard for the original packs, accept otherwise.
    const legacy = LEGACY_PACK_PRICES[packId.toUpperCase()];
    return legacy && !legacy.includes(productPrice) ? `Prix invalide pour le ${packId}` : null;
  }
  if (allowed.length === 0) return "هذا المنتج غير متوفر حالياً للطلب.";
  return allowed.includes(productPrice) ? null : "تغيّر سعر المنتج، يرجى تحديث الصفحة ثم إعادة الطلب.";
}

// ── In-Flight Concurrency Mutex ─────────────────────────────────────────────
const inFlightSubmissions = new Map<
  string,
  { payloadHash: string; promise: Promise<CodOrderResult> }
>();

// ── Master Server Action: submitCodOrderAction ──────────────────────────────

export async function submitCodOrderAction(
  submission: CodOrderSubmission
): Promise<CodOrderResult> {
  try {
    // 1. Server-Side Zod Validation
    try {
      const { getDeliveryFees } = await import('@/lib/delivery-fees');
      const { setLiveTariffs } = await import('@/lib/types/checkout');
      const live = await getDeliveryFees(false);
      if (live.success) setLiveTariffs(live.fees);
    } catch {
      // fall back to the static tariff matrix
    }
    const parseResult = codOrderSubmissionSchema.safeParse(submission);
    if (parseResult.success) {
      const priceError = await verifyCatalogPrice(parseResult.data.packId, parseResult.data.productPrice);
      if (priceError) {
        return { success: false, error: priceError, validationErrors: { productPrice: priceError } };
      }
    }
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message || 'Données invalides';
      const validationErrors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0]?.toString() || 'global';
        validationErrors[field] = issue.message;
      }
      return {
        success: false,
        error: firstError,
        validationErrors,
      };
    }

    const validated = parseResult.data;
    const key = validated.idempotencyKey;
    const payloadHash = computeCanonicalPayloadHash(validated);
    const useInMemoryCoalescing = process.env.ORVA_DISABLE_IN_MEMORY_DEDUP !== '1';

    // Concurrent request deduplication (within single instance):
    // Verify payloadHash before coalescing so concurrent tampering is rejected with 409 PayloadMismatch
    if (key && useInMemoryCoalescing && inFlightSubmissions.has(key)) {
      const inFlight = inFlightSubmissions.get(key)!;
      if (inFlight.payloadHash !== payloadHash) {
        console.warn(
          `[Checkout In-Flight Collision]: Key "${key}" is currently in-flight with a different payload (${inFlight.payloadHash} vs ${payloadHash}). Rejecting with 409 PayloadMismatch.`
        );
        return {
          success: false,
          error: "Conflit de requête d'idempotence (PayloadMismatch): cette clé a déjà été utilisée pour une commande différente.",
        };
      }
      console.info(`[Checkout In-Flight Deduplication]: Awaiting in-flight execution for key "${key}"`);
      return await inFlight.promise;
    }

    const executionPromise = executeCodOrderSubmission(validated, payloadHash);
    if (key && useInMemoryCoalescing) {
      inFlightSubmissions.set(key, { payloadHash, promise: executionPromise });
    }

    try {
      return await executionPromise;
    } finally {
      if (key && useInMemoryCoalescing) {
        inFlightSubmissions.delete(key);
      }
    }
  } catch (err: any) {
    console.error('[submitCodOrderAction Global Catch]:', err);
    return {
      success: false,
      error: err?.message || 'Une erreur inattendue est survenue.',
    };
  }
}

async function executeCodOrderSubmission(
  validated: CodOrderSubmission & { idempotencyKey: string },
  payloadHash: string
): Promise<CodOrderResult> {
  try {
    const cleanPack = (validated.packId || '').toUpperCase().trim();
    const random6Digits = Math.floor(100000 + Math.random() * 900000).toString();
    const orderNumber = cleanPack ? `${cleanPack}-${random6Digits}` : generateOrderNumber();
    const normalizedPhone = normalizeAlgerianPhone(validated.customerPhone);
    const normalizedPhone2 = validated.customerPhone2
      ? normalizeAlgerianPhone(validated.customerPhone2)
      : null;
    const address =
      validated.deliveryType === 'DOMICILE'
        ? (validated.deliveryAddress?.trim() ?? '')
        : 'Bureau Stop-Desk';

    const supabase = getSupabaseServerClient() as any;

    // 2. Atomic Idempotency Check (Prevent duplicate orders via unique idempotencyKey & payloadHash)
    let existingOrder: any = null;
    try {
      if (supabase && validated.idempotencyKey) {
        const { data: foundOrder, error: dedupErr } = await supabase
          .from('orders')
          .select('id, order_id, payload_hash, created_at')
          .eq('idempotency_key', validated.idempotencyKey)
          .maybeSingle();

        if (dedupErr) {
          // Explicit handling of deduplication query failures:
          // Log error clearly; the database unique constraint remains the authoritative guard.
          console.error(
            `[Checkout Deduplication Query Error]: Lookup failed for key "${validated.idempotencyKey}":`,
            dedupErr.message
          );
        } else if (foundOrder) {
          existingOrder = foundOrder;
        }
      }
    } catch (dedupException: any) {
      console.error(
        `[Checkout Deduplication Query Exception]: Exception during idempotency lookup:`,
        dedupException?.message
      );
    }

    // Check fallback store as resilience tier (covers local dev and pre-migration environments)
    if (!existingOrder && validated.idempotencyKey) {
      const fallbackOrders = getStoredFallbackOrders();
      const matchedFallback = fallbackOrders.find(
        (f) => f.idempotencyKey === validated.idempotencyKey
      );
      if (matchedFallback) {
        existingOrder = {
          id: matchedFallback.id,
          order_id: matchedFallback.orderNumber,
          payload_hash: matchedFallback.payloadHash,
          created_at: matchedFallback.createdAt,
        };
      }
    }

    // Safe behavior when the same key is retried:
    // Verify payload hash integrity to reject collisions (409 PayloadMismatch)
    if (existingOrder?.order_id) {
      if (existingOrder.payload_hash && existingOrder.payload_hash !== payloadHash) {
        console.warn(
          `[Checkout Idempotency Collision]: Key "${validated.idempotencyKey}" already used with different payload (${existingOrder.payload_hash} vs ${payloadHash}). Rejecting with 409 PayloadMismatch.`
        );
        return {
          success: false,
          error: "Conflit de requête d'idempotence (PayloadMismatch): cette clé a déjà été utilisée pour une commande différente.",
        };
      }

      console.info(
        `[Checkout Idempotency]: Duplicate submission caught by key "${validated.idempotencyKey}". Reusing order #${existingOrder.order_id}`
      );
      const searchParams = new URLSearchParams({
        orderNumber: existingOrder.order_id,
        pack: validated.packId,
        total: validated.totalPayable.toString(),
        subtotal: validated.productPrice.toString(),
        shipping: validated.shippingFee.toString(),
        name: validated.customerName,
        phone: normalizedPhone,
        wilaya: validated.wilayaName,
        commune: validated.communeName,
        deliveryType: validated.deliveryType,
      });

      return {
        success: true,
        orderNumber: existingOrder.order_id,
        redirectUrl: `/checkout/confirmation?${searchParams.toString()}`,
      };
    }

    // 3. Database Persistence via Supabase Server Client
    let persistedToDatabase = false;
    let persistenceErrorMessage: string | null = null;
    let finalOrderNumber = orderNumber;

    try {
      const deliveryLabel =
        validated.deliveryType === 'DOMICILE'
          ? 'توصيل للمنزل'
          : 'توصيل للمكتب (Stop Desk)';
      const wilayaFull = `${validated.wilayaCode} - ${validated.wilayaName} — ${validated.communeName}`;

      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_id: orderNumber,
          order_number: orderNumber,
          idempotency_key: validated.idempotencyKey,
          payload_hash: payloadHash,
          store_id: 'orvastore',
          full_name: validated.customerName,
          customer_name: validated.customerName,
          phone: normalizedPhone,
          customer_phone: normalizedPhone,
          wilaya: wilayaFull,
          delivery_wilaya: wilayaFull,
          wilaya_code: validated.wilayaCode,
          wilaya_name: validated.wilayaName,
          commune: validated.communeName,
          commune_name: validated.communeName,
          delivery_commune: validated.communeName,
          delivery_address: address,
          delivery_type: deliveryLabel,
          delivery_method: validated.deliveryType,
          delivery_time: '24 - 48 H',
          quantity: 1,
          product_name: validated.productName,
          product_title: validated.productName,
          pack_id: validated.packId,
          subtotal: validated.productPrice,
          delivery_fee: validated.shippingFee,
          total: validated.totalPayable,
          total_payable: validated.totalPayable,
          product_total: `${validated.productPrice.toLocaleString()} د.ج`,
          shipping_fee: `${validated.shippingFee.toLocaleString()} د.ج`,
          price_num: validated.totalPayable,
          grand_total: `${validated.totalPayable.toLocaleString()} د.ج`,
          status: 'pending',
          in_redex: false,
          notes: address,
          risk_score: 0,
          risk_level: 'LOW',
          risk_decision: 'ALLOW',
          courier: 'REDEX',
        })
        .select('id, order_id')
        .single();

      if (!orderErr && orderData?.id) {
        persistedToDatabase = true;

        // Persist order item snapshot into order_items table (Requirement R4)
        try {
          let productId: string | null = null;
          try {
            const { data: productRow } = await (supabase as any)
              .from('products')
              .select('id')
              .eq('slug', validated.packId.toLowerCase())
              .maybeSingle();
            if (productRow?.id) {
              productId = productRow.id;
            }
          } catch {
            // Non-fatal if product lookup fails
          }

          const rawPack = (validated.packId || '').toUpperCase().trim();
          const validPack = (['PACK1', 'PACK2', 'PACK3'].includes(rawPack))
            ? (rawPack as 'PACK1' | 'PACK2' | 'PACK3')
            : null;

          const orderItemsTable = (supabase as any).from?.('order_items');
          if (typeof orderItemsTable?.insert === 'function') {
            const { error: itemErr } = await orderItemsTable.insert({
              order_id: orderNumber,
              product_id: productId,
              variant_id: null,
              pack_id: validPack,
              product_name: validated.productName,
              product_name_snapshot: validated.productName,
              variant_label_snapshot: validated.packId,
              unit_price: validated.productPrice,
              quantity: 1,
              line_total: validated.productPrice,
            });

            if (itemErr) {
              console.warn('[Checkout Order Item Insert Warning]:', itemErr.message || itemErr);
            }
          }
        } catch (itemCatchErr: any) {
          console.warn('[Checkout Order Item Insert Exception]:', itemCatchErr?.message || itemCatchErr);
        }
      } else if (orderErr) {
        // Pre-migration schema fallback: if idempotency_key or payload_hash column does not exist yet in DB
        const isPreMigrationMissingColumn =
          orderErr.code === 'PGRST204' ||
          orderErr.message?.includes("'idempotency_key' column") ||
          orderErr.message?.includes("'payload_hash' column") ||
          orderErr.message?.includes("column orders.idempotency_key") ||
          orderErr.message?.includes("column orders.payload_hash");

        if (isPreMigrationMissingColumn) {
          console.warn('[Pre-Migration Notice]: idempotency_key/payload_hash column not in DB yet. Retrying insert without them.');
          const { data: legacyData, error: legacyErr } = await supabase
            .from('orders')
            .insert({
              order_id: orderNumber,
              store_id: 'orvastore',
              full_name: validated.customerName,
              phone: normalizedPhone,
              wilaya: wilayaFull,
              commune: validated.communeName,
              delivery_type: deliveryLabel,
              delivery_time: '24 - 48 H',
              quantity: 1,
              product_name: validated.productName,
              product_total: `${validated.productPrice.toLocaleString()} د.ج`,
              shipping_fee: `${validated.shippingFee.toLocaleString()} د.ج`,
              price_num: validated.totalPayable,
              grand_total: `${validated.totalPayable.toLocaleString()} د.ج`,
              status: 'pending',
              in_redex: false,
              notes: address,
              risk_score: 0,
              risk_level: 'LOW',
              risk_decision: 'ALLOW',
              courier: 'REDEX',
            })
            .select('id, order_id')
            .single();

          if (!legacyErr && legacyData?.id) {
            persistedToDatabase = true;
            try {
              const rawPack = (validated.packId || '').toUpperCase().trim();
              const validPack = (['PACK1', 'PACK2', 'PACK3'].includes(rawPack))
                ? (rawPack as 'PACK1' | 'PACK2' | 'PACK3')
                : null;
              const orderItemsTable = (supabase as any).from?.('order_items');
              if (typeof orderItemsTable?.insert === 'function') {
                await orderItemsTable.insert({
                  order_id: orderNumber,
                  product_id: null,
                  variant_id: null,
                  pack_id: validPack,
                  product_name: validated.productName,
                  product_name_snapshot: validated.productName,
                  variant_label_snapshot: validated.packId,
                  unit_price: validated.productPrice,
                  quantity: 1,
                  line_total: validated.productPrice,
                });
              }
            } catch {}
            // Record in fallback store with idempotencyKey and payloadHash for consistent pre-migration replay
            saveFallbackOrder({
              id: legacyData.id,
              orderNumber,
              customerName: validated.customerName,
              customerPhone: normalizedPhone,
              customerPhone2: normalizedPhone2,
              wilayaCode: validated.wilayaCode,
              wilayaName: validated.wilayaName,
              communeName: validated.communeName,
              deliveryType: validated.deliveryType,
              deliveryAddress: address,
              packId: validated.packId,
              productName: validated.productName,
              productPrice: validated.productPrice,
              shippingFee: validated.shippingFee,
              totalPayable: validated.totalPayable,
              status: 'PENDING',
              originHub: 'BISKRA_07',
              createdAt: new Date().toISOString(),
              idempotencyKey: validated.idempotencyKey,
              payloadHash,
            });
          } else if (legacyErr) {
            persistenceErrorMessage = legacyErr.message;
            console.error('[Supabase Legacy Order Insert Error]:', legacyErr.message);
          }
        } else {
          // Atomic race resolution: if concurrent requests with same key bypassed preflight select
          const isUniqueViolation =
            orderErr.code === '23505' ||
            orderErr.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
            orderErr.message?.includes('duplicate key') ||
            orderErr.message?.includes('unique constraint') ||
            orderErr.message?.includes('UNIQUE constraint failed') ||
            orderErr.message?.includes('orders_idempotency_key_key');

          if (isUniqueViolation && validated.idempotencyKey) {
            console.info(
              `[Checkout Concurrent Race]: Unique constraint caught concurrent insert for key "${validated.idempotencyKey}". Fetching persisted order.`
            );
            const { data: racedOrder } = await supabase
              .from('orders')
              .select('id, order_id, payload_hash')
              .eq('idempotency_key', validated.idempotencyKey)
              .maybeSingle();

            if (racedOrder?.order_id) {
              if (racedOrder.payload_hash && racedOrder.payload_hash !== payloadHash) {
                console.warn(
                  `[Checkout Concurrent Collision]: Raced key "${validated.idempotencyKey}" has different payload hash. Rejecting with PayloadMismatch.`
                );
                return {
                  success: false,
                  error: "Conflit de requête d'idempotence (PayloadMismatch): cette clé a déjà été utilisée pour une commande différente.",
                };
              }
              const racedSearchParams = new URLSearchParams({
                orderNumber: racedOrder.order_id,
                pack: validated.packId,
                total: validated.totalPayable.toString(),
                subtotal: validated.productPrice.toString(),
                shipping: validated.shippingFee.toString(),
                name: validated.customerName,
                phone: normalizedPhone,
                wilaya: validated.wilayaName,
                commune: validated.communeName,
                deliveryType: validated.deliveryType,
              });
              return {
                success: true,
                orderNumber: racedOrder.order_id,
                redirectUrl: `/checkout/confirmation?${racedSearchParams.toString()}`,
              };
            } else {
              persistenceErrorMessage = orderErr.message;
              console.error('[Supabase Order Insert Error]:', orderErr.message);
            }
          } else {
            persistenceErrorMessage = orderErr.message;
            console.error('[Supabase Order Insert Error]:', orderErr.message);
          }
        }
      }
    } catch (dbErr: any) {
      persistenceErrorMessage = dbErr?.message || 'Database exception';
      console.error('[Supabase Order Exception]:', dbErr?.message);
    }

    // 4. Fallback Handling and False-Success Elimination
    if (!persistedToDatabase) {
      const isLocalDevNoDb =
        process.env.NODE_ENV !== 'production' &&
        !process.env.SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (isLocalDevNoDb) {
        saveFallbackOrder({
          id: `fallback-${crypto.randomUUID()}`,
          orderNumber,
          customerName: validated.customerName,
          customerPhone: normalizedPhone,
          customerPhone2: normalizedPhone2,
          wilayaCode: validated.wilayaCode,
          wilayaName: validated.wilayaName,
          communeName: validated.communeName,
          deliveryType: validated.deliveryType,
          deliveryAddress: address,
          packId: validated.packId,
          productName: validated.productName,
          productPrice: validated.productPrice,
          shippingFee: validated.shippingFee,
          totalPayable: validated.totalPayable,
          status: 'PENDING',
          originHub: 'BISKRA_07',
          createdAt: new Date().toISOString(),
          idempotencyKey: validated.idempotencyKey,
          payloadHash,
        });
      } else {
        console.error(
          `[CRITICAL CHECKOUT PERSISTENCE FAILURE]: Order #${orderNumber} for ${validated.customerName} (${normalizedPhone}) could not be saved to Supabase: ${persistenceErrorMessage}`
        );
        return {
          success: false,
          error: 'تعذر تأكيد طلبكم في النظام حالياً بسبب خطأ في حفظ البيانات. يرجى المحاولة مرة أخرى أو التواصل مع خدمة العملاء.',
        };
      }
    }

    // 4. Reliable Fast External Alerts (Telegram & CAPI) with explicit failure logging
    const alertResults = await Promise.allSettled([
      triggerTelegramAlert({
        orderNumber: finalOrderNumber,
        customerName: validated.customerName,
        customerPhone: normalizedPhone,
        customerPhone2: normalizedPhone2,
        wilaya: `${validated.wilayaCode} - ${validated.wilayaName}`,
        commune: validated.communeName,
        deliveryType:
          validated.deliveryType === 'DOMICILE'
            ? 'توصيل للمنزل'
            : 'توصيل للمكتب (Stop Desk)',
        deliveryAddress: address,
        productName: validated.productName,
        packId: validated.packId,
        productPrice: validated.productPrice,
        shippingFee: validated.shippingFee,
        quantity: 1,
        total: validated.totalPayable,
      }),
      triggerMetaCapiPurchase({
        orderNumber: finalOrderNumber,
        customerName: validated.customerName,
        customerPhone: normalizedPhone,
        productName: validated.productName,
        total: validated.totalPayable,
        packId: validated.packId,
      }),
    ]);

    if (alertResults[0].status === 'rejected') {
      console.warn('[Telegram Alert Failed Non-Blocking]:', alertResults[0].reason);
    }
    if (alertResults[1].status === 'rejected') {
      console.warn('[Meta CAPI Dispatch Failed Non-Blocking]:', alertResults[1].reason);
    }

    // 5. Success Redirect URL Formulation
    const searchParams = new URLSearchParams({
      orderNumber: finalOrderNumber,
      pack: validated.packId,
      total: validated.totalPayable.toString(),
      subtotal: validated.productPrice.toString(),
      shipping: validated.shippingFee.toString(),
      name: validated.customerName,
      phone: normalizedPhone,
      wilaya: validated.wilayaName,
      commune: validated.communeName,
      deliveryType: validated.deliveryType,
    });

    return {
      success: true,
      orderNumber: finalOrderNumber,
      redirectUrl: `/checkout/confirmation?${searchParams.toString()}`,
    };
  } catch (err: any) {
    console.error('[submitCodOrderAction Global Catch]:', err);
    return {
      success: false,
      error: err?.message || 'Une erreur inattendue est survenue.',
    };
  }
}
