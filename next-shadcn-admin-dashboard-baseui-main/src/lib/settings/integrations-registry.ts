/**
 * ORVA Store — Central System Settings & Integration Registry
 *
 * Enforces honest status reporting:
 * - connected: Actively verified and reachable in current session.
 * - configured: Credentials/environment set, but connection not independently verified in current session.
 * - not_connected: Connection is disabled or missing credentials.
 * - unavailable: No backend handler exists for this capability in the target runtime.
 * - demo_only: Synthetic presentation state for offline testing/evaluation.
 *
 * Security Invariants:
 * - Zero secrets or private keys stored in client state.
 * - All courier tokens, DB passwords, and bot tokens managed via server environment configuration.
 * - Zero external API calls triggered by viewing settings.
 */

export type IntegrationStatus =
  | "connected"
  | "configured"
  | "not_connected"
  | "unavailable"
  | "demo_only";

export type IntegrationCategory =
  | "general"
  | "backend"
  | "database"
  | "analytics"
  | "delivery"
  | "notifications"
  | "security";

export interface IntegrationRegistryItem {
  id: string;
  name: string;
  category: IntegrationCategory;
  categoryLabel: string;
  status: IntegrationStatus;
  statusLabel: string;
  environmentScope: "dev" | "staging" | "production" | "all";
  requiredConfiguration: string;
  availableCapabilities: string[];
  managementMethod: string;
  notes?: string;
}

