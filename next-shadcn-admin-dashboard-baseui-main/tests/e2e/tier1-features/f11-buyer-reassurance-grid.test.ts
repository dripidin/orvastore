import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';
import { REASSURANCE_PILLARS } from '../framework/domain-engine';

describe('Feature 11: Buyer Reassurance Grid (4 Pillars)', { tier: 'tier1', featureId: 'F11' }, () => {
  const pack1HtmlPath = path.resolve(__dirname, '../../../../pack1.html');

  it('F11-T01: Reassurance grid contains exactly 4 foundational customer peace-of-mind pillars', () => {
    expect(REASSURANCE_PILLARS.length).toBe(4);
  });

  it('F11-T02: Pillar 1 guarantees inspection before payment (المعاينة قبل الدفع)', () => {
    const p1 = REASSURANCE_PILLARS[0];
    expect(p1.titleAr).toContain('المعاينة قبل الدفع');
    expect(p1.descAr).toContain('فتح الطرد');
  });

  it('F11-T03: Pillar 2 guarantees fast reliable shipping in 24 to 48 hours (توصيل سريع وموثوق)', () => {
    const p2 = REASSURANCE_PILLARS[1];
    expect(p2.titleAr).toContain('توصيل سريع وموثوق');
    expect(p2.descAr).toContain('24 إلى 48 ساعة');
  });

  it('F11-T04: Pillar 3 guarantees safe Cash-on-Delivery with 0 DZD advance payment (الدفع الآمن عند الاستلام)', () => {
    const p3 = REASSURANCE_PILLARS[2];
    expect(p3.titleAr).toContain('الدفع الآمن عند الاستلام');
    expect(p3.descAr).toContain('لا تدفع أي سنتيم مسبقاً');
  });

  it('F11-T05: Pillar 4 guarantees dedicated Algerian customer service phone verification', () => {
    const p4 = REASSURANCE_PILLARS[3];
    expect(p4.titleAr).toContain('خدمة عملاء جزائرية');
    expect(p4.descAr).toContain('يتصل بك لتأكيد طلبك');
  });
});
