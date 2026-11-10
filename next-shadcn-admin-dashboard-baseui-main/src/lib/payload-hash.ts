import crypto from 'node:crypto';
import { normalizeAlgerianPhone } from '@/lib/types/checkout';

/**
 * Computes a deterministic canonical SHA-256 hash of the order payload.
 * Used for idempotency collision protection (detects if an existing idempotency_key
 * is being reused with different customer phone, wilaya, commune, pack, total, or delivery type).
 */
export function computeCanonicalPayloadHash(data: {
  customerPhone: string;
  wilayaCode: number;
  communeName: string;
  packId?: string;
  totalPayable: number;
  deliveryType: string;
}): string {
  const normalizedPhone = normalizeAlgerianPhone(data.customerPhone);
  const normalizedCommune = (data.communeName || '').trim().toLowerCase();
  const normalizedPack = (data.packId || '').toUpperCase().trim();
  const canonicalString = [
    `phone:${normalizedPhone}`,
    `wilaya:${data.wilayaCode}`,
    `commune:${normalizedCommune}`,
    `pack:${normalizedPack}`,
    `total:${data.totalPayable}`,
    `type:${data.deliveryType}`,
  ].join('|');

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

