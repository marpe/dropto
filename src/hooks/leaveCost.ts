import type { SenderReceiver } from '../types/sharing';
import type { ReceiverStatus } from '../types/transfer';
import { countConnectedReceivers } from './senderState';

interface LeaveContext {
  mode: 'send' | 'receive';
  isShared: boolean;
  receivers: SenderReceiver[];
  receiverStatus: ReceiverStatus;
}

/** The confirmation for leaving: a short question, what it stops, and the verb that does it. */
export interface LeaveCost {
  title: string;
  body: string;
  confirmLabel: string;
}

// Nothing is connected in these, so leaving loses nothing
const RECEIVER_AT_REST: ReceiverStatus[] = ['idle', 'completed', 'error'];

const STOP_SHARING = { title: 'Stop sharing?', confirmLabel: 'Stop sharing' };

/** What going back to the start page would stop, worded for a confirmation; null when nothing would. */
export function describeLeaveCost({ mode, isShared, receivers, receiverStatus }: LeaveContext): LeaveCost | null {
  if (mode === 'receive') {
    if (receiverStatus === 'transferring') {
      return { title: 'Stop download?', body: 'Your download stops.', confirmLabel: 'Stop' };
    }
    return RECEIVER_AT_REST.includes(receiverStatus)
      ? null
      : { title: 'Disconnect?', body: 'You disconnect from the sender.', confirmLabel: 'Disconnect' };
  }
  const connected = countConnectedReceivers(receivers);
  if (connected > 0) {
    const who = connected === 1 ? 'Someone is' : `${connected} people are`;
    return { ...STOP_SHARING, body: `${who} connected. They get disconnected and the link stops working.` };
  }
  return isShared ? { ...STOP_SHARING, body: 'The link stops working.' } : null;
}
