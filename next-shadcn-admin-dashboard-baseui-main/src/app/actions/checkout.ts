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
    const cleanPack = (validated.packId || '').toUpperCase().trim();
    const random5Digits = Math.floor(10000 + Math.random() * 90000).toString();
    const orderNumber = cleanPack ? `${cleanPack}-${random5Digits}` : generateOrderNumber();
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
      const deliveryLabel =
        validated.deliveryType === 'DOMICILE'
          ? 'توصيل للمنزل'
          : 'توصيل للمكتب (Stop Desk)';
      const wilayaFull = `${validated.wilayaCode} - ${validated.wilayaName} — ${validated.communeName}`;

      const { data: orderData, error: orderErr } = await supabase
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
        .select('id')
        .single();

      if (!orderErr && orderData?.id) {
        persistedToDatabase = true;
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

    // 4. Reliable Fast External Alerts (Telegram & CAPI)
    await Promise.allSettled([
      triggerTelegramAlert({
        orderNumber,
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
