/**
 * ORVA Store — Demo Environment & Staging Guard
 * 
 * Rules:
 * 1. Demo Mode is allowed in local development (process.env.NODE_ENV === "development").
 * 2. Demo Mode is allowed on local development hosts (localhost, 127.0.0.1, 0.0.0.0).
 * 3. Demo Mode is allowed in an isolated staging environment IF AND ONLY IF the non-secret
 *    environment variable NEXT_PUBLIC_ALLOW_DEMO_MODE === "true" is explicitly configured.
 * 4. Demo Mode is STRICTLY FORBIDDEN by default in production builds on live domains.
 */

export function isDemoModeAllowed(): boolean {
  // 1. Explicit staging/testing build flag
  if (
    typeof process !== "undefined" &&
    (process.env?.NEXT_PUBLIC_ALLOW_DEMO_MODE === "true" || process.env?.NODE_ENV === "test")
  ) {
    return true;
  }

  // 2. Development mode
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "development"
  ) {
    return true;
  }

  // 3. Localhost and local test IP inspection in browser
  if (typeof window !== "undefined" && window.location) {
    const hostname = (window.location.hostname || "").toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local")
    ) {
      return true;
    }
  }

  return false;
}
