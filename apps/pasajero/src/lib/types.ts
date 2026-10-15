import type { RideStatus } from '@mototaxi/shared';

export interface Point {
  lat: number;
  lng: number;
}

/** Un punto con su dirección legible (si la conseguimos). */
export interface Place extends Point {
  address: string | null;
}

/** Resultado de nearby_drivers() */
export interface NearbyDriver {
  driver_id: string;
  lat: number;
  lng: number;
  distance_m: number;
}

/** Resultado de estimate_fare() */
export interface FareEstimate {
  distance_m: number;
  fare: number;
}

export type CancelReason = 'passenger' | 'driver' | 'no_drivers';

/** Resultado de passenger_ride() */
export interface PassengerRide {
  ride_id: string;
  status: RideStatus;
  origin_lat: number;
  origin_lng: number;
  origin_address: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_address: string | null;
  fare: number | null;
  payment_method: string;
  /** Solo mientras el viaje no ha iniciado */
  code: string | null;
  cancel_reason: CancelReason | null;
  requested_at: string;
  assigned_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  plate: string | null;
  moto_brand: string | null;
  moto_color: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_heading: number | null;
  driver_location_at: string | null;
}
