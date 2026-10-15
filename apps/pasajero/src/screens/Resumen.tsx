import { Text, View } from 'react-native';
import { formatCOP } from '@mototaxi/shared';
import type { PassengerRide } from '../lib/types';
import { Banner, Button, Card, colors, Label, Muted, Screen, Title } from '../ui';

const CANCELLED: Record<string, { title: string; body: string }> = {
  no_drivers: { title: 'No encontramos un mototaxi', body: 'Ningún conductor cercano pudo tomar tu viaje. Intenta de nuevo en unos minutos.' },
  driver: { title: 'El conductor canceló', body: 'No se te cobra nada. Puedes pedir otro mototaxi.' },
  passenger: { title: 'Cancelaste el viaje', body: 'No se te cobra nada.' },
};

/** Fin del viaje: llegaste, o por qué se canceló. */
export function Resumen({ ride, onDone }: { ride: PassengerRide; onDone: () => void }) {
  if (ride.status === 'cancelled') {
    const c = CANCELLED[ride.cancel_reason ?? 'no_drivers'];
    return (
      <Screen>
        <Title>{c.title}</Title>
        <Banner tone={ride.cancel_reason === 'passenger' ? 'info' : 'warn'} title={c.body} />
        <View style={{ flex: 1 }} />
        <Button title="Pedir otro mototaxi" onPress={onDone} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Llegaste</Title>
      <Muted>Gracias por viajar con {ride.driver_name?.split(' ')[0] ?? 'nosotros'}.</Muted>
      <Card>
        <Label>Total en efectivo</Label>
        <Text style={{ fontSize: 34, fontWeight: '800', color: colors.ink }}>{formatCOP(ride.fare)}</Text>
        <Muted style={{ fontSize: 14 }}>
          {ride.origin_address ?? 'Recogida'} → {ride.destination_address ?? 'Destino'}
        </Muted>
        {ride.plate ? <Muted style={{ fontSize: 14 }}>Moto {ride.plate}</Muted> : null}
      </Card>
      <View style={{ flex: 1 }} />
      <Button title="Listo" onPress={onDone} />
    </Screen>
  );
}
