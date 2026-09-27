import type { Brand, BrandId } from './types/branding';

/**
 * Per-domain branding. The brand is detected once by the boot script in index.html (which
 * stamps `data-brand` on <html> before first paint); keep the titles, colours and asset paths
 * there in sync with this table — branding.test.ts fails if they drift.
 * Brand colour scales live in index.css as CSS variables keyed on `data-brand`.
 */
export const BRANDS: Record<BrandId, Brand> = {
  dropwave: {
    id: 'dropwave',
    name: 'DropWave',
    title: 'DropWave — 10GB P2P WebRTC Transfer',
    badge: '10GB P2P',
    roomPrefix: 'DW',
    themeColor: '#3ECF8E',
    favicon: '/favicon.svg',
    manifest: '/manifest.webmanifest',
    confettiColors: ['#3ECF8E', '#24b47e', '#52d69b', '#ffffff', '#ffd700'],
  },
  dropto: {
    id: 'dropto',
    name: 'dropto.space',
    title: 'dropto.space — 10GB P2P WebRTC Transfer',
    badge: '10GB P2P',
    roomPrefix: 'DT',
    themeColor: '#F97316',
    favicon: '/favicon-dropto.svg',
    manifest: '/manifest-dropto.webmanifest',
    confettiColors: ['#F97316', '#ea580c', '#fb923c', '#ffffff', '#fde047'],
  },
};

function isBrandId(value: string | undefined): value is BrandId {
  return value !== undefined && value in BRANDS;
}

export function getActiveBrand(): Brand {
  const id = typeof document === 'undefined' ? undefined : document.documentElement.dataset.brand;
  return isBrandId(id) ? BRANDS[id] : BRANDS.dropwave;
}
