import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import { daysUntil, formatDateDMY, todayInColombia } from '@mototaxi/shared';
import { isSharing, requestLocationPermissions, type SharingMode, startSharing, stopSharing } from '../lib/location';
import { onRideOfferNotification, registerForPush } from '../lib/push';
import { errorMessage, supabase } from '../lib/supabase';
import type { ActiveRide, DocumentRow, DriverRow, Offer } from '../lib/types';
import { Banner, Button, Card, colors, Muted, Screen, Title } from '../ui';
import { OfertaModal } from './Oferta';
import { Viaje } from './Viaje';

type Notice = { tone: 'ok' | 'warn' | 'error' | 'info'; title: string; body?: string } | null;

/** Conductor aprobado: conectarse, recibir ofertas y atender el viaje en curso. */
export function Inicio({ userId, driver, documents }: { userId: string; driver: DriverRow; documents: DocumentRow[] }) {
  const [sharing, setSharing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [answering, setAnswering] = useState(false);
  const [ride, setRide] = useState<ActiveRide | null | undefined>(undefined);
  const [notice, setNotice] = useState<Notice>(null);
  const modeRef = useRef<SharingMode | null>(null);

  const loadRide = useCallback(async () => {
    const { data, error } = await supabase.rpc('driver_active_ride');
    if (error) return setNotice({ tone: 'error', title: errorMessage(error) });
    setRide(((data as ActiveRide[] | null) ?? [])[0] ?? null);
  }, []);

  const loadOffer = useCallback(async () => {
    const { data, error } = await supabase.rpc('current_offer');
    if (!error) setOffer(((data as Offer[] | null) ?? [])[0] ?? null);
  }, []);

  // Al abrir: estado actual, push, tiempo real y regreso a primer plano
  useEffect(() => {
    isSharing().then(setSharing);
    loadRide();
    loadOffer();
    registerForPush(userId).then((token) => {
      if (!token) {
        setNotice({
          tone: 'warn',
          title: 'Notificaciones desactivadas',
          body: 'Actívalas para enterarte de los viajes con la app cerrada. Con la app abierta igual te llegan.',
        });
      }
    }, () => undefined);

    const channel = supabase
      .channel(`conductor-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_offers', filter: `driver_id=eq.${userId}` }, () => loadOffer())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `driver_id=eq.${userId}` }, () => loadRide())
      .subscribe();
    const stopPush = onRideOfferNotification(() => loadOffer());
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        loadOffer();
        loadRide();
      }
    });
    return () => {
      supabase.removeChannel(channel);
      stopPush();
      appState.remove();
    };
  }, [userId, loadOffer, loadRide]);

  // Con viaje en curso la ubicación se envía más seguido; al terminar, vuelve al ritmo normal
  const previousRide = useRef<ActiveRide | null | undefined>(undefined);
  useEffect(() => {
    if (ride === undefined) return;
    const wanted: SharingMode = ride ? 'inRide' : 'available';
    if (sharing && modeRef.current !== wanted) {
      modeRef.current = wanted;
      startSharing(wanted).catch((e) => setNotice({ tone: 'error', title: errorMessage(e) }));
    }
    if (previousRide.current && !ride) {
      setNotice({ tone: 'info', title: 'El viaje terminó', body: 'Si el pasajero canceló, no tienes que hacer nada más.' });
    }
    previousRide.current = ride;
  }, [ride, sharing]);

  async function toggle() {
    setToggling(true);
    setNotice(null);
    try {
      if (sharing) {
        await stopSharing();
        modeRef.current = null;
        setSharing(false);
        return;
      }
      const perm = await requestLocationPermissions();
      if (perm === 'denied') {
        setNotice({ tone: 'error', title: 'Sin permiso de ubicación', body: 'La necesitamos para que los pasajeros te encuentren.' });
        return;
      }
      if (perm === 'background_denied') {
        Alert.alert(
          'Elige "Permitir todo el tiempo"',
          'Para recibir viajes con la pantalla apagada, la app necesita tu ubicación aunque no esté abierta.',
          [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      const mode: SharingMode = ride ? 'inRide' : 'available';
      await startSharing(mode);
      modeRef.current = mode;
      setSharing(true);
    } catch (e) {
      setNotice({ tone: 'error', title: errorMessage(e) });
    } finally {
      setToggling(false);
    }
  }

  async function accept() {
    if (!offer) return;
    setAnswering(true);
    const { data, error } = await supabase.rpc('accept_ride', { p_ride_id: offer.ride_id });
    setAnswering(false);
    setOffer(null);
    if (error) return setNotice({ tone: 'warn', title: errorMessage(error) });
    if (data === false) return setNotice({ tone: 'warn', title: 'Otro conductor tomó este viaje.' });
    await loadRide();
  }

  async function reject() {
    if (!offer) return;
    const rideId = offer.ride_id;
    setOffer(null);
    await supabase.rpc('reject_offer', { p_ride_id: rideId });
  }

  const expire = useCallback(() => {
    setOffer(null);
    setNotice({ tone: 'info', title: 'La solicitud venció', body: 'Se le ofreció a otro conductor.' });
  }, []);

  if (ride) return <Viaje ride={ride} onChanged={loadRide} />;

  // Aviso de vencimientos próximos (15 días)
  const today = todayInColombia();
  const expiring = documents
    .filter((d) => d.expires_on)
    .map((d) => ({ ...d, days: daysUntil(d.expires_on!, today) }))
    .sort((a, b) => a.days - b.days)[0];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>
          {driver.plate} · ★ {Number(driver.rating_avg).toFixed(1).replace('.', ',')}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>{driver.rating_count} calificaciones</Text>
      </View>

      <Banner
        tone={expiring && expiring.days <= 15 ? 'warn' : 'ok'}
        title={
          expiring && expiring.days <= 15
            ? `Tu ${expiring.type === 'soat' ? 'SOAT' : 'técnico-mecánica'} vence el ${formatDateDMY(expiring.expires_on!)}`
            : 'Cuenta aprobada'
        }
        body={expiring && expiring.days <= 15 ? 'Renuévalo a tiempo: el día que vence, tu cuenta se suspende.' : null}
      />

      {notice ? <Banner tone={notice.tone} title={notice.title} body={notice.body} /> : null}

      <View style={{ flex: 1, justifyContent: 'center', gap: 6, paddingVertical: 24 }}>
        <Title>{sharing ? 'Estás disponible' : 'Estás desconectado'}</Title>
        <Muted>
          {sharing
            ? 'Compartiendo tu ubicación. Te llegará una notificación cuando haya un viaje cerca.'
            : 'Conéctate para recibir viajes cerca de ti.'}
        </Muted>
      </View>

      <Card style={{ padding: 8 }}>
        <Button
          title={sharing ? 'Desconectarme' : 'Conectarme'}
          tone={sharing ? 'secondary' : 'go'}
          onPress={toggle}
          loading={toggling}
          style={{ minHeight: 72, borderRadius: 36 }}
        />
      </Card>

      <Button title="Cerrar sesión" tone="ghost" onPress={async () => {
        if (sharing) await stopSharing().catch(() => undefined);
        await supabase.auth.signOut();
      }} />

      <OfertaModal offer={offer} onAccept={accept} onReject={reject} onExpire={expire} busy={answering} />
    </Screen>
  );
}
