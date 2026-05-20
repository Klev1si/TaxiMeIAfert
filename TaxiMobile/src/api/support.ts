import apiClient from './client';

export type TicketCategory =
  | 'ride_issue' | 'payment' | 'account'
  | 'driver_behavior' | 'app_bug' | 'other';

export type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SupportMessage {
  id:         string;
  authorId:   string;
  authorRole: 'user' | 'admin';
  body:       string;
  createdAt:  string;
}

export interface TicketSummary {
  id:           string;
  category:     TicketCategory;
  subject:      string;
  status:       TicketStatus;
  priority:     TicketPriority;
  rideId:       string | null;
  createdAt:    string;
  updatedAt:    string;
  messageCount: number;
}

export interface TicketDetail extends TicketSummary {
  messages: SupportMessage[];
}

export interface CreateTicketPayload {
  category: TicketCategory;
  subject:  string;
  body:     string;
  rideId?:  string | null;
}

// ── Admin-specific types ──────────────────────────────────────────────────────

export interface AdminTicketSummary extends TicketSummary {
  userId:   string;
  userRole: string;   // 'client' | 'driver'
}

export interface AdminTicketDetail extends AdminTicketSummary {
  resolvedAt: string | null;
  messages:   SupportMessage[];
}

export interface AdminTicketsResponse {
  tickets: AdminTicketSummary[];
  total:   number;
}

export const supportApi = {
  // ── User ──────────────────────────────────────────────────────────────────

  createTicket: (payload: CreateTicketPayload) =>
    apiClient.post<TicketDetail>('/support/tickets', payload).then(r => r.data),

  getMyTickets: () =>
    apiClient.get<TicketSummary[]>('/support/tickets').then(r => r.data),

  getTicket: (id: string) =>
    apiClient.get<TicketDetail>(`/support/tickets/${id}`).then(r => r.data),

  addMessage: (ticketId: string, body: string) =>
    apiClient.post<SupportMessage>(`/support/tickets/${ticketId}/messages`, { body }).then(r => r.data),

  // ── Admin ─────────────────────────────────────────────────────────────────

  /** GET /admin/support/tickets */
  adminGetTickets: (params: {
    page?:     number;
    limit?:    number;
    status?:   TicketStatus | 'all';
    priority?: TicketPriority;
    category?: TicketCategory;
    userRole?: 'client' | 'driver';
  } = {}) => {
    const { status, ...rest } = params;
    return apiClient.get<AdminTicketsResponse>('/admin/support/tickets', {
      params: {
        ...rest,
        page:  params.page  ?? 1,
        limit: params.limit ?? 20,
        ...(status && status !== 'all' ? { status } : {}),
      },
    });
  },

  /** GET /admin/support/tickets/:id */
  adminGetTicket: (id: string) =>
    apiClient.get<AdminTicketDetail>(`/admin/support/tickets/${id}`),

  /** PATCH /admin/support/tickets/:id */
  adminUpdateTicket: (
    id:    string,
    patch: { status?: TicketStatus; priority?: TicketPriority },
  ) =>
    apiClient.patch<AdminTicketDetail>(`/admin/support/tickets/${id}`, patch),

  /** POST /admin/support/tickets/:id/messages */
  adminAddMessage: (ticketId: string, body: string) =>
    apiClient.post<SupportMessage>(
      `/admin/support/tickets/${ticketId}/messages`,
      { body },
    ),
};
