import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { configMissing, supabase } from './src/lib/supabase';
import type { PassengerRide } from './src/lib/types';
import { Autorizacion, loadPrivacyStatus, missingScopes, type PrivacyStatus } from './src/screens/Autorizacion';
import { Contactos } from './src/screens/Contactos';
import { Login } from './src/screens/Login';
import { Nombre } from './src/screens/Nombre';
import { Pedir } from './src/screens/Pedir';
import { Resumen } from './src/screens/Resumen';
import { Viaje } from './src/screens/Viaje';
import { Banner, Button, colors, Muted, Screen, Title } from './src/ui';

/** Respaldo por si se pierde un evento de tiempo real (ms). */
const RIDE_POLL_MS = 10_000;

/**
 * Navegación por estado:
 *   sin sesión → Login
 *   sin nombre → Nombre
 *   viaje activo → Viaje (buscando, en camino, llegó, en viaje)
 *   viaje recién terminado o cancelado → Resumen
 *   si no → Pedir (mapa)
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {configMissing ? <FaltaConfig /> : <Root />}
    </SafeAreaProvider>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [privacy, setPrivacy] = useState<PrivacyStatus | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadPrivacy = useCallback(() => {
    setPrivacy(undefined);
    if (userId) loadPrivacyStatus().then(setPrivacy);
  }, [userId]);
  useEffect(loadPrivacy, [loadPrivacy]);

  useEffect(() => {
    setName(undefined);
    if (!userId) return;
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      .then(({ data }) => setName(data?.full_name?.trim() || null));
  }, [userId]);

  if (session === undefined || (session && (name === undefined || privacy === undefined))) return <Cargando />;
  if (!session) return <Login />;
  if (privacy === undefined) return <Cargando />;
  if (privacy === null) return <SinConexion onRetry={loadPrivacy} />;
  if (missingScopes('pasajero', privacy).length > 0) {
    return <Autorizacion app="pasajero" status={privacy} onDone={loadPrivacy} />;
  }
  if (!name) return <Nombre userId={session.user.id} onDone={setName} />;
  return <Viajes userId={session.user.id} firstName={name.split(' ')[0]} />;
}

function Viajes({ userId, firstName }: { userId: string; firstName: string }) {
  const [showContacts, setShowContacts] = useState(false);
  // rideId se conserva al terminar el viaje para poder mostrar el resumen
  const [rideId, setRideId] = useState<string | null | undefined>(undefined);
  const [ride, setRide] = useState<PassengerRide | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const load = useCallback(async (id: string | null) => {
    const { data, error } = await supabase.rpc('passenger_ride', id ? { p_ride_id: id } : {});
    if (error) return; // se reintenta en el siguiente evento o sondeo
    const row = ((data as PassengerRide[] | null) ?? [])[0] ?? null;
    setRide(row);
    if (!id) setRideId(row?.ride_id ?? null);
  }, []);

  // Al abrir: ¿tiene un viaje activo?
  useEffect(() => {
    load(null);
  }, [load]);

  // Con viaje: escuchar cambios del viaje y de la ubicación de la moto
  const driverId = ride?.driver_id ?? null;
  const active = !!ride && ride.status !== 'completed' && ride.status !== 'cancelled';
  useEffect(() => {
    if (!rideId || !active) return;
    const refresh = () => load(rideId);
    let channel = supabase
      .channel(`pasajero-${rideId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` }, refresh);
    if (driverId) {
      channel = channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` }, refresh);
    }
    channel.subscribe();
    const poll = setInterval(refresh, RIDE_POLL_MS);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      appState.remove();
    };
  }, [rideId, driverId, active, load]);

  if (rideId === undefined) return <Cargando />;

  if (rideId && ride) {
    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return <Resumen ride={ride} onDone={() => { setRideId(null); setRide(null); setDispatchError(null); }} />;
    }
    return <Viaje ride={ride} dispatchError={dispatchError} onChanged={() => load(rideId)} />;
  }

  if (showContacts) return <Contactos userId={userId} onBack={() => setShowContacts(false)} />;

  return (
    <Pedir
      firstName={firstName}
      onContacts={() => setShowContacts(true)}
      onRequested={(id, err) => {
        setDispatchError(err);
        setRideId(id);
        load(id);
      }}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

const Cargando = () => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
    <ActivityIndicator size="large" color={colors.ink} />
  </View>
);

const SinConexion = ({ onRetry }: { onRetry: () => void }) => (
  <Screen>
    <Title>Sin conexión</Title>
    <Muted>No pudimos conectarnos. Revisa tu internet e intenta de nuevo.</Muted>
    <Button title="Reintentar" onPress={onRetry} />
  </Screen>
);

const FaltaConfig = () => (
  <Screen>
    <Title>Falta configurar Supabase</Title>
    <Banner tone="warn" title="Crea el archivo apps/pasajero/.env" body="Copia .env.example y pon la URL y la anon key de tu proyecto. Luego reinicia Expo." />
    <Muted>EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY están en Supabase → Project Settings → API.</Muted>
  </Screen>
);
