import type { DocStatus, DocType, DriverStatus, RideStatus } from '@mototaxi/shared';

export interface DriverRow {
  id: string;
  plate: string;
  moto_color: string | null;
  moto_brand: string | null;
  status: DriverStatus;
  rating_avg: number;
  rating_count: number;
}

export interface DocumentRow {
  type: DocType;
  file_path: string;
  expires_on: string | null;
  status: DocStatus;
  reviewer_note: string | null;
}

/** Resultado de current_offer() */
export interface Offer {
  ride_id: string;
  expires_at: string;
  distance_m: number;
  origin_lat: number;
  origin_lng: number;
  origin_address: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_address: string | null;
  fare: number | null;
  passenger_first_name: string;
}

/** Resultado de driver_active_ride() */
export interface ActiveRide {
  ride_id: string;
  status: Extract<RideStatus, 'assigned' | 'arrived' | 'in_progress'>;
  origin_lat: number;
  origin_lng: number;
  origin_address: string | null;
  destination_lat: number;
  destination_lng: number;
  destination_address: string | null;
  fare: number | null;
  payment_method: string;
  passenger_first_name: string;
  passenger_phone: string | null;
  assigned_at: string;
}
