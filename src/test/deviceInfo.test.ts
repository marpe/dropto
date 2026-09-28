import { describe, it, expect } from 'vitest';
import { describeDevice, describeFormFactor, describePeer, placeFromTimeZone } from '../utils/deviceInfo';

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
  it('splits the browser from the system and labels the time zone', () => {
    expect(describePeer({ device: 'Chrome on Android', timeZone: 'Europe/Stockholm', ip: '203.0.113.7' })).toEqual({
      browser: 'Chrome',
      name: 'Android',
      meta: '203.0.113.7 · Time zone: Stockholm',
    });
  });

  it('keeps a device without a known browser as its name', () => {
    expect(describePeer({ device: 'Android device', timeZone: null, ip: null })).toEqual({
      browser: null,
      name: 'Android device',
      meta: null,
    });
  });

  it('still reads well with nothing known', () => {
    expect(describePeer({ device: null, timeZone: null, ip: null })).toEqual({ browser: null, name: 'Unknown device', meta: null });
  });

  it('adds the model to the system, and says when the connection goes through a relay', () => {
    expect(
      describePeer({ device: 'Chrome on Android', timeZone: null, ip: null, model: 'Pixel 8', route: 'relayed' })
    ).toEqual({ browser: 'Chrome', name: 'Android · Pixel 8', meta: 'Relayed' });
  });
});

describe('describeFormFactor', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36', 0, 'phone'],
    ['Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 0, 'tablet'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5, 'phone'],
    // iPadOS asks for desktop sites and says it is a Mac; only the touch screen tells
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 5, 'tablet'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 0, 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 0, 'desktop'],
  ] as const)('%s with %i touch points is a %s', (userAgent, maxTouchPoints, expected) => {
    expect(describeFormFactor(userAgent, maxTouchPoints)).toBe(expected);
  });
});
