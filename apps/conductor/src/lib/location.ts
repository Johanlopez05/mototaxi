// Ubicación del conductor. La tarea se define al cargar este módulo (index.ts lo
// importa primero), porque Android puede despertar la app solo para correrla.
//
// Ojo: no funciona en Expo Go. Requiere un development build (ver README).

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_INTERVAL_MS } from '@mototaxi/shared';
import { supabase } from './supabase';

export const LOCATION_TASK = 'mototaxi-ubicacion-conductor';

export type SharingMode = keyof typeof LOCATION_INTERVAL_MS; // 'available' | 'inRide'

async function report(coords: Location.LocationObjectCoords) {
  const heading = coords.heading != null && coords.heading >= 0 ? Math.round(coords.heading) % 360 : null;
  const { error } = await supabase.rpc('set_my_location', {
    lat: coords.latitude,
    lng: coords.longitude,
    p_available: true,
    p_heading: heading,
  });
  if (error) console.warn('[ubicación]', error.message);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[ubicación]', error.message);
    return;
  }
  const latest = data?.locations?.at(-1);
  if (latest) await report(latest.coords);
});

export type PermissionResult = 'ok' | 'denied' | 'background_denied';

/** Pide ubicación en primer plano y luego "Permitir todo el tiempo". */
export async function requestLocationPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'ok' : 'background_denied';
}

/** Empieza (o cambia el ritmo de) el envío de ubicación. */
export async function startSharing(mode: SharingMode): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: LOCATION_INTERVAL_MS[mode],
    // 0 = enviar aunque la moto esté quieta; si no, el conductor "desaparece" del mapa a los 2 min
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: mode === 'inRide' ? 'Mototaxi · viaje en curso' : 'Mototaxi · estás disponible',
      notificationBody:
        mode === 'inRide' ? 'Compartiendo tu ubicación con el pasajero' : 'Compartiendo tu ubicación para recibir viajes',
      notificationColor: '#0B6B5D',
    },
  });
  // Primer reporte inmediato, sin esperar al intervalo
  const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await report(now.coords);
}

/** Deja de enviar ubicación y desaparece del mapa. */
export async function stopSharing(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  const { error } = await supabase.rpc('go_offline');
  if (error) throw error;
}

export const isSharing = () => Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
