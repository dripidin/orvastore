import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  buildFbcFromFbclid,
  parseAttributionFromUrl,
  resolveAttributionSource,
} from '../../src/lib/analytics/attribution-tracker';
import { computeCampaignProfitability } from '../../src/lib/analytics/campaign-profitability';
import { normalizeOrvaOrder } from '../../src/lib/orva-api';
import { submitCodOrderAction } from '../../src/app/actions/checkout';
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from '../../src/lib/supabase/server';

async function runTests() {
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${passed.toString().padStart(2, '0')}: ${label}`);
  }

  console.log('── 1. URL & Cookie Attribution Parsing ──');
  const metaParsed = parseAttributionFromUrl(
    '?utm_source=facebook&utm_medium=paid&utm_campaign=ramadan_pack1&fb_campaign_id=12029988&fb_adset_id=12027766&fb_ad_id=12025544&fbclid=IwAR_test_click_123'
  );
  verify(Boolean(metaParsed), 'Parses Meta Ads attribution URL');
  verify(metaParsed?.fbCampaignId === '12029988', 'Captures fb_campaign_id');
  verify(metaParsed?.fbAdsetId === '12027766', 'Captures fb_adset_id');
  verify(metaParsed?.fbAdId === '12025544', 'Captures fb_ad_id');
  verify(metaParsed?.fbclid === 'IwAR_test_click_123', 'Captures fbclid');
  verify(metaParsed?.utmCampaign === 'ramadan_pack1', 'Captures utm_campaign');
  verify(metaParsed?.attributionSource === 'facebook_ads', 'Infers attribution_source=facebook_ads');

  const unreplacedTemplate = parseAttributionFromUrl(
    '?utm_source=facebook&fb_campaign_id={{campaign.id}}&fbclid=click_from_cookie'
  );
  verify(unreplacedTemplate?.fbCampaignId === undefined, 'Ignores unreplaced Meta {{campaign.id}} macro');

  const fbcCookieParsed = parseAttributionFromUrl('?utm_source=tiktok&utm_campaign=tt_launch', {
    cookieString: '_fbp=fb.1.100.200; _fbc=fb.1.1700000000.IwAR_cookie_val',
  });
  verify(fbcCookieParsed?.fbclid === 'IwAR_cookie_val', 'Extracts fbclid from _fbc cookie');
  verify(fbcCookieParsed?.attributionSource === 'tiktok_ads', 'Infers attribution_source=tiktok_ads');

  verify(
    resolveAttributionSource({ referrer: 'https://l.instagram.com/' }) === 'instagram_organic',
    'Infers instagram_organic from referrer'
  );
  verify(
    buildFbcFromFbclid('IwAR123', 1700000000000) === 'fb.1.1700000000000.IwAR123',
    'Formats Meta CAPI fbc from raw fbclid'
  );

  console.log('\n── 2. Checkout Persistence & Pre-Migration Metadata Fallback ──');
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_id TEXT UNIQUE,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT,
      fb_campaign_id TEXT,
      fb_adset_id TEXT,
      fb_ad_id TEXT,
      fbclid TEXT,
      utm_campaign TEXT,
      attribution_source TEXT,
      redex_tracking_id TEXT,
      metadata TEXT,
      created_at TEXT
    );
  `);

  let sawAttributionColumnsOnFirstAttempt = false;
  let simulateMissingColumns = true;

  __testSetSupabaseServerInstance({
    from(table: string) {
      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { base_price: 4950, status: 'PUBLISHED', metadata: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table !== 'orders') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      }
      return {
        select() {
          return {
            eq(_col: string, val: string) {
              return {
                async maybeSingle() {
                  const row = db
                    .prepare('SELECT id, order_id, payload_hash, created_at FROM orders WHERE idempotency_key = ?')
                    .get(val) as any;
                  return { data: row || null, error: null };
                },
              };
            },
          };
        },
        insert(payload: Record<string, any>) {
          return {
            select() {
              return {
                async single() {
                  if (simulateMissingColumns && 'fb_campaign_id' in payload) {
                    sawAttributionColumnsOnFirstAttempt = true;
                    return {
                      data: null,
                      error: {
                        code: 'PGRST204',
                        message: "Could not find the 'fb_campaign_id' column of 'orders' in the schema cache",
                      },
                    };
                  }
                  const id = crypto.randomUUID();
                  db.prepare(
                    `INSERT INTO orders (
                      id, order_id, idempotency_key, payload_hash,
                      fb_campaign_id, fb_adset_id, fb_ad_id, fbclid,
                      utm_campaign, attribution_source, redex_tracking_id,
                      metadata, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                  ).run(
                    id,
                    payload.order_id,
                    payload.idempotency_key ?? null,
                    payload.payload_hash ?? null,
                    payload.fb_campaign_id ?? null,
                    payload.fb_adset_id ?? null,
                    payload.fb_ad_id ?? null,
                    payload.fbclid ?? null,
                    payload.utm_campaign ?? null,
                    payload.attribution_source ?? null,
                    payload.redex_tracking_id ?? null,
                    JSON.stringify(payload.metadata ?? {}),
                    new Date().toISOString()
                  );
                  return { data: { id, order_id: payload.order_id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  });

  const origNodeEnv = process.env.NODE_ENV;
  const origSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  (process.env as any).NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';

  try {
    const res = await submitCodOrderAction({
      customerName: 'Amine Benali',
      customerPhone: '0551122334',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Rue Didouche Mourad 12',
      packId: 'PACK1',
      productName: 'Pack 1 Pro',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
      idempotencyKey: 'attr-test-key-1234567890',
      fbCampaignId: '12029988',
      fbAdsetId: '12027766',
      fbAdId: '12025544',
      fbclid: 'IwAR_test_click_123',
      utmCampaign: 'ramadan_pack1',
      attributionSource: 'facebook_ads',
    });

    verify(res.success === true, 'Checkout succeeds gracefully even before SQL migration is run');
    verify(sawAttributionColumnsOnFirstAttempt, 'Attempts dedicated attribution columns insert first');

    const storedRow = db.prepare('SELECT order_id, metadata FROM orders LIMIT 1').get() as any;
    const storedMeta = JSON.parse(storedRow.metadata);
    verify(
      storedMeta?.attribution?.fb_campaign_id === '12029988' &&
        storedMeta?.attribution?.fb_adset_id === '12027766' &&
        storedMeta?.attribution?.fb_ad_id === '12025544' &&
        storedMeta?.attribution?.fbclid === 'IwAR_test_click_123' &&
        storedMeta?.attribution?.utm_campaign === 'ramadan_pack1' &&
        storedMeta?.attribution?.attribution_source === 'facebook_ads',
      'Preserves all attribution fields in metadata.attribution when columns are missing'
    );

    // Post-migration path: dedicated SQL columns present
    simulateMissingColumns = false;
    const postMigRes = await submitCodOrderAction({
      customerName: 'Samira Khelifi',
      customerPhone: '0661122335',
      wilayaCode: 31,
      wilayaName: 'Oran',
      communeName: 'Oran',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Hai Es Salam',
      packId: 'PACK1',
      productName: 'Pack 1 Pro',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
      idempotencyKey: 'attr-test-postmig-123456789',
      fbCampaignId: '998877',
      fbAdsetId: '665544',
      fbAdId: '332211',
      fbclid: 'IwAR_post_mig',
      utmCampaign: 'oran_promo',
      attributionSource: 'facebook_ads',
    });
    verify(postMigRes.success === true, 'Post-migration checkout with dedicated SQL columns succeeds');
    const postMigRow = db
      .prepare('SELECT fb_campaign_id, fb_adset_id, fb_ad_id, fbclid, utm_campaign, attribution_source FROM orders WHERE idempotency_key = ?')
      .get('attr-test-postmig-123456789') as any;
    verify(
      postMigRow?.fb_campaign_id === '998877' &&
        postMigRow?.fb_adset_id === '665544' &&
        postMigRow?.fb_ad_id === '332211' &&
        postMigRow?.fbclid === 'IwAR_post_mig' &&
        postMigRow?.utm_campaign === 'oran_promo' &&
        postMigRow?.attribution_source === 'facebook_ads',
      'Writes all 6 attribution fields directly into dedicated SQL columns'
    );
  } finally {
    __testResetSupabaseServerInstance();
    (process.env as any).NODE_ENV = origNodeEnv;
    if (origSupaUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = origSupaUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  console.log('\n── 3. Order Normalization & Campaign Profitability Calculation ──');
  const normFromMeta = normalizeOrvaOrder({
    order_id: 'PACK1-100001',
    status: 'delivered',
    priceNum: 4950,
    shippingFee: '500 د.ج',
    grandTotal: '5450 د.ج',
    redex_tracking_code: 'EC123456',
    metadata: {
      attribution: {
        fb_campaign_id: 'CMP-1',
        fb_adset_id: 'SET-1',
        fb_ad_id: 'AD-1',
        fbclid: 'FB-CLK-1',
        utm_campaign: 'promo_dz',
        attribution_source: 'facebook_ads',
      },
    },
  });
  verify(normFromMeta !== null, 'Normalizes order from metadata fallback');
  verify(normFromMeta?.fbCampaignId === 'CMP-1', 'Reads fbCampaignId from metadata fallback');
  verify(normFromMeta?.redexTrackingId === 'EC123456', 'Syncs redexTrackingId from redex_tracking_code');

  const orders = [
    normFromMeta!,
    normalizeOrvaOrder({
      order_id: 'PACK1-100002',
      status: 'delivered',
      priceNum: 4950,
      shippingFee: '500 د.ج',
      grandTotal: '5450 د.ج',
      redex_tracking_id: 'EC123457',
      fb_campaign_id: 'CMP-1',
      fb_adset_id: 'SET-2',
      fb_ad_id: 'AD-2',
      utm_campaign: 'promo_dz',
      attribution_source: 'facebook_ads',
    })!,
    normalizeOrvaOrder({
      order_id: 'PACK1-100003',
      status: 'returned',
      priceNum: 4950,
      shippingFee: '500 د.ج',
      grandTotal: '5450 د.ج',
      redex_tracking_id: 'EC123458',
      fb_campaign_id: 'CMP-1',
      utm_campaign: 'promo_dz',
      attribution_source: 'facebook_ads',
    })!,
  ];

  const profitRows = computeCampaignProfitability(
    orders,
    { 'fb:CMP-1': { adSpendDzd: 2500 } },
    { unitCogsDzd: 2000, returnShippingLossDzd: 450 }
  );

  verify(profitRows.length === 1, 'Groups orders accurately under fb:CMP-1');
  const row = profitRows[0];
  verify(row.totalOrders === 3 && row.redexMatchedOrders === 3, 'Counts 3 total and 3 Redex-matched orders');
  verify(row.deliveredOrders === 2 && row.returnedOrders === 1, 'Counts 2 delivered & 1 returned');
  verify(row.deliveryRatePct === 67, 'Computes 67% delivery rate');
  verify(row.deliveredProductRevenueDzd === 9900, 'Computes 9900 DZD delivered product revenue');
  // Net profit = 9900 - (2 * 2000) - (1 * 450) - 2500 = 9900 - 4000 - 450 - 2500 = 2950
  verify(row.netProfitDzd === 2950, 'Computes 2950 DZD net profit accurately');
  verify(row.roas === 3.96, 'Computes 3.96x ROAS accurately');

  console.log(`\n✅ All ${passed} attribution & profitability assertions passed!`);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
