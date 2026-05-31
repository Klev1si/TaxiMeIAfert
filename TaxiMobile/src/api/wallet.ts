import apiClient from './client';

export type LedgerEntryType = 'credit' | 'payout';
export type LedgerPaymentMethod = 'pending' | 'cash' | 'card';

export interface LedgerEntry {
  id:             string;
  type:           LedgerEntryType;
  amount:         number;
  rideId:         string | null;
  commissionPct:  number | null;
  note:           string | null;
  createdAt:      string;
  /** Null for payouts and legacy credits. */
  paymentMethod:  LedgerPaymentMethod | null;
}

export interface WalletData {
  driverId:      string;
  /** Sum of ALL credits — total lifetime earnings (cash + card + pending). */
  totalCredits:  number;
  /** Sum of credits paid in cash — money the driver already collected. */
  cashCollected: number;
  /** Sum of credits the platform still owes (card + pending). */
  balanceOwed:   number;
  totalPayouts:  number;
  /** balanceOwed − totalPayouts. What the platform still owes after past payouts. */
  balance:       number;
  entries:       LedgerEntry[];
}

export const walletApi = {
  getMyWallet: () =>
    apiClient.get<WalletData>('/driver/wallet').then(r => r.data),
};
