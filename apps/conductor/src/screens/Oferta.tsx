import { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { formatCOP, formatDistance, OFFER_TIMEOUT_S, secondsLeft } from '@mototaxi/shared';
import type { Offer } from '../lib/types';
import { Button, Card, colors, Label } from '../ui';

/** Solicitud entrante con cuenta regresiva de 15 s. Se cierra sola al vencer. */
export function OfertaModal({
  offer,
  onAccept,
  onReject,
  onExpire,
  busy,
}: {
  offer: Offer | null;
  onAccept: () => void;
  onReject: () => void;
  onExpire: () => void;
  busy: boolean;
}) {
  const [left, setLeft] = useState(OFFER_TIMEOUT_S);

  useEffect(() => {
    if (!offer) return;
    const tick = () => {
      const s = secondsLeft(offer.expires_at, Date.now());
      setLeft(s);
      if (s <= 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [offer, onExpire]);

  if (!offer) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onReject}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,22,26,0.35)' }}>
        <Card style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 20, paddingBottom: 36, gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2 }}>
              <Label>Nueva solicitud</Label>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>{formatCOP(offer.fare)}</Text>
            </View>
            <View
              accessibilityRole="timer"
              accessibilityLabel={`Quedan ${left} segundos para responder`}
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                borderWidth: 4,
                borderColor: left <= 5 ? colors.red : colors.yellow,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{left}</Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.sand, borderRadius: 16, padding: 14, gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Label>Recoger · a {formatDistance(offer.distance_m)}</Label>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{offer.origin_address ?? 'Ver en el mapa'}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Label>Llevar a</Label>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{offer.destination_address ?? 'Ver en el mapa'}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 15, color: colors.muted }}>
            {offer.passenger_first_name || 'Pasajero'} · pago en efectivo
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Rechazar" tone="secondary" onPress={onReject} disabled={busy} style={{ width: 120 }} />
            <Button title="Aceptar viaje" onPress={onAccept} loading={busy} style={{ flex: 1 }} />
          </View>
        </Card>
      </View>
    </Modal>
  );
}
