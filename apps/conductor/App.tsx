import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { DRIVER_STATUS_LABEL, REQUIRED_DOCS } from '@mototaxi/shared';

// Pantalla provisional. Fase 2: registro, subida de documentos y botón de disponible.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tus documentos</Text>
      <Text style={styles.sub}>
        {REQUIRED_DOCS.length} documentos · {DRIVER_STATUS_LABEL.pending}
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#14161A' },
  sub: { fontSize: 15, color: '#565A63' },
});
