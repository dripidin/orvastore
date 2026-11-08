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

export type { FallbackOrderRecord };

// ── Non-Blocking Telegram Alert ─────────────────────────────────────────────

async function triggerTelegramAlert(params: {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  productName: string;
  total: number;
}) {
  try {
    let token = '';
    let chatId = '';
    let enabled = true;

    try {
      const settings = await getAdminSettingsAction();
      if (settings?.telegram) {
        token = (settings.telegram.botToken || '').trim();
        chatId = (settings.telegram.chatId || '').trim();
        enabled = settings.telegram.enabled !== false;
      }
    } catch (settingsErr) {
      console.warn('[Telegram Settings Read Error]:', settingsErr);
    }

    if (!token) {
      token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    }
    if (!chatId) {
      chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
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

    const htmlText = [
      `🔔 <b>طلب جديد — متجر أورفا ORVA COD</b>`,
      `────────────────────────`,
      `📦 <b>رقم الطلب:</b> <code>${escapeHtml(params.orderNumber)}</code>`,
      `👤 <b>الزبون:</b> ${escapeHtml(params.customerName)}`,
      `📱 <b>الهاتف:</b> <code>${escapeHtml(params.customerPhone)}</code>`,
      `📍 <b>الوجهة:</b> ولاية ${escapeHtml(params.wilaya)} — بلدية ${escapeHtml(params.commune)}`,
      `🚚 <b>طريقة التوصيل:</b> ${escapeHtml(params.deliveryType)}`,
      `🛒 <b>المنتج:</b> ${escapeHtml(params.productName)}`,
      `💰 <b>المبلغ المستحق:</b> <b>${params.total.toLocaleString()} د.ج</b>`,
      `────────────────────────`,
      `📞 <i>يرجى الاتصال بالزبون لتأكيد الطلبية.</i>`,
    ].join('\n');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlText,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(6000),
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
    });
  } catch (err) {
    console.warn('[Meta CAPI Error]:', err);
  }
}

// ── Master Server Action: submitCodOrderAction ──────────────────────────────

export async function submitCodOrderAction(
  submission: CodOrderSubmission
): Promise<CodOrderResult> {
  try {
    // 1. Server-Side Zod Validation
    const parseResult = codOrderSubmissionSchema.safeParse(submission);
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
    const orderNumber = generateOrderNumber();
    const normalizedPhone = normalizeAlgerianPhone(validated.customerPhone);
    const normalizedPhone2 = validated.customerPhone2
      ? normalizeAlgerianPhone(validated.customerPhone2)
      : null;
    const address =
      validated.deliveryType === 'DOMICILE'
        ? (validated.deliveryAddress?.trim() ?? '')
        : 'Bureau Stop-Desk';

    // 2. Database Persistence via Supabase Server Client
    let persistedToDatabase = false;
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          customer_name: validated.customerName,
          customer_phone: normalizedPhone,
          customer_phone2: normalizedPhone2,
          wilaya_code: validated.wilayaCode,
          wilaya_name: validated.wilayaName,
          commune_name: validated.communeName,
          delivery_wilaya: validated.wilayaName,
          delivery_commune: validated.communeName,
          delivery_method: validated.deliveryType,
          delivery_type: validated.deliveryType,
          delivery_address: address,
          origin_hub: 'BISKRA_07',
          subtotal: validated.productPrice,
          delivery_fee: validated.shippingFee,
          total: validated.totalPayable,
          currency: 'DZD',
          payment_method: 'COD',
          payment_status: 'UNPAID',
          status: 'PENDING',
          courier_provider: 'REDEX',
          risk_score: 0,
          risk_level: 'LOW',
          risk_decision: 'ACCEPT',
          metadata: {
            packId: validated.packId,
            productName: validated.productName,
            source: 'storefront_1page_cod',
            submittedAt: new Date().toISOString(),
          },
        })
        .select('id')
        .single();

      if (!orderErr && orderData?.id) {
        persistedToDatabase = true;
        await supabase.from('order_items').insert({
          order_id: orderData.id,
          pack_id: validated.packId,
          product_name_snapshot: validated.productName,
          unit_price: validated.productPrice,
          quantity: 1,
          line_total: validated.productPrice,
        });
      } else if (orderErr) {
        console.warn('[Supabase Order Insert Warning - Falling back]:', orderErr.message);
      }
    } catch (dbErr: any) {
      console.warn('[Supabase Order Exception - Falling back to Memory]:', dbErr?.message);
    }

    // 3. Fallback Persistent Disk & Memory Storage if database is unreachable / offline
    if (!persistedToDatabase) {
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
      });
    }

    // 4. Non-Blocking External Alerts (Telegram & CAPI)
    void Promise.allSettled([
      triggerTelegramAlert({
        orderNumber,
        customerName: validated.customerName,
        customerPhone: normalizedPhone,
        wilaya: validated.wilayaName,
        commune: validated.communeName,
        deliveryType:
          validated.deliveryType === 'DOMICILE'
            ? 'توصيل لباب المنزل (Domicile)'
            : 'استلام من مكتب التوصيل (Stop-Desk Bureau)',
        productName: validated.productName,
        total: validated.totalPayable,
      }),
      triggerMetaCapiPurchase({
        orderNumber,
        customerName: validated.customerName,
        customerPhone: normalizedPhone,
        productName: validated.productName,
        total: validated.totalPayable,
        packId: validated.packId,
      }),
    ]);

    // 5. Success Redirect URL Formulation
    const searchParams = new URLSearchParams({
      orderNumber,
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
      orderNumber,
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
