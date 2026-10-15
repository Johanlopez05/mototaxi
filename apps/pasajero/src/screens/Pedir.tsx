import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCOP, formatDistance } from '@mototaxi/shared';
import { addressFor, currentPosition, requestLocation, searchAddress } from '../lib/location';
import { errorMessage, supabase } from '../lib/supabase';
import type { FareEstimate, NearbyDriver, Place, Point } from '../lib/types';
import { Banner, Button, Card, colors, Label, Muted, styles as ui } from '../ui';

const DELTA = { latitudeDelta: 0.012, longitudeDelta: 0.012 };
const NEARBY_REFRESH_MS = 15_000;

type Phase = 'locating' | 'no_permission' | 'choose' | 'confirm';

/**
 * Pedir un viaje: el punto de recogida es donde estás; el destino se elige
 * moviendo el mapa (pin en el centro) o escribiendo la dirección.
 */
export function Pedir({ firstName, onRequested, onSignOut, onContacts }: {
  firstName: string;
  onRequested: (rideId: string, dispatchError: string | null) => void;
  onSignOut: () => void;
  onContacts: () => void;
}) {
  const map = useRef<MapView>(null);
  const [phase, setPhase] = useState<Phase>('locating');
  const [origin, setOrigin] = useState<Place | null>(null);
  const [center, setCenter] = useState<Point | null>(null);
  const [centerAddress, setCenterAddress] = useState<string | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback(async () => {
    setPhase('locating');
    setError(null);
    if ((await requestLocation()) === 'denied') return setPhase('no_permission');
    try {
      const here = await currentPosition();
      setOrigin({ ...here, address: null });
      setCenter(here);
      setPhase('choose');
      addressFor(here).then((address) => setOrigin((o) => (o ? { ...o, address } : o)));
    } catch (e) {
      setError(errorMessage(e));
      setPhase('no_permission');
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  // Motos disponibles cerca del punto de recogida
  useEffect(() => {
    if (!origin) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc('nearby_drivers', { lat: origin.lat, lng: origin.lng, radius_m: 3000 });
      if (alive) setDrivers((data as NearbyDriver[] | null) ?? []);
    };
    load();
    const id = setInterval(load, NEARBY_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // Solo cuando cambia el punto, no cuando llega su dirección
  }, [origin?.lat, origin?.lng]);

  // Dirección del punto bajo el pin (espera a que el mapa se quede quieto)
  useEffect(() => {
    if (phase !== 'choose' || !center) return;
    setCenterAddress(null);
    const id = setTimeout(() => addressFor(center).then(setCenterAddress), 600);
    return () => clearTimeout(id);
  }, [center, phase]);

  const moveTo = (p: Point) => map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, ...DELTA }, 400);

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    const place = await searchAddress(query.trim(), origin);
    setBusy(false);
    if (!place) return setError('No encontramos esa dirección. Prueba con el barrio o mueve el mapa hasta tu destino.');
    moveTo(place);
  }

  async function confirmDestination() {
    if (!origin || !center) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('estimate_fare', {
      origin_lat: origin.lat, origin_lng: origin.lng, dest_lat: center.lat, dest_lng: center.lng,
    });
    setBusy(false);
    if (e) return setError(errorMessage(e));
    const est = ((data as FareEstimate[] | null) ?? [])[0];
    if (!est) return setError('No pudimos calcular el precio. Intenta de nuevo.');
    setDestination({ ...center, address: centerAddress });
    setEstimate(est);
    setPhase('confirm');
  }

  async function request() {
    if (!origin || !destination) return;
    setBusy(true);
    setError(null);
    const { data: rideId, error: e } = await supabase.rpc('request_ride', {
      origin_lat: origin.lat, origin_lng: origin.lng, origin_address: origin.address ?? 'Punto en el mapa',
      dest_lat: destination.lat, dest_lng: destination.lng, dest_address: destination.address ?? 'Punto en el mapa',
    });
    if (e || typeof rideId !== 'string') {
      setBusy(false);
      return setError(e ? errorMessage(e) : 'No pudimos pedir el viaje. Intenta de nuevo.');
    }
    // El viaje ya existe; si avisar a los conductores falla, la pantalla del viaje deja reintentar
    const { error: dispatchError } = await supabase.functions.invoke('dispatch-ride', { body: { ride_id: rideId } });
    setBusy(false);
    onRequested(rideId, dispatchError ? errorMessage(dispatchError) : null);
  }

  if (phase === 'locating') {
    return (
      <View style={[ui.safe, { alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Muted>Buscando tu ubicación…</Muted>
      </View>
    );
  }

  if (phase === 'no_permission' || !origin) {
    return (
      <SafeAreaView style={ui.safe}>
        <View style={ui.content}>
          <Banner tone="warn" title="Necesitamos tu ubicación"
                  body={error ?? 'La usamos para saber dónde recogerte y mostrarte los mototaxis cercanos. Solo mientras usas la app.'} />
          <Button title="Intentar de nuevo" onPress={locate} />
          <Button title="Abrir ajustes" tone="secondary" onPress={() => Linking.openSettings()} />
        </View>
      </SafeAreaView>
    );
  }

  const choosing = phase === 'choose';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: origin.lat, longitude: origin.lng, ...DELTA }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        scrollEnabled={choosing}
        zoomEnabled={choosing}
        onRegionChangeComplete={(r: Region) => choosing && setCenter({ lat: r.latitude, lng: r.longitude })}
      >
        {drivers.map((d) => (
          <Marker key={d.driver_id} coordinate={{ latitude: d.lat, longitude: d.lng }} anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false} accessibilityLabel="Mototaxi disponible">
            <View style={pin.moto}><Text style={{ fontSize: 15 }}>🛵</Text></View>
          </Marker>
        ))}
        {!choosing && destination ? (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} pinColor={colors.ink} title="Destino" />
        ) : null}
      </MapView>

      {/* Pin fijo en el centro mientras se elige el destino */}
      {choosing ? (
        <View pointerEvents="none" style={pin.centerWrap}>
          <View style={pin.head} />
          <View style={pin.stick} />
        </View>
      ) : null}

      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 16, paddingTop: 8 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={pin.chip}>{drivers.length ? `${drivers.length} mototaxi${drivers.length === 1 ? '' : 's'} cerca` : 'Sin mototaxis cerca por ahora'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text onPress={onContacts} style={pin.chip} accessibilityRole="button">Contactos</Text>
            <Text onPress={onSignOut} style={[pin.chip, { color: colors.muted }]} accessibilityRole="button">Salir</Text>
          </View>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Card style={{ margin: 12, padding: 16, gap: 12 }}>
          {error ? <Banner tone="error" title={error} /> : null}

          {choosing ? (
            <>
              <Text style={ui.title}>¿A dónde vas{firstName ? `, ${firstName}` : ''}?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={search}
                  returnKeyType="search"
                  placeholder="Escribe la dirección o el barrio"
                  placeholderTextColor={colors.subtle}
                  style={[ui.input, { flex: 1, minHeight: 48 }]}
                  accessibilityLabel="Dirección de destino"
                />
                <Button title="Buscar" tone="secondary" onPress={search} loading={busy && !!query} style={{ minHeight: 48 }} />
              </View>
              <Muted style={{ fontSize: 14 }}>
                O mueve el mapa hasta tu destino: {centerAddress ?? 'buscando la dirección…'}
              </Muted>
              <Button title="Ir aquí" onPress={confirmDestination} loading={busy && !query} />
            </>
          ) : (
            <>
              <View style={{ gap: 2 }}>
                <Label>Recogida</Label>
                <Text style={pin.address}>{origin.address ?? 'Tu ubicación actual'}</Text>
              </View>
              <View style={{ gap: 2 }}>
                <Label>Destino</Label>
                <Text style={pin.address}>{destination?.address ?? 'Punto en el mapa'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>{formatCOP(estimate?.fare)}</Text>
                <Muted>{formatDistance(estimate?.distance_m)} · efectivo</Muted>
              </View>
              <Button title="Pedir mototaxi" tone="go" onPress={request} loading={busy} disabled={!drivers.length} />
              {!drivers.length ? <Muted style={{ fontSize: 13 }}>No hay mototaxis disponibles cerca. Intenta en un momento.</Muted> : null}
              <Button title="Cambiar destino" tone="secondary" disabled={busy} onPress={() => {
                setPhase('choose');
                setEstimate(null);
                if (destination) moveTo(destination);
              }} />
            </>
          )}
        </Card>
      </SafeAreaView>
    </View>
  );
}

const pin = StyleSheet.create({
  centerWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -12, marginTop: -40, alignItems: 'center' },
  head: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, borderWidth: 4, borderColor: colors.yellow },
  stick: { width: 3, height: 16, backgroundColor: colors.ink },
  moto: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.yellow,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white,
  },
  chip: {
    backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    fontSize: 13, fontWeight: '700', color: colors.ink, overflow: 'hidden',
  },
  address: { fontSize: 16, fontWeight: '600', color: colors.ink },
});
