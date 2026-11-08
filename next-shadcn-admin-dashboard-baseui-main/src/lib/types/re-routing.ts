/**
 * ORVA COD Store — Order Re-routing Interface Contracts & Utilities
 * Aligned with PROJECT.md § Interface Contracts § 2 and Algerian COD Logistics Rules
 */

import { z } from 'zod';
import {
  isValidAlgerianPhone,
  normalizeAlgerianPhone,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  ALGERIA_58_WILAYAS,
} from './checkout';

export interface OrderReRoutingPayload {
  orderId: string;
  sourceOrderId?: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newCustomerPhone2?: string;
  newWilayaCode: number;
  newWilayaName: string;
  newCommuneName: string;
  newDeliveryType: 'DOMICILE' | 'STOP_DESK';
  newDeliveryAddress?: string;
  reason: string;
  operator: string;
  shippedOverrideConfirmed: boolean;
}

export interface OrderReRoutingResult {
  success: boolean;
  orderId: string;
  sequence: number;
  formattedCourierNote: string;
  updatedShippingFee: number;
  updatedTotal: number;
  timestampUtc: string;
  error?: string;
}

export const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'delivered', 'RECONCILED', 'reconciled'] as const;

export function isTerminalStatus(status: string): boolean {
  const s = (status || '').trim().toUpperCase();
  return s === 'DELIVERED' || s === 'RECONCILED';
}

export function generateCourierInstructionNote(params: {
  originalOrderNumber: string;
  originalCustomerName?: string;
  originalWilaya?: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newWilayaCode: number;
  newWilayaName: string;
  newCommuneName: string;
  newDeliveryType: 'DOMICILE' | 'STOP_DESK';
  newAddress?: string;
  newDeliveryAddress?: string;
  updatedCodAmount: number;
  operator: string;
  reason: string;
}): string {
  const normPhone = normalizeAlgerianPhone(params.newCustomerPhone);
  const deliveryAddress = (params.newAddress || params.newDeliveryAddress || '').trim();
  const deliveryTypeLabelAr =
    params.newDeliveryType === 'STOP_DESK'
      ? 'استلام من مكتب التوصيل (Stop-Desk Bureau)'
      : 'توصيل لباب المنزل (À Domicile)';
  const formattedAmount = `${new Intl.NumberFormat('en-US').format(params.updatedCodAmount)} د.ج`;
  const timestamp = new Date().toISOString();
  const origCustomer = params.originalCustomerName || 'زبون سابق';
  const origWilaya = params.originalWilaya ? ` (${params.originalWilaya})` : '';

  return [
    '************************************************************',
    '*** تحويل مسار الطرد / INSTRUCTION RE-ROUTING COLIS ***',
    '════════════════════════════════════════════',
    'طلب تحويل طرد (Réacheminement de Colis)',
    '════════════════════════════════════════════',
    `رقم الطلبية الأصلية: ${params.originalOrderNumber}`,
    `رقم الطلب الأصلي: ${params.originalOrderNumber}`,
    `الزبون القديم: ${origCustomer}${origWilaya}`,
    '------------------------------------------------------------',
    'المعلومات الجديدة للمستلم الجديد:',
    `• الاسم واللقب: ${params.newCustomerName}`,
    `العميل الجديد: ${params.newCustomerName}`,
    `• رقم الهاتف: ${normPhone}`,
    `الهاتف: ${normPhone}`,
    `• الولاية الجديدة: [${params.newWilayaCode}] ${params.newWilayaName}`,
    `• البلدية: ${params.newCommuneName}`,
    `الوجهة الجديدة: [${params.newWilayaCode}] ${params.newWilayaName} — ${params.newCommuneName}`,
    `• نوع التوصيل: ${deliveryTypeLabelAr}`,
    `نوع التوصيل: ${deliveryTypeLabelAr}`,
    deliveryAddress ? `• العنوان: ${deliveryAddress}` : '',
    deliveryAddress ? `العنوان: ${deliveryAddress}` : '',
    '------------------------------------------------------------',
    `المبلغ الجديد الواجب تحصيله (COD): ${formattedAmount}`,
    `المبلغ الصافي المطلوب تحصيله (COD): ${formattedAmount}`,
    `سبب التحويل: ${params.reason}`,
    `المشرف المنفّذ: ${params.operator} | التاريخ: ${timestamp}`,
    `تاريخ التحويل: ${timestamp}`,
    '************************************************************',
    '════════════════════════════════════════════',
  ]
    .filter(Boolean)
    .join('\n');
}

export const orderReRoutingSchema = z
  .object({
    orderId: z.string({ message: 'Identifiant de commande requis' }).min(1),
    sourceOrderId: z.string().optional(),
    newCustomerName: z
      .string({ message: 'Nom du nouveau client requis' })
      .trim()
      .min(2, 'Le nom doit comporter au moins 2 caractères')
      .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
    newCustomerPhone: z
      .string({ message: 'Numéro de téléphone requis' })
      .trim()
      .refine((val) => isValidAlgerianPhone(val), {
        message: 'Numéro de téléphone mobile algérien invalide (doit commencer par 05, 06 ou 07)',
      }),
    newCustomerPhone2: z
      .string()
      .optional()
      .refine((val) => !val || val.trim() === '' || isValidAlgerianPhone(val), {
        message: 'Numéro de téléphone secondaire invalide',
      }),
    newWilayaCode: z
      .number({ message: 'Code Wilaya invalide' })
      .int()
      .min(1, 'Code Wilaya invalide (doit être entre 1 et 58)')
      .max(58, 'Code Wilaya invalide (doit être entre 1 et 58)'),
    newWilayaName: z.string().min(1, 'Nom de la Wilaya requis'),
    newCommuneName: z.string().min(1, 'Nom de la Commune requis'),
    newDeliveryType: z.enum(['DOMICILE', 'STOP_DESK']),
    newDeliveryAddress: z.string().optional(),
    reason: z.string().trim().min(3, 'Motif de réacheminement requis (au moins 3 caractères)'),
    operator: z.string().trim().min(2, 'Nom de l\'opérateur requis'),
    shippedOverrideConfirmed: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // Stop-Desk Barrier for Zone 5
    if (data.newDeliveryType === 'STOP_DESK' && !isStopDeskAllowed(data.newWilayaCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Stop-Desk is restricted in Wilaya ${data.newWilayaCode} (${data.newWilayaName})`,
        path: ['newDeliveryType'],
      });
    }

    // Street Address for Domicile
    if (data.newDeliveryType === 'DOMICILE') {
      if (!data.newDeliveryAddress || data.newDeliveryAddress.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Adresse de livraison requise pour la livraison à domicile',
          path: ['newDeliveryAddress'],
        });
      }
    }
  });

export type OrderReRoutingSchemaType = z.infer<typeof orderReRoutingSchema>;
