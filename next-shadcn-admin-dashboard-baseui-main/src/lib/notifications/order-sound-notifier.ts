"use client";

/**
 * ORVA Store — Admin New Order Sound Notification Engine
 *
 * Rules:
 * 1. NEVER plays sound for existing orders when the admin logs in or loads the dashboard.
 *    The initial fetch silently seeds all existing order IDs as the baseline.
 * 2. Plays a single pleasant notification chime ONLY when genuinely new order IDs appear
 *    on subsequent polls or real-time broadcast events after the initial baseline load.
 * 3. Uses Web Audio API synthesis (zero external audio file dependencies).
 */

const SESSION_KNOWN_ORDERS_KEY = "orva_admin_known_order_ids_v1";
const SOUND_MUTE_STORAGE_KEY = "orva_admin_sound_muted_v1";

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function unlockOrderNotificationAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    // Ignore autoplay restrictions before user gesture
  }
}

export function isOrderSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setOrderSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_MUTE_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // Ignore storage errors
  }
}

export function playNewOrderNotificationSound(): void {
  if (typeof window === "undefined" || isOrderSoundMuted()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const triggerTone = () => {
      const now = ctx.currentTime;

      // First note (D5 - 587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.24);

      // Second note (A5 - 880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.14);
      gain2.gain.setValueAtTime(0.0001, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.58);
    };

    if (ctx.state === "suspended") {
      void ctx
        .resume()
        .then(triggerTone)
        .catch(() => {
          // Ignore autoplay restriction before user interaction
        });
    } else {
      triggerTone();
    }
  } catch {
    // Audio context blocked or unsupported
  }
}

export function readSessionKnownOrderIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KNOWN_ORDERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((item) => String(item)));
    }
  } catch {
    // Ignore malformed sessionStorage
  }
  return new Set();
}

export function writeSessionKnownOrderIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const arr = Array.from(ids).slice(-2000);
    window.sessionStorage.setItem(SESSION_KNOWN_ORDERS_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage quota errors
  }
}
