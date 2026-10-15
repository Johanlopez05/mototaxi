import { useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { triggerSos } from '../lib/safety';
import { colors } from '../ui';

const HOLD_MS = 3_000;

const call123 = () => Linking.openURL('tel:123');

/**
 * Botón de emergencia. Se mantiene presionado 3 s (para que no se active en el
 * bolsillo); una barra se llena mientras tanto. Al activarse: registra la
 * alerta, avisa a los contactos de confianza y ofrece llamar al 123.
 */
export function SosButton({ rideId }: { rideId: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function start() {
    if (sending) return;
    Vibration.vibrate(30);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
  }

  function cancel() {
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }

  async function fire() {
    setSending(true);
    Vibration.vibrate([0, 200, 100, 200]);
    const result = await triggerSos(rideId);
    setSending(false);
    progress.setValue(0);

    if (!result.ok) {
      Alert.alert('No pudimos enviar la alerta', 'Revisa tu conexión. Si estás en peligro, llama ya al 123.', [
        { text: 'Llamar al 123', onPress: call123, style: 'destructive' },
        { text: 'Cerrar', style: 'cancel' },
      ]);
      return;
    }
    setSent(true);
    const body =
      result.notified > 0
        ? `Avisamos a ${result.notified} contacto${result.notified === 1 ? '' : 's'} de confianza con tu ubicación en vivo, y al equipo de Mototaxi.`
        : result.reason === 'no_contacts'
          ? 'Avisamos al equipo de Mototaxi. No tienes contactos de confianza: agrégalos en el inicio para que también les llegue.'
          : 'Avisamos al equipo de Mototaxi con tu ubicación.';
    Alert.alert('Alerta enviada', `${body}\n\nSi estás en peligro, llama al 123.`, [
      { text: 'Llamar al 123', onPress: call123, style: 'destructive' },
      { text: 'Estoy bien', style: 'cancel' },
    ]);
  }

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      onLongPress={fire}
      delayLongPress={HOLD_MS}
      disabled={sending}
      accessibilityRole="button"
      accessibilityLabel="Botón de emergencia. Mantén presionado tres segundos para pedir ayuda."
      accessibilityHint="Avisa a tus contactos de confianza y al equipo de Mototaxi"
      // Lectores de pantalla: doble toque mantenido no es práctico; la acción "activar" lo dispara directo
      accessibilityActions={[{ name: 'activate', label: 'Pedir ayuda' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && fire()}
      style={s.button}
    >
      <Animated.View style={[s.fill, { width }]} />
      <View style={s.badge}>
        <Text style={s.badgeText}>SOS</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{sending ? 'Enviando alerta…' : sent ? 'Alerta enviada' : 'Emergencia'}</Text>
        <Text style={s.sub}>
          {sent ? 'Mantén presionado otra vez para actualizar tu ubicación' : 'Mantén presionado 3 s · avisa a tus contactos'}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    minHeight: 68,
    borderRadius: 18,
    backgroundColor: '#B42318',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#7A1A12' },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#B42318', fontWeight: '800', fontSize: 14 },
  title: { color: colors.white, fontSize: 17, fontWeight: '800' },
  sub: { color: '#FFE4E1', fontSize: 13 },
});
