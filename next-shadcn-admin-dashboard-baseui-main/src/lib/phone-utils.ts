/**
 * ORVA Store — Phone Utilities & Demo Masking
 * 
 * Safely masks telephone numbers in Demo Mode to prevent accidental dialing,
 * SMS, or WhatsApp outreach, while preserving full format validation readiness.
 */

export function maskDemoPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const clean = phone.replace(/[^\d]/g, "");
  if (clean.length < 10) return phone;
  // Format as: 0555 •• •• 56
  return `${clean.slice(0, 4)} •• •• ${clean.slice(-2)}`;
}

export function isValidAlgerianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^\d]/g, "");
  return /^(05|06|07)[0-9]{8}$/.test(cleaned);
}
