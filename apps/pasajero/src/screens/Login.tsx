import { useState } from 'react';
import { formatPhone, normalizeColombianPhone } from '@mototaxi/shared';
import { errorMessage, supabase } from '../lib/supabase';
import { Banner, Button, Field, Muted, Screen, Title } from '../ui';

/** Inicio de sesión con el celular: código de 6 dígitos por SMS. */
export function Login() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null); // E.164 al que se envió el código
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const e164 = normalizeColombianPhone(phoneInput);
    if (!e164) return setError('Escribe un celular colombiano de 10 dígitos, por ejemplo 300 123 4567.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (e) return setError(errorMessage(e));
    setPhone(e164);
  }

  async function verify() {
    if (!phone || !/^\d{6}$/.test(code)) return setError('El código tiene 6 dígitos.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setBusy(false);
    if (e) setError(errorMessage(e));
    // Si sale bien, App detecta la sesión y cambia de pantalla
  }

  return (
    <Screen>
      <Title>{phone ? 'Escribe el código' : 'Viaja tranquilo en mototaxi'}</Title>
      <Muted>
        {phone
          ? `Te lo enviamos por SMS al ${formatPhone(phone)}.`
          : 'Entra con tu celular. Te enviamos un código por SMS, sin contraseñas. Todos nuestros conductores están verificados.'}
      </Muted>

      {error ? <Banner tone="error" title={error} /> : null}

      {phone ? (
        <>
          <Field
            label="Código"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            placeholder="000000"
            autoFocus
          />
          <Button title="Entrar" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Button
            title="Cambiar número"
            tone="secondary"
            onPress={() => {
              setPhone(null);
              setCode('');
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="Celular"
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder="300 123 4567"
            autoFocus
          />
          <Button title="Enviarme el código" onPress={sendCode} loading={busy} />
        </>
      )}
    </Screen>
  );
}
