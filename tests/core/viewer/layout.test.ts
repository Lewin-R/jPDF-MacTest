import { describe, it, expect } from 'vitest';
import {
  computeLayout, visibleRange, pageAt, clampScale, fitWidthScale, zoomAround,
  contentWidth, pageLeft, PAGE_GAP,
} from '../../../src/core/viewer/layout';

const two = [{ width: 600, height: 800 }, { width: 600, height: 800 }];

describe('computeLayout', () => {
  it('stacks pages with gaps', () => {
    const l = computeLayout(two, 1);
    expect(l.tops).toEqual([16, 832]);
    expect(l.totalHeight).toBe(1648);
    expect(l.maxWidth).toBe(600);
  });
  it('scales', () => {
    const l = computeLayout(two, 0.5);
    expect(l.tops).toEqual([16, 432]);
    expect(l.heights).toEqual([400, 400]);
  });
  it('respects rotated page sizes', () => {
    const l = computeLayout([{ width: 842, height: 595 }], 1);
    expect(l.heights[0]).toBe(595);
    expect(l.widths[0]).toBe(842);
  });
  it('handles zero pages', () => {
    const l = computeLayout([], 1);
    expect(l.tops).toEqual([]);
    expect(visibleRange(l, 0, 500)).toEqual({ first: 0, last: -1 });
    expect(pageAt(l, 100)).toBe(0);
  });
});

describe('visibleRange', () => {
  const l = computeLayout(two, 1);
  it('overscan 0', () => expect(visibleRange(l, 900, 500, 0)).toEqual({ first: 1, last: 1 }));
  it('overscan 1', () => expect(visibleRange(l, 900, 500, 1)).toEqual({ first: 0, last: 1 }));
  it('clamps at the ends', () => {
    expect(visibleRange(l, 0, 100, 5)).toEqual({ first: 0, last: 1 });
  });
});

describe('pageAt', () => {
  const l = computeLayout(two, 1);
  it('finds pages incl. half gaps', () => {
    expect(pageAt(l, 0)).toBe(0);
    expect(pageAt(l, 500)).toBe(0);
    expect(pageAt(l, 819)).toBe(0);
    expect(pageAt(l, 825)).toBe(1);
    expect(pageAt(l, 99999)).toBe(1);
    expect(pageAt(l, -50)).toBe(0);
  });
});

describe('scale helpers', () => {
  it('clampScale', () => {
    expect(clampScale(20)).toBe(8);
    expect(clampScale(0.01)).toBe(0.1);
    expect(clampScale(1.5)).toBe(1.5);
  });
  it('fitWidthScale', () => {
    expect(fitWidthScale(600, 1232)).toBe(2);
    expect(fitWidthScale(600, 10)).toBe(0.1);
  });
});

describe('horizontal geometry', () => {
  it('centres pages', () => {
    const l = computeLayout([{ width: 600, height: 800 }, { width: 400, height: 800 }], 1);
    expect(contentWidth(l, 1000)).toBe(1000);
    expect(contentWidth(l, 300)).toBe(632);
    expect(pageLeft(l, 0, 1000)).toBe(200);
    expect(pageLeft(l, 1, 1000)).toBe(300);
  });
});

describe('zoomAround', () => {
  const sizes = [{ width: 600, height: 800 }, { width: 600, height: 800 }, { width: 600, height: 800 }];
  function docPoint(s: number, scroll: { top: number; left: number }, a: { x: number; y: number }, cw: number) {
    const l = computeLayout(sizes, s);
    const cy = scroll.top + a.y, cx = scroll.left + a.x;
    const i = pageAt(l, cy);
    return { i, y: (cy - l.tops[i]) / s, x: (cx - pageLeft(l, i, cw)) / s };
  }
  it('keeps the point under the anchor fixed', () => {
    const cw = 1000, a = { x: 500, y: 100 };
    const s0 = 1, s1 = 2;
    const before = docPoint(s0, { top: 0, left: 0 }, a, cw);
    const r = zoomAround(computeLayout(sizes, s0), computeLayout(sizes, s1), s0, s1, a, { top: 0, left: 0 }, cw);
    const after = docPoint(s1, r, a, cw);
    expect(after.i).toBe(before.i);
    expect(Math.abs(after.y - before.y) * s1).toBeLessThan(0.5);
    expect(Math.abs(after.x - before.x) * s1).toBeLessThan(0.5);
  });
  it('works mid-document and when zooming out', () => {
    const cw = 800, a = { x: 400, y: 300 }, scroll = { top: 1500, left: 0 };
    const s0 = 2, s1 = 0.5;
    const before = docPoint(s0, scroll, a, cw);
    const r = zoomAround(computeLayout(sizes, s0), computeLayout(sizes, s1), s0, s1, a, scroll, cw);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left).toBeGreaterThanOrEqual(0);
    const after = docPoint(s1, r, a, cw);
    if (r.top > 0) expect(Math.abs(after.y - before.y) * s1).toBeLessThan(0.5);
  });
  it('clamps negative scroll to 0', () => {
    const l0 = computeLayout(sizes, 2), l1 = computeLayout(sizes, 1);
    const r = zoomAround(l0, l1, 2, 1, { x: 0, y: 0 }, { top: 0, left: 0 }, 1000);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.left).toBeGreaterThanOrEqual(0);
  });
  it('exports PAGE_GAP', () => expect(PAGE_GAP).toBe(16));
});
