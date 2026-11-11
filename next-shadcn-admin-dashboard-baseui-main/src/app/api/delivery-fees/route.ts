import { NextRequest, NextResponse } from 'next/server';

import { verifyAdminSession } from '@/lib/auth/admin-auth';
import { getDeliveryFees } from '@/lib/delivery-fees';

export const dynamic = 'force-dynamic';

/** Public: storefront needs live tariffs for checkout (read-only, cached 24h). */
export async function GET() {
  const result = await getDeliveryFees(false);
  return NextResponse.json(result);
}

/** Admin: force a refresh from EcoTrack. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const result = await getDeliveryFees(true);
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}

