import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { formatCOP, formatPhone } from '@mototaxi/shared';
import { SosButton } from '../components/SosButton';
import { errorMessage, supabase } from '../lib/supabase';
import type { ActiveRide } from '../lib/types';
import { Banner, Button, Card, colors, Field, Label, Muted, Screen, Title } from '../ui';

const openDirections = (lat: number, lng: number) =>
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`);

/** Viaje en curso: ir a recoger → llegué → código de 4 dígitos → en viaje → finalizar. */
export function Viaje({ ride, onChanged }: { ride: ActiveRide; onChanged: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: string, args?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc(fn, args);
    setBusy(false);
    if (e) {
      setError(errorMessage(e));
      return undefined;
    }
    return data as unknown;
  }

  async function arrived() {
    if ((await run('mark_arrived', { p_ride_id: ride.ride_id })) !== undefined) await onChanged();
  }

  async function start() {
    const ok = await run('start_ride', { p_ride_id: ride.ride_id, p_code: code });
    if (ok === true) {
      setCode('');
      await onChanged();
    } else if (ok === false) {
      setError('Código incorrecto. No inicies el viaje: pídele al pasajero el código que ve en su app.');
      setCode('');
    }
  }

  async function finish() {
    Alert.alert('¿Terminar el viaje?', `Cobra ${formatCOP(ride.fare)} en efectivo.`, [
      { text: 'Todavía no', style: 'cancel' },
      {
        text: 'Sí, terminar',
        onPress: async () => {
          if ((await run('complete_ride', { p_ride_id: ride.ride_id })) !== undefined) await onChanged();
        },
      },
    ]);
  }

  function cancel() {
    Alert.alert('¿Cancelar el viaje?', 'El pasajero tendrá que pedir otro mototaxi. Las cancelaciones frecuentes afectan tu cuenta.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancelar viaje',
        style: 'destructive',
        onPress: async () => {
          if ((await run('cancel_ride', { p_ride_id: ride.ride_id })) !== undefined) await onChanged();
        },
      },
    ]);
  }

  const goingToPickup = ride.status === 'assigned' || ride.status === 'arrived';
  const target = goingToPickup
    ? { lat: ride.origin_lat, lng: ride.origin_lng, address: ride.origin_address }
    : { lat: ride.destination_lat, lng: ride.destination_lng, address: ride.destination_address };

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.ink, borderColor: colors.ink }}>
        <Text style={{ color: '#C9CCD3', fontSize: 13 }}>
          {ride.status === 'assigned' ? 'Recoger en' : ride.status === 'arrived' ? 'Estás en el punto de recogida' : 'Llevar a'}
        </Text>
        <Text style={{ color: colors.white, fontSize: 18, fontWeight: '700' }}>{target.address ?? 'Ver en el mapa'}</Text>
      </Card>

      {error ? <Banner tone="error" title={error} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Title>{ride.passenger_first_name || 'Pasajero'}</Title>
          <Muted>
            {formatCOP(ride.fare)} · {ride.payment_method === 'cash' ? 'efectivo' : ride.payment_method}
          </Muted>
        </View>
        {ride.passenger_phone ? (
          <Button
            title="Llamar"
            tone="secondary"
            onPress={() => Linking.openURL(`tel:+${ride.passenger_phone!.replace(/\D/g, '')}`)}
            style={{ minHeight: 48 }}
          />
        ) : null}
      </View>
      {ride.passenger_phone ? <Muted style={{ fontSize: 13 }}>{formatPhone(ride.passenger_phone)}</Muted> : null}

      <Button title="Abrir ruta en Google Maps" tone="secondary" onPress={() => openDirections(target.lat, target.lng)} />

      {ride.status === 'assigned' ? <Button title="Llegué al punto" onPress={arrived} loading={busy} /> : null}

      {ride.status === 'arrived' ? (
        <View style={{ gap: 12 }}>
          <Field
            label="Código del pasajero"
            hint="Pídeselo antes de que se suba. Sin el código correcto no se puede iniciar el viaje."
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="0000"
            style={{ minHeight: 60, borderRadius: 16, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.border, textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 12, color: colors.ink }}
          />
          <Button title="Iniciar viaje" onPress={start} loading={busy} disabled={code.length !== 4} />
        </View>
      ) : null}

      {ride.status === 'in_progress' ? (
        <>
          <Banner tone="ok" title="Viaje en curso" body="El pasajero puede compartir este viaje en vivo con un contacto de confianza." />
          <Button title={`Finalizar y cobrar ${formatCOP(ride.fare)}`} tone="go" onPress={finish} loading={busy} />
        </>
      ) : null}

      <SosButton rideId={ride.ride_id} />

      {goingToPickup ? <Button title="Cancelar viaje" tone="ghost" onPress={cancel} disabled={busy} /> : null}

      <View style={{ flex: 1 }} />
      <Label>Viaje {ride.ride_id.slice(0, 8)}</Label>
    </Screen>
  );
}
