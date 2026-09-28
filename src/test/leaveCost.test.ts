import { describe, it, expect } from 'vitest';
import { describeLeaveCost } from '../hooks/leaveCost';
import type { ReceiverStage, SenderReceiver } from '../types/sharing';

const receiver = (stage: ReceiverStage): SenderReceiver => ({
  peerId: `peer-${stage}`,
  details: { device: null, timeZone: null, ip: null },
  stage,
  idleSinceMs: null,
  hasLeft: false,
  downloadFiles: [],
  sentFiles: [],
  finishedFiles: {},
  metrics: null,
  isPaused: false,
  error: null,
});

const sending = { mode: 'send' as const, receiverStatus: 'idle' as const };

describe('describeLeaveCost', () => {
  it('lets a sender with nothing shared leave without asking', () => {
    expect(describeLeaveCost({ ...sending, isShared: false, receivers: [] })).toBeNull();
  });

  it('warns that a shared link stops working', () => {
    expect(describeLeaveCost({ ...sending, isShared: true, receivers: [receiver('completed')] })).toMatch(/link stops working/i);
  });

  it('counts the people whose downloads stop', () => {
    const cost = describeLeaveCost({ ...sending, isShared: true, receivers: [receiver('transferring'), receiver('queued')] });

    expect(cost).toMatch(/2 people/i);
  });

  it('warns a receiver that their download stops', () => {
    expect(describeLeaveCost({ mode: 'receive', receiverStatus: 'transferring', isShared: false, receivers: [] })).toMatch(
      /download stops/i
    );
  });

  it('warns a connected receiver that they disconnect', () => {
    expect(describeLeaveCost({ mode: 'receive', receiverStatus: 'connected', isShared: false, receivers: [] })).toMatch(
      /disconnect/i
    );
  });

  it('lets a receiver leave freely before connecting, after finishing, or after an error', () => {
    for (const receiverStatus of ['idle', 'completed', 'error'] as const) {
      expect(describeLeaveCost({ mode: 'receive', receiverStatus, isShared: false, receivers: [] })).toBeNull();
    }
  });

  it('ignores the sender side while receiving', () => {
    expect(describeLeaveCost({ mode: 'receive', receiverStatus: 'idle', isShared: true, receivers: [receiver('transferring')] })).toBeNull();
  });
});
