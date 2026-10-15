import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DOCUMENTS_BUCKET,
  RIDE_STATUS_LABEL,
  distanceMeters,
  documentPath,
  etaMinutes,
  formatCOP,
} from '@mototaxi/shared';
import { SosButton } from '../components/SosButton';
import { shareTrip } from '../lib/safety';
import { errorMessage, supabase } from '../lib/supabase';
import type { PassengerRide } from '../lib/types';
import { Banner, Button, Card, colors, Label, Muted } from '../ui';

/** Viaje activo: buscando → conductor en camino → llegó (código) → en viaje. */
export function Viaje({ ride, dispatchError, onChanged }: {
  ride: PassengerRide;
  dispatchError: string | null;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(dispatchError);
  const photo = useDriverPhoto(ride.driver_id);
  const map = useRef<MapView>(null);

  useEffect(() => setError(dispatchError), [dispatchError]);

  const searching = ride.status === 'searching';
  const inProgress = ride.status === 'in_progress';
  const pickup = { lat: ride.origin_lat, lng: ride.origin_lng };
  const target = inProgress ? { lat: ride.destination_lat, lng: ride.destination_lng } : pickup;
  const driverAt = ride.driver_lat != null && ride.driver_lng != null ? { lat: ride.driver_lat, lng: ride.driver_lng } : null;

  // Encuadrar la moto y el punto al que va
  useEffect(() => {
    const points = [target, ...(driverAt ? [driverAt] : [])].map((p) => ({ latitude: p.lat, longitude: p.lng }));
    map.current?.fitToCoordinates(points, { edgePadding: { top: 80, right: 60, bottom: 360, left: 60 }, animated: true });
  }, [driverAt?.lat, driverAt?.lng, target.lat, target.lng]);

  async function retryDispatch() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.functions.invoke('dispatch-ride', { body: { ride_id: ride.ride_id } });
    setBusy(false);
    if (e) setError(errorMessage(e));
  }

  function cancel() {
    Alert.alert(
      '¿Cancelar el viaje?',
      searching ? 'Dejaremos de buscarte un mototaxi.' : 'El conductor ya va en camino por ti.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancelar viaje',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error: e } = await supabase.rpc('cancel_ride', { p_ride_id: ride.ride_id });
            setBusy(false);
            if (e) return setError(errorMessage(e));
            await onChanged();
          },
        },
      ],
    );
  }

  const eta = driverAt && !inProgress ? etaMinutes(distanceMeters(driverAt, pickup)) : null;
  const headline =
    ride.status === 'assigned' && eta ? `Llega en ${eta} min aprox.` : RIDE_STATUS_LABEL[ride.status];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: target.lat, longitude: target.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }}
        showsUserLocation
        toolbarEnabled={false}
      >
        <Marker coordinate={{ latitude: target.lat, longitude: target.lng }}
                pinColor={inProgress ? colors.ink : colors.green}
                title={inProgress ? 'Destino' : 'Punto de recogida'} />
        {driverAt ? (
          <Marker coordinate={{ latitude: driverAt.lat, longitude: driverAt.lng }} anchor={{ x: 0.5, y: 0.5 }}
                  title={ride.plate ?? 'Tu mototaxi'} tracksViewChanges={false}>
            <View style={s.moto}><Text style={{ fontSize: 18 }}>🛵</Text></View>
          </Marker>
        ) : null}
      </MapView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Card style={{ margin: 12, padding: 16, gap: 12 }}>
          <Text style={s.headline} accessibilityRole="header" accessibilityLiveRegion="polite">{headline}</Text>
          {error ? <Banner tone="error" title={error} /> : null}

          {searching ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator color={colors.ink} />
                <Muted style={{ flex: 1 }}>Le estamos ofreciendo tu viaje al conductor verificado más cercano.</Muted>
              </View>
              {error ? <Button title="Volver a avisar a los conductores" onPress={retryDispatch} loading={busy} /> : null}
            </>
          ) : (
            <DriverCard ride={ride} photo={photo} />
          )}

          {ride.code && !searching ? (
            <View style={s.codeBox} accessible accessibilityLabel={`Tu código es ${ride.code.split('').join(' ')}`}>
              <Label>Dile este código al conductor</Label>
              <Text style={s.code}>{ride.code}</Text>
              <Muted style={{ fontSize: 13, textAlign: 'center' }}>
                Sin este código el viaje no puede empezar. No te subas si la placa no coincide.
              </Muted>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Muted>{inProgress ? 'Paga al llegar' : 'Tarifa'} · efectivo</Muted>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{formatCOP(ride.fare)}</Text>
          </View>
          <Muted style={{ fontSize: 13 }}>
            {inProgress ? `Hacia ${ride.destination_address ?? 'tu destino'}` : `Recogida en ${ride.origin_address ?? 'tu ubicación'}`}
          </Muted>

          {!searching ? (
            <>
              <Button
                title="Compartir viaje en vivo"
                tone="go"
                onPress={() => shareTrip(ride.ride_id, ride.plate).catch((e) => setError(errorMessage(e)))}
              />
              <SosButton rideId={ride.ride_id} />
            </>
          ) : null}

          {!inProgress ? <Button title="Cancelar viaje" tone="ghost" onPress={cancel} disabled={busy} /> : null}
        </Card>
      </SafeAreaView>
    </View>
  );
}

function DriverCard({ ride, photo }: { ride: PassengerRide; photo: string | null }) {
  const moto = [ride.moto_brand, ride.moto_color].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      {photo ? (
        <Image source={{ uri: photo }} style={s.photo} accessibilityLabel={`Foto de ${ride.driver_name ?? 'tu conductor'}`} />
      ) : (
        <View style={[s.photo, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{(ride.driver_name ?? '?').charAt(0)}</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.ink }}>{ride.driver_name ?? 'Tu conductor'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {ride.plate ? <Text style={s.plate}>{ride.plate}</Text> : null}
          {moto ? <Muted style={{ fontSize: 14 }}>{moto}</Muted> : null}
        </View>
        {ride.rating_count ? (
          <Muted style={{ fontSize: 13 }}>★ {Number(ride.rating_avg).toFixed(1).replace('.', ',')} · {ride.rating_count} viajes · verificado</Muted>
        ) : (
          <Muted style={{ fontSize: 13 }}>Conductor verificado</Muted>
        )}
      </View>
      {ride.driver_phone ? (
        <Button title="Llamar" tone="secondary" style={{ minHeight: 48 }}
                onPress={() => Linking.openURL(`tel:+${ride.driver_phone!.replace(/\D/g, '')}`)} />
      ) : null}
    </View>
  );
}

/** Enlace firmado (1 h) a la selfie del conductor; solo funciona mientras el viaje está activo. */
function useDriverPhoto(driverId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!driverId) return;
    let alive = true;
    supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(documentPath(driverId, 'selfie'), 3600)
      .then(({ data }) => alive && setUrl(data?.signedUrl ?? null));
    return () => {
      alive = false;
    };
  }, [driverId]);
  return url;
}

const s = StyleSheet.create({
  headline: { fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  moto: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.yellow,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white,
  },
  photo: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sand },
  plate: {
    fontWeight: '800', letterSpacing: 1.5, fontSize: 14, color: colors.ink, backgroundColor: colors.yellow,
    borderWidth: 1.5, borderColor: colors.ink, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  codeBox: { backgroundColor: colors.sand, borderRadius: 16, padding: 12, alignItems: 'center', gap: 4 },
  code: { fontSize: 40, fontWeight: '800', letterSpacing: 14, color: colors.ink },
});
