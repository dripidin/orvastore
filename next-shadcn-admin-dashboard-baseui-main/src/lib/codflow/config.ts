/**
 * CodFlow integration — static configuration (Phase 0).
 *
 * Only `NEXT_PUBLIC_*` values are inlined into the static export. The CodFlow
 * API key is deliberately absent here; it lives in the server-side PHP bridge.
 */

const DEFAULT_BRIDGE_PATH = "/api/codflow";

function normalizeBridgePath(value: string | undefined): string {
  const trimmed = value?.trim();
  const chosen = trimmed && trimmed.length > 0 ? trimmed : DEFAULT_BRIDGE_PATH;
  return chosen.replace(/\/+$/, "");
}

/**
 * Same-origin bridge path in production. In local Next.js dev (port 3000),
 * set NEXT_PUBLIC_CODFLOW_BRIDGE_PATH=http://localhost:8080/api/codflow so the
 * browser talks to the PHP dev server directly.
 */
export const CODFLOW_BRIDGE_PATH = normalizeBridgePath(process.env.NEXT_PUBLIC_CODFLOW_BRIDGE_PATH);

/** Client-side ceiling. The bridge's own upstream timeout defaults to 20s. */
export const CODFLOW_CLIENT_TIMEOUT_MS = 25_000;

/** Runtime flags are cached for 60 seconds, matching the bridge rollback window. */
export const CODFLOW_FLAGS_TTL_MS = 60_000;

export const CODFLOW_FLAGS_PATH = "/__flags";
export const CODFLOW_HEALTH_PATH = "/__health";
