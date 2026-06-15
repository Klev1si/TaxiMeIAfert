import apiClient from './client';

export type MessageFromRole = 'company' | 'driver';

export interface CompanyMessage {
  id: string;
  companyId: string;
  driverId: string;
  fromRole: MessageFromRole;
  text: string;
  readAt: string | null;
  createdAt: string;
}

// ── Driver-facing ────────────────────────────────────────────────────────────

export interface DriverThreadResponse {
  companyId: string | null;
  companyName: string | null;
  messages: CompanyMessage[];
  unreadCount: number;
}

export const driverMessagesApi = {
  /** GET /driver/messages/thread — full thread with the driver's company. */
  getThread: () => apiClient.get<DriverThreadResponse>('/driver/messages/thread'),

  /** GET /driver/messages/unread-count — for the bell badge. */
  getUnreadCount: () => apiClient.get<{ count: number }>('/driver/messages/unread-count'),

  /** POST /driver/messages/reply — driver sends a message to their company. */
  reply: (text: string) =>
    apiClient.post<CompanyMessage>('/driver/messages/reply', { text }),
};

// ── Company-facing ───────────────────────────────────────────────────────────

export interface CompanyThread {
  driverId: string;
  firstName: string | null;
  lastName: string | null;
  vehiclePlate: string | null;
  unreadCount: number;
  lastMessage: CompanyMessage | null;
}

export const companyMessagesApi = {
  /** GET /company/messages/threads — list of drivers with last message + unread. */
  listThreads: () => apiClient.get<CompanyThread[]>('/company/messages/threads'),

  /** GET /company/messages/with/:driverId — full thread for one driver. */
  getThread: (driverId: string) =>
    apiClient.get<CompanyMessage[]>(`/company/messages/with/${driverId}`),

  /** POST /company/messages/to/:driverId */
  send: (driverId: string, text: string) =>
    apiClient.post<CompanyMessage>(`/company/messages/to/${driverId}`, { text }),
};
