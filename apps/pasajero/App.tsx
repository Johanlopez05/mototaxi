import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { RIDE_STATUS_LABEL } from '@mototaxi/shared';

// Pantalla provisional. Fase 3: mapa con motos cercanas (nearby_drivers) y pedir viaje (request_ride).
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>¿A dónde vas?</Text>
      <Text style={styles.sub}>{RIDE_STATUS_LABEL.searching}…</Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#14161A' },
  sub: { fontSize: 15, color: '#565A63' },
});
