import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatModified, formatSpeed } from '../utils/format';

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

describe('formatModified', () => {
  const now = new Date(2026, 8, 28, 15, 0).getTime();

  it('shows the time for files changed today', () => {
    expect(formatModified(new Date(2026, 8, 28, 9, 5).getTime(), now, 'en-GB')).toBe('09:05');
  });

  it('shows day and month for earlier this year', () => {
    expect(formatModified(new Date(2026, 2, 12).getTime(), now, 'en-GB')).toBe('12 Mar');
  });

  it('adds the year for older files', () => {
    expect(formatModified(new Date(2024, 2, 12).getTime(), now, 'en-GB')).toBe('12 Mar 2024');
  });

  it('shows nothing when the date is unknown', () => {
    expect(formatModified(undefined, now)).toBe('');
  });
});
