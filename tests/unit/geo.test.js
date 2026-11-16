import { describe, it, expect } from 'vitest';
import { distanceFt, areaSqFt, measureValue, formatMeasure } from '../../src/measure/geo.js';

describe('measure geometry', () => {
  it('one degree of longitude on the equator is 364,813 ft within 1%', () => {
    const d = distanceFt([[0, 0], [1, 0]]);
    expect(d).toBeGreaterThanOrEqual(361165);
    expect(d).toBeLessThanOrEqual(368461);
  });

  it('a 0.01° by 0.01° square at 37.6° N has the right area within 1%', () => {
    const lat = 37.6, lon = -122;
    const ring = [[lon, lat], [lon + 0.01, lat], [lon + 0.01, lat + 0.01], [lon, lat + 0.01]];
    const expected = (0.01 * 364813) * (0.01 * 364813 * Math.cos((37.6 * Math.PI) / 180));
    expect(Math.abs(areaSqFt(ring) - expected) / expected).toBeLessThan(0.01);
  });

  it('0 points, 1 point and a repeated point all give 0, never NaN', () => {
    for (const c of [[], [[-122, 37.6]], [[-122, 37.6], [-122, 37.6]]]) {
      expect(distanceFt(c)).toBe(0);
      expect(areaSqFt(c)).toBe(0);
    }
    expect(areaSqFt([[-122, 37.6], [-122.001, 37.6]])).toBe(0);
  });

  it("units: 'm' gives metres", () => {
    const m = measureValue([[0, 0], [1, 0]], 'distance', 'm');
    expect(Math.abs(m - 111195) / 111195).toBeLessThan(0.01);
    const ring = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001]];
    expect(measureValue(ring, 'area', 'm')).toBeCloseTo(areaSqFt(ring) * 0.09290304, 0);
  });

  it('the readout shows feet, square feet, and acres above 1 acre', () => {
    expect(formatMeasure(1234.4, 'distance', 'ft')).toBe('1,234 ft');
    expect(formatMeasure(12000, 'distance', 'ft')).toBe('12,000 ft (2.27 mi)');
    expect(formatMeasure(40000, 'area', 'ft')).toBe('40,000 sq ft');
    expect(formatMeasure(87120, 'area', 'ft')).toBe('2.00 acres');
    expect(formatMeasure(64.2, 'width', 'ft')).toBe('64 ft');
    expect(formatMeasure(19.6, 'distance', 'm')).toBe('20 m');
  });
});
