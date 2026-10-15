import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import { configMissing, supabase } from './src/lib/supabase';
import type { DocumentRow, DriverRow } from './src/lib/types';
import { Autorizacion, loadPrivacyStatus, missingScopes, type PrivacyStatus } from './src/screens/Autorizacion';
import { Documentos } from './src/screens/Documentos';
import { Inicio } from './src/screens/Inicio';
import { Login } from './src/screens/Login';
import { Registro } from './src/screens/Registro';
import { Banner, Button, colors, Muted, Screen, Title } from './src/ui';

/**
 * Navegación por estado:
 *   sin sesión → Login
 *   sin moto registrada → Registro
 *   no aprobado → Documentos (subir, enviar, ver revisión)
 *   aprobado → Inicio (disponible, ofertas, viaje)
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
  const [driver, setDriver] = useState<DriverRow | null | undefined>(undefined);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [profileName, setProfileName] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyStatus | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadDriver = useCallback(async () => {
    if (!userId) return;
    const [d, docs, profile] = await Promise.all([
      supabase.from('drivers').select('id, plate, moto_color, moto_brand, status, rating_avg, rating_count').eq('id', userId).maybeSingle(),
      supabase.from('driver_documents').select('type, file_path, expires_on, status, reviewer_note').eq('driver_id', userId),
      supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    ]);
    setDriver((d.data as DriverRow | null) ?? null);
    setDocuments((docs.data as DocumentRow[] | null) ?? []);
    setProfileName(profile.data?.full_name ?? '');
  }, [userId]);

  useEffect(() => {
    setDriver(undefined);
    loadDriver();
  }, [loadDriver]);

  const loadPrivacy = useCallback(() => {
    setPrivacy(undefined);
    if (userId) loadPrivacyStatus().then(setPrivacy);
  }, [userId]);
  useEffect(loadPrivacy, [loadPrivacy]);

  if (session === undefined || (session && (driver === undefined || privacy === undefined))) return <Cargando />;
  if (!session) return <Login />;
  if (privacy === undefined) return <Cargando />;
  if (privacy === null) return <SinConexion onRetry={loadPrivacy} />;
  if (missingScopes('conductor', privacy).length > 0) {
    return <Autorizacion app="conductor" status={privacy} onDone={loadPrivacy} />;
  }
  if (!driver) return <Registro userId={session.user.id} initialName={profileName} onDone={loadDriver} />;
  if (driver.status !== 'approved') return <Documentos driver={driver} documents={documents} onChanged={loadDriver} />;
  return <Inicio userId={session.user.id} driver={driver} documents={documents} />;
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
    <Banner tone="warn" title="Crea el archivo apps/conductor/.env" body="Copia .env.example y pon la URL y la anon key de tu proyecto. Luego reinicia Expo." />
    <Muted>EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY están en Supabase → Project Settings → API.</Muted>
  </Screen>
);
