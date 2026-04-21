/** Shape returned for each nearby driver */
export class NearestDriverDto {
  driverId: string;
  distanceKm: number;
  lat: number;
  lng: number;
  firstName: string;
  lastName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string | null;
  rating: number;
}
