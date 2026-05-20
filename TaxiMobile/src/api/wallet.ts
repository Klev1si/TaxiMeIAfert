import apiClient from './client';

export type LedgerEntryType = 'credit' | 'payout';

export interface LedgerEntry {
  id:            string;
  type:          LedgerEntryType;
  amount:        number;
  rideId:        string | null;
  commissionPct: number | null;
  note:          string | null;
  createdAt:     string;
}

export interface WalletData {
  driverId:     string;
  totalCredits: number;
  totalPayouts: number;
  balance:      number;
  entries:      LedgerEntry[];
}

export const walletApi = {
  getMyWallet: () =>
    apiClient.get<WalletData>('/driver/wallet').then(r => r.data),
};
