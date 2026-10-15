// Notificaciones push. Las solicitudes llegan por el canal "ride-offers" con
// prioridad máxima. Requiere development build (en Android, Expo Go no recibe push).

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { RIDE_OFFERS_CHANNEL, type PushData } from '@mototaxi/shared';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Crea el canal, pide permiso y guarda el token en el perfil. Devuelve el token o null. */
export async function registerForPush(userId: string): Promise<string | null> {
  // En Android 13+ el canal debe existir ANTES de pedir el token
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(RIDE_OFFERS_CHANNEL, {
      name: 'Solicitudes de viaje',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#FFC22E',
    });
  }
  if (!Device.isDevice) return null; // los emuladores no reciben push

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;

  const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const { error } = await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    if (error) console.warn('[push]', error.message);
    return token;
  } catch (e) {
    console.warn('[push] no se pudo obtener el token', e);
    return null;
  }
}

/** Llama `onOffer` cuando llega (o se toca) una notificación de solicitud. */
export function onRideOfferNotification(onOffer: (rideId: string) => void): () => void {
  const pick = (data: unknown) => {
    const d = data as Partial<PushData> | undefined;
    if (d?.type === 'ride_offer' && typeof d.ride_id === 'string') onOffer(d.ride_id);
  };
  const received = Notifications.addNotificationReceivedListener((n) => pick(n.request.content.data));
  const tapped = Notifications.addNotificationResponseReceivedListener((r) => pick(r.notification.request.content.data));
  return () => {
    received.remove();
    tapped.remove();
  };
}
