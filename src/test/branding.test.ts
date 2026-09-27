import { describe, it, expect, afterEach } from 'vitest';
import indexHtml from '../../index.html?raw';
import { BRANDS, getActiveBrand } from '../branding';

/**
 * Runs the real inline boot script from index.html against an isolated document, the way a
 * browser would before the app bundle loads. `mode` stands in for Vite's %MODE% replacement.
 */
function runBootScript(hostname: string, { search = '', mode = 'production' } = {}) {
  const doc = new DOMParser().parseFromString(indexHtml.replaceAll('%MODE%', mode), 'text/html');
  // vite-plugin-pwa appends the manifest link after the inline script at build time
  const manifest = doc.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = '/manifest.webmanifest';
  doc.head.append(manifest);

  const script = Array.from(doc.querySelectorAll('script:not([src])'))
    .map((s) => s.textContent)
    .join('\n');
  const fakeWindow = { matchMedia: () => ({ matches: false }) };
  const fakeStorage = { getItem: () => null };
  new Function('window', 'document', 'location', 'localStorage', script)(
    fakeWindow,
    doc,
    { hostname, search },
    fakeStorage
  );
  return doc;
}

describe('index.html boot script brand detection', () => {
  it.each([
    ['dropto.space', 'dropto'],
    ['www.dropto.space', 'dropto'],
    ['DROPTO.SPACE', 'dropto'],
    ['dropwave.vercel.app', 'dropwave'],
    ['notdropto.space', 'dropwave'],
    ['dropto.space.evil.example', 'dropwave'],
    ['localhost', 'dropwave'],
  ])('picks the brand for %s', (hostname, expected) => {
    const doc = runBootScript(hostname);

    expect(doc.documentElement.dataset.brand).toBe(expected);
  });

  it('applies the dropto.space title, theme colour, favicon and manifest before the app loads', () => {
    const doc = runBootScript('dropto.space');

    expect(doc.title).toBe(BRANDS.dropto.title);
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(BRANDS.dropto.themeColor);
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(BRANDS.dropto.favicon);
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe(BRANDS.dropto.manifest);
  });

  it('keeps the static DropWave head in line with the DropWave brand config', () => {
    const doc = runBootScript('dropwave.vercel.app');

    expect(doc.title).toBe(BRANDS.dropwave.title);
    expect(doc.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(BRANDS.dropwave.themeColor);
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(BRANDS.dropwave.favicon);
    expect(doc.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe(BRANDS.dropwave.manifest);
  });

  it('honours ?brand= only in development builds', () => {
    expect(runBootScript('localhost', { search: '?brand=dropto', mode: 'development' }).documentElement.dataset.brand).toBe(
      'dropto'
    );
    expect(runBootScript('localhost', { search: '?brand=dropto', mode: 'production' }).documentElement.dataset.brand).toBe(
      'dropwave'
    );
  });
});

describe('getActiveBrand', () => {
  afterEach(() => {
    delete document.documentElement.dataset.brand;
  });

  it('returns the brand stamped on the document by the boot script', () => {
    document.documentElement.dataset.brand = 'dropto';

    expect(getActiveBrand()).toBe(BRANDS.dropto);
  });

  it('falls back to DropWave when no brand was stamped', () => {
    expect(getActiveBrand()).toBe(BRANDS.dropwave);
  });
});
