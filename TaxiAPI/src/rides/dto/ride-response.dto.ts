export class RideResponseDto {
  id: string;
  status: string;
  clientId: string;
  driverId: string | null;
  companyId: string | null;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffAddress: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  pickupArrivedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  paymentStatus: string;
  clientRating: number | null;
  clientReview: string | null;
  driverRating: number | null;
  driverReview: string | null;
}
