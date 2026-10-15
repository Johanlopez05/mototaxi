import { useState } from 'react';
import { errorMessage, supabase } from '../lib/supabase';
import { Banner, Button, Field, Muted, Screen, Title } from '../ui';

/** Primera vez: el nombre con el que te ve el conductor. */
export function Nombre({ userId, onDone }: { userId: string; onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return setError('Escribe tu nombre.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('profiles').update({ full_name: clean }).eq('id', userId);
    setBusy(false);
    if (e) return setError(errorMessage(e));
    onDone(clean);
  }

  return (
    <Screen>
      <Title>¿Cómo te llamas?</Title>
      <Muted>El conductor solo ve tu primer nombre, para saludarte al recogerte.</Muted>
      {error ? <Banner tone="error" title={error} /> : null}
      <Field label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Laura Rodríguez" autoFocus />
      <Button title="Continuar" onPress={save} loading={busy} />
    </Screen>
  );
}
