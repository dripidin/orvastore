import { getClientCookie, setClientCookie } from "@/lib/cookie.client";
import {
  getPreferencePersistence,
  PREFERENCE_REGISTRY,
  type PreferenceKey,
  type PreferenceValueMap,
  parsePreference,
} from "@/lib/preferences/preferences-config";

export async function getValueFromCookie(key: string): Promise<string | undefined> {
  if (typeof document === "undefined") return undefined;
  return getClientCookie(key);
}

export async function setValueToCookie(
  key: string,
  value: string,
  options: { path?: string; maxAge?: number } = {},
): Promise<void> {
  if (typeof document === "undefined") return;
  const days = options.maxAge ? Math.round(options.maxAge / 86400) : 7;
  setClientCookie(key, value, days);
}

export async function getPreference<K extends PreferenceKey>(key: K): Promise<PreferenceValueMap[K]> {
  const definition = PREFERENCE_REGISTRY[key];
  if (typeof document === "undefined") {
    return definition.defaultValue as PreferenceValueMap[K];
  }

  const persistence = getPreferencePersistence(key);
  if (persistence !== "client-cookie" && persistence !== "server-cookie") {
    return definition.defaultValue as PreferenceValueMap[K];
  }

  const val = getClientCookie(key);
  return parsePreference(key, val ? val.trim() : undefined);
}
