import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebRtcService } from '../services/webrtc';

describe('WebRtcService.generateRoomId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a DW- code from the unambiguous alphabet', () => {
    const id = new WebRtcService().generateRoomId();

    expect(id).toMatch(/^DW-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  });

  // Room codes are the only barrier to a stranger requesting files, so they must not be predictable
  it('draws room codes from the cryptographic RNG, not Math.random', () => {
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues');
    const mathSpy = vi.spyOn(Math, 'random');

    new WebRtcService().generateRoomId();

    expect(cryptoSpy).toHaveBeenCalled();
    expect(mathSpy).not.toHaveBeenCalled();
  });
});
