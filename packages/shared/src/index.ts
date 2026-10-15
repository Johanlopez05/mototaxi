// Tipos y constantes compartidos por las tres apps.
// Deben coincidir con los enums de supabase/migrations/*_fase1_base.sql.

export type UserRole = 'passenger' | 'driver' | 'admin';

export type DriverStatus = 'pending' | 'needs_fix' | 'approved' | 'rejected' | 'suspended';

export type DocType = 'cedula' | 'licencia' | 'soat' | 'tecnomecanica' | 'selfie' | 'foto_moto';

export type DocStatus = 'pending' | 'approved' | 'rejected';

export type RideStatus = 'searching' | 'assigned' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

/** Datos que llegan en la notificación push de una solicitud (Edge Function dispatch-ride). */
export interface RideOfferPushData {
  type: 'ride_offer';
  ride_id: string;
  expires_at: string;
}

/** Aviso al pasajero cuando ningún conductor tomó el viaje. */
export interface RideNoDriversPushData {
  type: 'ride_no_drivers';
  ride_id: string;
}

export type PushData = RideOfferPushData | RideNoDriversPushData;

/** Canal de notificaciones de Android para las solicitudes (debe crearse en la app del conductor). */
export const RIDE_OFFERS_CHANNEL = 'ride-offers';

/** Viajes que todavía están "vivos" (bloquean pedir o aceptar otro). */
export const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = ['searching', 'assigned', 'arrived', 'in_progress'];

export const RIDE_STATUS_LABEL: Record<RideStatus, string> = {
  searching: 'Buscando mototaxi',
  assigned: 'Tu mototaxi va en camino',
  arrived: 'Tu mototaxi llegó',
  in_progress: 'En viaje',
  completed: 'Viaje terminado',
  cancelled: 'Viaje cancelado',
};

export const DRIVER_STATUS_LABEL: Record<DriverStatus, string> = {
  pending: 'En revisión',
  needs_fix: 'Corrige tus documentos',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};

/** Los 6 documentos obligatorios, en el orden en que se muestran. */
export const REQUIRED_DOCS: readonly { type: DocType; label: string; expires: boolean }[] = [
  { type: 'cedula', label: 'Cédula de ciudadanía', expires: false },
  { type: 'licencia', label: 'Licencia de conducción', expires: false },
  { type: 'soat', label: 'SOAT vigente', expires: true },
  { type: 'tecnomecanica', label: 'Revisión técnico-mecánica', expires: true },
  { type: 'selfie', label: 'Foto tuya (selfie)', expires: false },
  { type: 'foto_moto', label: 'Foto de la moto con placa', expires: false },
];

/** Ruta del archivo en el bucket privado: <id del conductor>/<tipo>.jpg */
export const documentPath = (driverId: string, type: DocType): string => `${driverId}/${type}.jpg`;

export const DOCUMENTS_BUCKET = 'driver-documents';

/** Cada cuánto envía la app del conductor su ubicación (ms). */
export const LOCATION_INTERVAL_MS = {
  available: 12_000,
  inRide: 4_000,
} as const;

/** Segundos que tiene el conductor para responder una solicitud. */
export const OFFER_TIMEOUT_S = 15;

/** Placa de moto en Colombia: tres letras, dos números y una letra (ABC12D). */
export const PLATE_REGEX = /^[A-Z]{3} ?[0-9]{2}[A-Z]$/;

export const normalizePlate = (plate: string): string => plate.toUpperCase().replace(/\s+/g, '');

export * from './format';
