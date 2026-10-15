// Autorización de tratamiento de datos (Ley 1581). Copia en apps/conductor: si cambias una, cambia la otra.
// Las casillas empiezan SIN marcar: la ley no acepta una casilla pre-marcada como autorización.
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { CONSENT_TEXT, type ConsentScope } from '@mototaxi/shared';
import { errorMessage, supabase } from '../lib/supabase';
import { Banner, Button, colors, Muted, Screen, Title } from '../ui';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? '';

type AppName = 'pasajero' | 'conductor';

export interface PrivacyStatus {
  current_version: string;
  general: boolean;
  biometric: boolean;
}

/** Qué alcances necesita cada app para funcionar. */
export const REQUIRED_SCOPES: Record<AppName, ConsentScope[]> = {
  pasajero: ['general'],
  conductor: ['general', 'biometric'],
};

export async function loadPrivacyStatus(): Promise<PrivacyStatus | null> {
  const { data, error } = await supabase.rpc('privacy_status');
  if (error) return null;
  return ((data as PrivacyStatus[] | null) ?? [])[0] ?? null;
}

export const missingScopes = (app: AppName, s: PrivacyStatus) => REQUIRED_SCOPES[app].filter((scope) => !s[scope]);

export function Autorizacion({ app, status, onDone }: { app: AppName; status: PrivacyStatus; onDone: () => void }) {
  const missing = missingScopes(app, status);
  const [checked, setChecked] = useState<Record<ConsentScope, boolean>>({ general: false, biometric: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setChecked({ general: false, biometric: false }), [status.current_version]);

  const ready = missing.every((s) => checked[s]);
  const renewal = status.general || status.biometric; // ya había aceptado una versión anterior

  async function accept() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('accept_privacy', {
      p_version: status.current_version,
      p_scopes: missing,
      p_app: app,
    });
    setBusy(false);
    if (e) return setError(errorMessage(e));
    onDone();
  }

  const texts: Record<ConsentScope, string> = {
    general: app === 'conductor' ? CONSENT_TEXT.driverGeneral : CONSENT_TEXT.passengerGeneral,
    biometric: CONSENT_TEXT.driverBiometric,
  };

  return (
    <Screen>
      <Title>{renewal ? 'Actualizamos la política de datos' : 'Tus datos, tus reglas'}</Title>
      <Muted>
        {app === 'conductor'
          ? 'Para verificarte y que los pasajeros sepan con quién se suben, necesitamos tu autorización.'
          : 'Para llevarte seguro, necesitamos tu autorización para usar algunos datos.'}{' '}
        Puedes revocarla cuando quieras escribiéndonos.
      </Muted>

      {PRIVACY_URL ? (
        <Button title="Leer la política de tratamiento de datos" tone="secondary" onPress={() => Linking.openURL(PRIVACY_URL)} />
      ) : null}
      {error ? <Banner tone="error" title={error} /> : null}

      {missing.map((scope) => (
        <Checkbox
          key={scope}
          checked={checked[scope]}
          onChange={(v) => setChecked((c) => ({ ...c, [scope]: v }))}
          label={texts[scope]}
          sensitive={scope === 'biometric'}
        />
      ))}

      <Button title="Aceptar y continuar" onPress={accept} loading={busy} disabled={!ready} />
      <Button title="No acepto · salir" tone="ghost" onPress={() => supabase.auth.signOut()} />
      <Muted style={{ fontSize: 13 }}>Versión de la política: {status.current_version}</Muted>
    </Screen>
  );
}

function Checkbox({ checked, onChange, label, sensitive }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sensitive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: checked ? colors.green : colors.border,
        backgroundColor: colors.white,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: checked ? colors.green : colors.muted,
          backgroundColor: checked ? colors.green : colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        }}
      >
        {checked ? <Text style={{ color: colors.white, fontWeight: '800', fontSize: 16 }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {sensitive ? (
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.redInk, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Dato sensible
          </Text>
        ) : null}
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.ink }}>{label}</Text>
      </View>
    </Pressable>
  );
}
