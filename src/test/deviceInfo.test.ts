import { describe, it, expect } from 'vitest';
import { describeDevice, describePeer, placeFromTimeZone } from '../utils/deviceInfo';

describe('describeDevice', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
      'Samsung Internet on Android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Chrome on ChromeOS',
    ],
  ])('names the browser and system for %s', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it('names just the system when the browser is unknown', () => {
    expect(describeDevice('SomeBot/1.0 (Windows NT 10.0)')).toBe('Windows device');
  });

  it('gives up on user agents it cannot read', () => {
    expect(describeDevice('curl/8.0')).toBeNull();
  });
});

describe('placeFromTimeZone', () => {
  it.each([
    ['Europe/Stockholm', 'Stockholm'],
    ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
    ['America/New_York', 'New York'],
  ])('turns %s into a city name', (timeZone, expected) => {
    expect(placeFromTimeZone(timeZone)).toBe(expected);
  });

  it('shows nothing for zones that are not places', () => {
    expect(placeFromTimeZone('UTC')).toBeNull();
    expect(placeFromTimeZone('Etc/GMT+2')).toBeNull();
    expect(placeFromTimeZone(null)).toBeNull();
  });
});

describe('describePeer', () => {
  it('names the device and lists the address and place', () => {
    expect(describePeer({ device: 'Chrome on Android', timeZone: 'Europe/Stockholm', ip: '203.0.113.7' })).toEqual({
      name: 'Chrome on Android',
      meta: '203.0.113.7 · Stockholm',
    });
  });

  it('still reads well with nothing known', () => {
    expect(describePeer({ device: null, timeZone: null, ip: null })).toEqual({ name: 'Unknown device', meta: null });
  });
});
