import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { formatPhone, normalizeColombianPhone } from '@mototaxi/shared';
import { errorMessage, supabase } from '../lib/supabase';
import { Banner, Button, Card, colors, Field, Muted, Screen, Title } from '../ui';

const MAX_CONTACTS = 5;

interface Contact {
  id: string;
  name: string;
  phone: string;
}

/** Contactos de confianza: reciben un SMS con tu ubicación en vivo si presionas SOS. */
export function Contactos({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('trusted_contacts').select('id, name, phone').order('created_at');
    if (e) return setError(errorMessage(e));
    setContacts((data as Contact[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const e164 = normalizeColombianPhone(phone);
    if (!name.trim()) return setError('Escribe el nombre del contacto.');
    if (!e164) return setError('Escribe un celular colombiano de 10 dígitos, por ejemplo 300 123 4567.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('trusted_contacts').insert({ profile_id: userId, name: name.trim(), phone: e164 });
    setBusy(false);
    if (e) {
      return setError(/duplicate|unique/i.test(e.message) ? 'Ese número ya está en tus contactos.' : errorMessage(e));
    }
    setName('');
    setPhone('');
    await load();
  }

  function remove(c: Contact) {
    Alert.alert(`¿Quitar a ${c.name}?`, 'Ya no recibirá avisos si presionas SOS.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('trusted_contacts').delete().eq('id', c.id);
          if (e) return setError(errorMessage(e));
          await load();
        },
      },
    ]);
  }

  const full = (contacts?.length ?? 0) >= MAX_CONTACTS;

  return (
    <Screen>
      <Title>Contactos de confianza</Title>
      <Muted>
        Si presionas SOS en un viaje, les llega un SMS con tu ubicación en vivo y los datos de la moto. Avísales que los
        agregaste.
      </Muted>
      {error ? <Banner tone="error" title={error} /> : null}

      {contacts === null ? (
        <Muted>Cargando…</Muted>
      ) : contacts.length === 0 ? (
        <Banner tone="warn" title="Aún no tienes contactos" body="Agrega al menos uno: es lo primero que te protege en una emergencia." />
      ) : (
        contacts.map((c) => (
          <Card key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{c.name}</Text>
              <Muted style={{ fontSize: 14 }}>{formatPhone(c.phone)}</Muted>
            </View>
            <Button title="Quitar" tone="ghost" onPress={() => remove(c)} style={{ minHeight: 44 }} />
          </Card>
        ))
      )}

      {full ? (
        <Muted>Tienes {MAX_CONTACTS} contactos, el máximo. Quita uno para agregar otro.</Muted>
      ) : (
        <Card style={{ gap: 12 }}>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Mamá" autoCapitalize="words" maxLength={60} />
          <Field label="Celular" value={phone} onChangeText={setPhone} placeholder="300 123 4567" keyboardType="phone-pad" />
          <Button title="Agregar contacto" onPress={add} loading={busy} />
        </Card>
      )}

      <Button title="Volver" tone="secondary" onPress={onBack} />
    </Screen>
  );
}
