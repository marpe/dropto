import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatSpeed } from '../utils/format';

describe('format utilities', () => {
  it('formats bytes accurately up to 10GB and beyond', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(10737418240)).toBe('10 GB'); // 10 GB
    expect(formatBytes(107374182400)).toBe('100 GB'); // 100 GB
  });

  it('formats speeds accurately', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(1024 * 1024 * 45.5)).toBe('45.5 MB/s');
  });

  it('formats durations in human readable time', () => {
    expect(formatDuration(0)).toBe('--');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(135)).toBe('2m 15s');
    expect(formatDuration(3665)).toBe('1h 1m 5s');
  });
});
