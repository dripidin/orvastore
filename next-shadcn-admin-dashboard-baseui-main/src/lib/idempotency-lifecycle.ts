/**
 * ORVA Storefront — Checkout Idempotency Key Lifecycle Controller
 *
 * Guarantees:
 * 1. Repeated clicks on the same checkout attempt reuse the exact same key.
 * 2. A retry after a lost response or page reload safely reuses the original key from sessionStorage.
 * 3. A successful checkout completion immediately rotates the key so any new order in the same
 *    mounted form or session receives a fresh key.
 */

export const IDEMPOTENCY_STORAGE_KEY = 'orva_checkout_idempotency_key';

export interface KeyStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function generateCheckoutIdempotencyKey(): string {
  const randomSegment =
    typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
  return `idemp-${randomSegment}-${Date.now().toString(36)}`;
}

export function isValidIdempotencyKeyFormat(key: string | null | undefined): key is string {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed.length >= 10 && trimmed.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

export class CheckoutKeyLifecycle {
  private currentKey: string | null = null;
  private readonly storage: KeyStorageAdapter | null;

  constructor(storage?: KeyStorageAdapter | null) {
    if (storage !== undefined) {
      this.storage = storage;
    } else if (typeof window !== 'undefined' && window.sessionStorage) {
      this.storage = window.sessionStorage;
    } else {
      this.storage = null;
    }
  }

  /**
   * Returns the active idempotency key for the current checkout attempt.
   * - Reuses in-memory key across rapid repeated clicks.
   * - Restores key from sessionStorage across page reloads / lost responses.
   * - Generates and stores a new key only when none is active.
   */
  public getOrCreateKey(): string {
    if (isValidIdempotencyKeyFormat(this.currentKey)) {
      return this.currentKey;
    }

    try {
      const storedKey = this.storage?.getItem(IDEMPOTENCY_STORAGE_KEY);
      if (isValidIdempotencyKeyFormat(storedKey)) {
        this.currentKey = storedKey;
        return storedKey;
      }
    } catch {
      // sessionStorage may throw in restricted/sandboxed contexts
    }

    const freshKey = generateCheckoutIdempotencyKey();
    this.currentKey = freshKey;
    try {
      this.storage?.setItem(IDEMPOTENCY_STORAGE_KEY, freshKey);
    } catch {
      // ignore storage quota/privacy errors
    }
    return freshKey;
  }

  /**
   * Rotates the idempotency key immediately after a checkout attempt succeeds.
   * Ensures a subsequent checkout in the same mounted form receives a fresh key.
   */
  public rotateKeyOnSuccess(): string {
    const nextKey = generateCheckoutIdempotencyKey();
    this.currentKey = nextKey;
    try {
      this.storage?.removeItem(IDEMPOTENCY_STORAGE_KEY);
      this.storage?.setItem(IDEMPOTENCY_STORAGE_KEY, nextKey);
    } catch {
      // ignore storage quota/privacy errors
    }
    return nextKey;
  }
}

