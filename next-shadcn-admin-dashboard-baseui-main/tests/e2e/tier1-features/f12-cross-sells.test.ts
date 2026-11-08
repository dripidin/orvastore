import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, resolveProjectPath } from '../framework/test-suite';
import { CROSS_SELL_MAP } from '../framework/domain-engine';

describe('Feature 12: Inter-Pack Cross-Sells', { tier: 'tier1', featureId: 'F12' }, () => {
  const pack1HtmlPath = resolveProjectPath('pack1.html');
  const pack2HtmlPath = resolveProjectPath('pack2.html');
  const pack3HtmlPath = resolveProjectPath('pack3.html');

  it('F12-T01: Pack 1 page presents cross-sell recommendation for Pack 2', () => {
    expect(CROSS_SELL_MAP.PACK1.targetPackId).toBe('PACK2');
    expect(CROSS_SELL_MAP.PACK1.targetUrl).toBe('/pack2');
    const html = fs.readFileSync(pack1HtmlPath, 'utf8');
    expect(html).toContain('pack2.html');
  });

  it('F12-T02: Pack 2 page presents cross-sell recommendation for Pack 3', () => {
    expect(CROSS_SELL_MAP.PACK2.targetPackId).toBe('PACK3');
    expect(CROSS_SELL_MAP.PACK2.targetUrl).toBe('/pack3');
    const html = fs.readFileSync(pack2HtmlPath, 'utf8');
    expect(html).toContain('pack3.html');
  });

  it('F12-T03: Pack 3 page presents cross-sell recommendation for Pack 2', () => {
    expect(CROSS_SELL_MAP.PACK3.targetPackId).toBe('PACK2');
    expect(CROSS_SELL_MAP.PACK3.targetUrl).toBe('/pack2');
    const html = fs.readFileSync(pack3HtmlPath, 'utf8');
    expect(html).toContain('pack2.html');
  });

  it('F12-T04: Cross-sell recommendation cards provide direct call-to-action button with arrow', () => {
    const html1 = fs.readFileSync(pack1HtmlPath, 'utf8');
    expect(html1).toContain('cross-sell-btn');
    expect(html1).toContain('fa-arrow-left');
  });

  it('F12-T05: Cross-sell recommendation cards display descriptive preview and target price', () => {
    const html1 = fs.readFileSync(pack1HtmlPath, 'utf8');
    expect(html1).toContain('cross-sell-price');
    expect(html1).toContain('cross-sell-title');
  });
});
