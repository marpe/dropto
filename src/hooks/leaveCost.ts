import type { SenderReceiver } from '../types/sharing';
import type { ReceiverStatus } from '../types/transfer';

interface LeaveContext {
  mode: 'send' | 'receive';
  isShared: boolean;
  receivers: SenderReceiver[];
  receiverStatus: ReceiverStatus;
}

// Nothing is connected in these, so leaving loses nothing
const RECEIVER_AT_REST: ReceiverStatus[] = ['idle', 'completed', 'error'];

/** What going back to the start page would stop, worded for a confirmation; null when nothing would. */
export function describeLeaveCost({ mode, isShared, receivers, receiverStatus }: LeaveContext): string | null {
  if (mode === 'receive') {
    if (receiverStatus === 'transferring') {
      return 'Your download stops.';
    }
    return RECEIVER_AT_REST.includes(receiverStatus) ? null : 'You disconnect from the sender.';
  }
  const connected = receivers.filter((receiver) => receiver.stage !== 'completed' && receiver.stage !== 'failed').length;
  if (connected > 0) {
    return `${connected === 1 ? 'Someone is' : `${connected} people are`} connected. Navigating away from this page will stop the current file sharing session.`;
  }
  return isShared ? 'Navigating away from this page will stop the current file sharing session.' : null;
}
