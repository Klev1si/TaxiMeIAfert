import apiClient from './client';

export type ExpenseType = 'fuel' | 'parking' | 'maintenance' | 'toll' | 'other';

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  fuel:        '⛽ Fuel',
  parking:     '🅿️  Parking',
  maintenance: '🔧 Maintenance',
  toll:        '🛣️  Toll',
  other:       '📦 Other',
};

export interface Expense {
  id: string;
  driverId: string;
  type: ExpenseType;
  amount: string; // decimal string from Postgres
  description: string | null;
  expenseDate: string; // ISO date 'YYYY-MM-DD'
  receiptUrl: string | null;
  createdAt: string;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  totals: Record<string, number>;
  grandTotal: number;
}

export interface CreateExpensePayload {
  type: ExpenseType;
  amount: number;
  description?: string;
  expenseDate: string; // 'YYYY-MM-DD'
  receiptUrl?: string;
}

export const expensesApi = {
  /** GET /expenses?period=&type= */
  list: (period = 'all', type?: ExpenseType) =>
    apiClient.get<ExpenseListResponse>('/expenses', {
      params: { period, ...(type ? { type } : {}) },
    }),

  /** POST /expenses */
  create: (payload: CreateExpensePayload) =>
    apiClient.post<Expense>('/expenses', payload),

  /** DELETE /expenses/:id */
  remove: (id: string) =>
    apiClient.delete<void>(`/expenses/${id}`),
};
