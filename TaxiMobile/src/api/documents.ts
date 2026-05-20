import apiClient from './client';

export type DocumentType   = 'license' | 'vehicle_registration' | 'insurance' | 'other';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface DriverDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  fileUrl: string;
  originalName: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  uploadedAt: string;
}

export const documentsApi = {
  /** GET /driver/documents — driver's own document list */
  getMyDocuments: () =>
    apiClient.get<DriverDocument[]>('/driver/documents'),

  /**
   * POST /driver/documents — upload a document file.
   * `formData` must contain:
   *   - field "file"  → the image or PDF file
   *   - field "type"  → DocumentType string
   * Replaces any existing document of the same type.
   */
  uploadDocument: (formData: FormData) =>
    apiClient.post<DriverDocument>('/driver/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** DELETE /driver/documents/:id — remove a pending or rejected document */
  deleteDocument: (docId: string) =>
    apiClient.delete(`/driver/documents/${docId}`),
};

// ── Admin document API ────────────────────────────────────────────────────────

export const adminDocumentsApi = {
  /** GET /admin/drivers/:driverId/documents */
  getDriverDocuments: (driverId: string) =>
    apiClient.get<DriverDocument[]>(`/admin/drivers/${driverId}/documents`),

  /** POST /admin/drivers/:driverId/documents/:docId/approve */
  approveDocument: (driverId: string, docId: string) =>
    apiClient.post<DriverDocument>(
      `/admin/drivers/${driverId}/documents/${docId}/approve`,
    ),

  /** POST /admin/drivers/:driverId/documents/:docId/reject */
  rejectDocument: (driverId: string, docId: string, reason?: string) =>
    apiClient.post<DriverDocument>(
      `/admin/drivers/${driverId}/documents/${docId}/reject`,
      { reason },
    ),
};
