import { useState } from 'react';
import { normalizePlate, PLATE_REGEX } from '@mototaxi/shared';
import { errorMessage, supabase } from '../lib/supabase';
import { Banner, Button, Field, Muted, Screen, Title } from '../ui';

/** Paso 1 de 3: nombre y datos de la moto. */
export function Registro({ userId, initialName, onDone }: { userId: string; initialName: string; onDone: () => void }) {
  const [name, setName] = useState(initialName);
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cleanPlate = normalizePlate(plate);
    if (name.trim().split(/\s+/).length < 2) return setError('Escribe tu nombre y apellido, como en la cédula.');
    if (!PLATE_REGEX.test(cleanPlate)) return setError('La placa de moto tiene 3 letras, 2 números y 1 letra. Ejemplo: ABC12D.');
    if (!color.trim()) return setError('Escribe el color de la moto: así el pasajero la reconoce.');

    setBusy(true);
    setError(null);
    const profile = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', userId);
    if (profile.error) {
      setBusy(false);
      return setError(errorMessage(profile.error));
    }
    const driver = await supabase.from('drivers').insert({
      id: userId,
      plate: cleanPlate,
      moto_color: color.trim().toLowerCase(),
      moto_brand: brand.trim() || null,
    });
    setBusy(false);
    if (driver.error) return setError(errorMessage(driver.error));
    onDone();
  }

  return (
    <Screen>
      <Muted style={{ fontWeight: '700', textTransform: 'uppercase', fontSize: 13 }}>Paso 1 de 3</Muted>
      <Title>Tus datos y tu moto</Title>
      <Muted>El pasajero verá tu nombre, tu foto y la placa antes de subirse.</Muted>
      {error ? <Banner tone="error" title={error} /> : null}

      <Field label="Nombre completo" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Como aparece en tu cédula" />
      <Field
        label="Placa"
        value={plate}
        onChangeText={(t) => setPlate(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        placeholder="ABC12D"
      />
      <Field label="Color de la moto" value={color} onChangeText={setColor} placeholder="Roja" />
      <Field label="Marca y modelo (opcional)" value={brand} onChangeText={setBrand} placeholder="AKT NKD 125" />

      <Button title="Continuar" onPress={save} loading={busy} />
    </Screen>
  );
}
