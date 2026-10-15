// Componentes base con los colores del diseño (lienzo "Mototaxi — Pasajero, conductor y panel"). Copia de apps/conductor/src/ui.tsx.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  ink: '#14161A',
  muted: '#565A63',
  subtle: '#6B6F78',
  bg: '#F6F4EE',
  sand: '#F2F0EA',
  border: '#E2DFD6',
  white: '#FFFFFF',
  yellow: '#FFC22E',
  green: '#0B6B5D',
  greenInk: '#0B4F45',
  greenSoft: '#E4F2EE',
  red: '#B42318',
  redInk: '#A3261F',
  redSoft: '#FCE8E6',
  amberSoft: '#FFF1CC',
  amberInk: '#7A4A00',
};

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: ReactNode }) => (
  <Text style={styles.title} accessibilityRole="header">
    {children}
  </Text>
);

export const Muted = ({ children, style }: { children: ReactNode; style?: object }) => (
  <Text style={[styles.muted, style]}>{children}</Text>
);

export const Label = ({ children }: { children: ReactNode }) => <Text style={styles.label}>{children}</Text>;

type ButtonTone = 'primary' | 'go' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  tone = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  tone?: ButtonTone;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = buttonTones[tone];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: off && tone !== 'ghost' ? colors.border : t.bg, borderColor: t.border },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={t.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: off && tone !== 'ghost' ? colors.muted : t.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const buttonTones: Record<ButtonTone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.ink, fg: colors.white, border: colors.ink },
  go: { bg: colors.green, fg: colors.white, border: colors.green },
  secondary: { bg: colors.white, fg: colors.ink, border: colors.border },
  danger: { bg: colors.red, fg: colors.white, border: colors.red },
  ghost: { bg: 'transparent', fg: colors.redInk, border: 'transparent' },
};

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor={colors.subtle} style={styles.input} accessibilityLabel={label} {...input} />
      {hint ? <Muted style={{ fontSize: 13 }}>{hint}</Muted> : null}
    </View>
  );
}

type BannerTone = 'ok' | 'warn' | 'error' | 'info';

export function Banner({ tone, title, body }: { tone: BannerTone; title: string; body?: string | null }) {
  const t = {
    ok: { bg: colors.greenSoft, fg: colors.greenInk },
    warn: { bg: colors.amberSoft, fg: colors.amberInk },
    error: { bg: colors.redSoft, fg: colors.redInk },
    info: { bg: colors.sand, fg: colors.ink },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text>
      {body ? <Text style={[styles.bannerBody, { color: t.fg }]}>{body}</Text> : null}
    </View>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', color: colors.subtle, textTransform: 'uppercase', letterSpacing: 0.6 },
  button: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 17, fontWeight: '800' },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.ink,
  },
  banner: { borderRadius: 16, padding: 14, gap: 4 },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerBody: { fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 },
});