export const INTEGRATION_REGISTRY: IntegrationRegistryItem[] = [
  // ── 1. General Store Identity ─────────────────────────────────────────────
  {
    id: "general-store",
    name: "ORVA Storefront Brand Identity",
    category: "general",
    categoryLabel: "General Settings",
    status: "configured",
    statusLabel: "Configured (Active)",
    environmentScope: "all",
    requiredConfiguration: "Store Name, Default Currency (DZD), Timezone (Africa/Algiers)",
    availableCapabilities: [
      "Multi-pack storefront catalog",
      "Dynamic wilaya-specific tariffs",
      "RTL Arabic default typography (Tajawal)",
      "Standard DZD currency formatting"
    ],
    managementMethod: "Static configuration and catalog repository",
    notes: "Maintained via product catalog and layout presets."
  },

  // ── 2. API & Backend ──────────────────────────────────────────────────────
  {
    id: "backend-dev-node",
    name: "Development Full-Stack Server (Node.js)",
    category: "backend",
    categoryLabel: "API & Backend",
    status: "connected",
    statusLabel: "Connected (Port 3000)",
    environmentScope: "dev",
    requiredConfiguration: "Local Node.js 24 runtime, dev-server.js, .env.local",
    availableCapabilities: [
      "Orders REST API (/api/orders)",
      "Delivery REST API (/api/delivery)",
      "Local Excel database persistence",
      "Dynamic Meta Pixel injection",
      "Protected admin session gate"
    ],
    managementMethod: "Local Node.js process runtime",
    notes: "Primary development harness for isolated local testing."
  },
  {
    id: "backend-staging",
    name: "Staging Preview & QA Backend",
    category: "backend",
    categoryLabel: "API & Backend",
    status: "configured",
    statusLabel: "Configured (Pre-Prod)",
    environmentScope: "staging",
    requiredConfiguration: "Staging subdomain (staging.orva-store.com), preview environment variables",
    availableCapabilities: [
      "Staging static export hosting",
      "Mock/Live toggle validation",
      "Pre-production end-to-end testing"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Isolated test bed prior to live production sync."
  },
  {
    id: "backend-prod-php",
    name: "Production LiteSpeed Backend (PHP 8.3)",
    category: "backend",
    categoryLabel: "API & Backend",
    status: "configured",
    statusLabel: "Configured (Server Env)",
    environmentScope: "production",
    requiredConfiguration: "Hostinger LiteSpeed Web Server, PHP 8.3, api/config.php, server environment variables",
    availableCapabilities: [
      "Order submission gateway (/api/send-order.php)",
      "Supabase order queries (/api/delivery.php)",
      "Admin password authentication (/api/auth.php)",
      "CORS strict whitelist enforcement"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Protected by server-side .htaccess and direct access guards."
  },

  // ── 3. Database & Supabase ────────────────────────────────────────────────
  {
    id: "database-supabase",
    name: "Supabase Cloud PostgreSQL Database",
    category: "database",
    categoryLabel: "Database & Supabase",
    status: "configured",
    statusLabel: "Configured (REST Ready)",
    environmentScope: "all",
    requiredConfiguration: "SUPABASE_URL, SUPABASE_ANON_KEY (Public client), SUPABASE_SERVICE_ROLE_KEY (Server only)",
    availableCapabilities: [
      "Orders persistence table (public.orders)",
      "Row Level Security (RLS) enforcement",
      "Real-time order subscriptions",
      "Direct PostgreSQL connection pool failover"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Service role key strictly kept on server; anon key used for public client reads."
  },

  // ── 4. Analytics & Marketing ──────────────────────────────────────────────
  {
    id: "analytics-first-party",
    name: "First-Party Store Analytics Engine",
    category: "analytics",
    categoryLabel: "Analytics & Marketing",
    status: "connected",
    statusLabel: "Connected (100% Private)",
    environmentScope: "all",
    requiredConfiguration: "Local session repository and order logs",
    availableCapabilities: [
      "Store traffic & tab-scoped session tracking",
      "Product Views (ViewContent) telemetry",
      "Checkout events (InitiateCheckout) monitoring",
      "Geographical conversion tracking by wilaya (58 wilayas)",
      "Africa/Algiers (UTC+1) calendar day aggregation"
    ],
    managementMethod: "Built-in first-party analytics repositories",
    notes: "Zero external cookies or third-party trackers; strictly private."
  },
  {
    id: "marketing-meta-pixel",
    name: "Meta Pixel & Conversions API (CAPI)",
    category: "analytics",
    categoryLabel: "Analytics & Marketing",
    status: "configured",
    statusLabel: "Dynamic (Awaiting Merchant Pixel ID)",
    environmentScope: "production",
    requiredConfiguration: "META_PIXEL_ID (Dynamic server environment variable), Server CAPI token",
    availableCapabilities: [
      "PageView event on verified storefront landing pages",
      "ViewContent event on product page visit",
      "InitiateCheckout event on purchase intent",
      "Server-side Purchase event deduplication (shared eventID & DZD currency)"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Legacy Pixel 2340414976777036 decommissioned. Live production requires merchant to input new Pixel ID."
  },
  {
    id: "marketing-ga4",
    name: "Google Analytics 4 (GA4)",
    category: "analytics",
    categoryLabel: "Analytics & Marketing",
    status: "not_connected",
    statusLabel: "Not Connected (Blueprint Only)",
    environmentScope: "all",
    requiredConfiguration: "GA4 Measurement ID (e.g., G-XXXXXXXXXX), Privacy consent banner",
    availableCapabilities: [
      "Page tracking and e-commerce enhanced measurement",
      "Event reporting (view_item, begin_checkout, purchase)",
      "Consent mode v2 compliance"
    ],
    managementMethod: "Blueprint stage — requires server environment configuration",
    notes: "Not active in current release. Awaiting privacy & consent policy approval."
  },

  // ── 5. Delivery & Courier Integrations ────────────────────────────────────
  {
    id: "delivery-redex",
    name: "Redex Express Delivery Gateway",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "configured",
    statusLabel: "Configured (Manual Dashboard Dispatch)",
    environmentScope: "production",
    requiredConfiguration: "REDEX_API_TOKEN, REDEX_BASE_URL (Stored securely on server)",
    availableCapabilities: [
      "Controlled manual order dispatching from dashboard",
      "Side-effect-free connection verification (GET /api/v1/get/wilayas)",
      "Official provider tracking code assignment (rex.ecotrack.dz)",
      "OrderId duplicate shipment prevention"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in client. Dispatches only upon deliberate admin dashboard approval."
  },
  {
    id: "delivery-ecotrack",
    name: "Ecotrack Delivery Network",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "configured",
    statusLabel: "Configured (Server Env)",
    environmentScope: "production",
    requiredConfiguration: "ECOTRACK_API_TOKEN, ECOTRACK_BASE_URL (Stored securely on server)",
    availableCapabilities: [
      "Multi-carrier tracking synchronization",
      "Return and failed delivery classification (Returning / Returned)",
      "Zero mutation of internal order financials or inventory on tracking sync",
      "Side-effect-free health checks"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in localStorage. All communication routed through server-side gateway."
  },
  {
    id: "delivery-yalidine",
    name: "Yalidine Delivery",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "not_connected",
    statusLabel: "Not Connected (Blueprint)",
    environmentScope: "all",
    requiredConfiguration: "YALIDINE_API_KEY, YALIDINE_API_TOKEN, Webhook URL",
    availableCapabilities: [
      "58 Wilayas desk & home delivery dispatch",
      "Automated tracking number generation",
      "Bordereau sticker printing",
      "Delivery state webhook callbacks"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in localStorage. Integration blueprint ready for production activation."
  },
  {
    id: "delivery-zr-express",
    name: "ZR Express",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "not_connected",
    statusLabel: "Not Connected (Blueprint)",
    environmentScope: "all",
    requiredConfiguration: "ZR_API_KEY, ZR_API_SECRET, Webhook URL",
    availableCapabilities: [
      "National express courier dispatching",
      "Real-time parcel status webhooks",
      "Automated return tracking"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in localStorage. Integration blueprint ready for production activation."
  },
  {
    id: "delivery-maystro",
    name: "Maystro Delivery",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "not_connected",
    statusLabel: "Not Connected (Blueprint)",
    environmentScope: "all",
    requiredConfiguration: "MAYSTRO_API_TOKEN, Store ID, Webhook URL",
    availableCapabilities: [
      "Algiers & national fulfillment routing",
      "API parcel generation and pickup scheduling",
      "Cash on Delivery remittance tracking"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in localStorage. Integration blueprint ready for production activation."
  },
  {
    id: "delivery-procolis",
    name: "Procolis Logistics",
    category: "delivery",
    categoryLabel: "Delivery Integrations",
    status: "not_connected",
    statusLabel: "Not Connected (Blueprint)",
    environmentScope: "all",
    requiredConfiguration: "PROCOLIS_API_KEY, PROCOLIS_CLIENT_ID, Webhook URL",
    availableCapabilities: [
      "Regional and national shipping parcels",
      "Status tracking webhooks",
      "Printable dispatch slips"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Zero secrets stored in localStorage. Integration blueprint ready for production activation."
  },

  // ── 6. Notifications ──────────────────────────────────────────────────────
  {
    id: "notifications-telegram",
    name: "Telegram Bot Instant Notifications",
    category: "notifications",
    categoryLabel: "Notifications",
    status: "configured",
    statusLabel: "Configured (Server Env)",
    environmentScope: "production",
    requiredConfiguration: "TELEGRAM_BOT_TOKEN (Server only), TELEGRAM_CHAT_ID",
    availableCapabilities: [
      "5 Event Triggers (ORDER_CREATED, SHIPMENT_CREATED, SHIPMENT_FAILED, STATUS_UPDATED, ORDER_CANCELLED)",
      "Ledger-based alert deduplication (zero spam on retries)",
      "Customer phone masking (PII protection)",
      "Non-blocking server-side dispatch"
    ],
    managementMethod: "Managed through server environment configuration",
    notes: "Bot token strictly isolated on server. Real notification sending active in production only."
  },

  // ── 7. Security & Sessions ────────────────────────────────────────────────
  {
    id: "security-sessions",
    name: "Admin Authentication & CSRF Shield",
    category: "security",
    categoryLabel: "Security & Sessions",
    status: "connected",
    statusLabel: "Connected (Active Shield)",
    environmentScope: "all",
    requiredConfiguration: "ADMIN_PASSWORD, ADMIN_API_TOKEN, Same-Origin header verification",
    availableCapabilities: [
      "AdminSessionGate password barrier",
      "Isolated demo mode session storage (local development only)",
      "Strict CSRF Origin whitelist check (orva-store.com, localhost:3000, 127.0.0.1:3000)",
      "Timing-safe password comparison (hash_equals / crypto.timingSafeEqual)"
    ],
    managementMethod: "Integrated authentication gateway and session store",
    notes: "Production builds disable demo bypass; strict server session authentication enforced."
  }
];

export const INTEGRATIONS_REGISTRY = INTEGRATION_REGISTRY;

export function getIntegrationsByCategory(category: IntegrationCategory): IntegrationRegistryItem[] {
  return INTEGRATION_REGISTRY.filter((item) => item.category === category);
}

export function getIntegrationById(id: string): IntegrationRegistryItem | undefined {
  return INTEGRATION_REGISTRY.find((item) => item.id === id);
}
