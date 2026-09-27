import { describe, it, expect } from 'vitest';
import indexHtml from '../../index.html?raw';
import vercelConfig from '../../vercel.json?raw';

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('Content-Security-Policy', () => {
  // Editing the inline boot script changes its hash; a stale hash would block it once CSP is enforced
  it('allows the inline boot script exactly as the production build emits it', async () => {
    const productionHtml = indexHtml.replaceAll('%MODE%', 'production');
    const inlineScripts = Array.from(productionHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g), (m) => m[1]);
    const policy: string = JSON.parse(vercelConfig)
      .headers.flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers)
      .find((header: { key: string }) => header.key.startsWith('Content-Security-Policy')).value;

    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const script of inlineScripts) {
      expect(policy).toContain(`'sha256-${await sha256Base64(script)}'`);
    }
  });
});
