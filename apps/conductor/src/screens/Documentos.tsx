import { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import {
  DRIVER_STATUS_LABEL,
  type DocType,
  formatDateDMY,
  parseDateDMY,
  REQUIRED_DOCS,
  todayInColombia,
} from '@mototaxi/shared';
import { type PhotoSource, pickPhoto, uploadDocument } from '../lib/documents';
import { errorMessage, supabase } from '../lib/supabase';
import type { DocumentRow, DriverRow } from '../lib/types';
import { Banner, Button, Card, colors, Field, Muted, Screen, Title } from '../ui';

/** Paso 2 y 3: subir los 6 documentos y enviarlos a revisión. También muestra el estado de la revisión. */
export function Documentos({
  driver,
  documents,
  onChanged,
}: {
  driver: DriverRow;
  documents: DocumentRow[];
  onChanged: () => Promise<void>;
}) {
  const [busyType, setBusyType] = useState<DocType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askExpiry, setAskExpiry] = useState<{ type: DocType; label: string; base64: string } | null>(null);
  const [expiryText, setExpiryText] = useState('');

  const byType = new Map(documents.map((d) => [d.type, d]));
  const uploaded = REQUIRED_DOCS.filter((d) => byType.has(d.type)).length;
  const editable = driver.status === 'pending' || driver.status === 'needs_fix' || driver.status === 'suspended';
  const today = todayInColombia();

  async function save(type: DocType, base64: string, expiresOn: string | null) {
    setBusyType(type);
    setError(null);
    try {
      await uploadDocument(driver.id, type, base64, expiresOn);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyType(null);
    }
  }

  async function choose(type: DocType, label: string, expires: boolean, source: PhotoSource) {
    try {
      const base64 = await pickPhoto(source);
      if (!base64) return;
      if (expires) {
        setExpiryText(byType.get(type)?.expires_on ? formatDateDMY(byType.get(type)!.expires_on!) : '');
        setAskExpiry({ type, label, base64 });
      } else {
        await save(type, base64, null);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onDocPress(type: DocType, label: string, expires: boolean) {
    if (!editable) return;
    Alert.alert(label, 'Toma la foto con buena luz y que se lea todo el documento.', [
      { text: 'Tomar foto', onPress: () => choose(type, label, expires, 'camera') },
      { text: 'Elegir de la galería', onPress: () => choose(type, label, expires, 'library') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function confirmExpiry() {
    if (!askExpiry) return;
    const iso = parseDateDMY(expiryText);
    if (!iso) return Alert.alert('Fecha no válida', 'Escríbela como DD/MM/AAAA, por ejemplo 05/03/2027.');
    if (iso < today) return Alert.alert('Documento vencido', 'Ese documento ya venció. Necesitas uno vigente para trabajar.');
    const { type, base64 } = askExpiry;
    setAskExpiry(null);
    await save(type, base64, iso);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const { error: e } = await supabase.rpc('submit_for_review');
    setSubmitting(false);
    if (e) return setError(errorMessage(e));
    await onChanged();
    Alert.alert('Enviado', 'Revisamos tus documentos en menos de 24 horas. Te avisamos cuando estés aprobado.');
  }

  const notes = documents.filter((d) => d.status === 'rejected' && d.reviewer_note);

  return (
    <Screen>
      <Muted style={{ fontWeight: '700', textTransform: 'uppercase', fontSize: 13 }}>
        {editable ? 'Paso 2 de 3' : 'Tu cuenta'}
      </Muted>
      <Title>Tus documentos</Title>

      {driver.status === 'pending' && uploaded === REQUIRED_DOCS.length ? (
        <Banner tone="info" title="En revisión" body="Los revisamos en menos de 24 horas. Sin aprobación no puedes recibir viajes." />
      ) : null}
      {driver.status === 'needs_fix' ? (
        <Banner tone="warn" title="Corrige tus documentos" body={notes.map((n) => n.reviewer_note).join(' · ') || 'Revisa los marcados en rojo y vuelve a enviarlos.'} />
      ) : null}
      {driver.status === 'rejected' || driver.status === 'suspended' ? (
        <Banner
          tone="error"
          title={DRIVER_STATUS_LABEL[driver.status]}
          body={
            driver.status === 'suspended'
              ? 'Un documento venció. Sube el nuevo y envíalo a revisión para volver a trabajar.'
              : 'Tu solicitud no fue aprobada.'
          }
        />
      ) : null}
      {error ? <Banner tone="error" title={error} /> : null}

      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 6, now: uploaded }} style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${(uploaded / REQUIRED_DOCS.length) * 100}%`, height: 8, backgroundColor: colors.green }} />
      </View>

      {REQUIRED_DOCS.map(({ type, label, expires }) => {
        const doc = byType.get(type);
        const expired = expires && doc?.expires_on != null && doc.expires_on < today;
        const status = !doc
          ? { text: editable ? 'Toca para subir foto' : 'Falta', color: colors.muted }
          : doc.status === 'rejected' || expired
            ? { text: expired ? 'Vencido · súbelo de nuevo' : 'Rechazado · súbelo de nuevo', color: colors.redInk }
            : doc.status === 'approved'
              ? { text: 'Aprobado', color: colors.green }
              : { text: 'Subido · en revisión', color: colors.green };
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={`${label}. ${status.text}`}
            onPress={() => onDocPress(type, label, expires)}
            disabled={!editable || busyType !== null}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: doc && doc.status !== 'rejected' && !expired ? '#B9DCD3' : colors.border }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: doc && doc.status !== 'rejected' && !expired ? colors.green : colors.yellow,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '800', color: doc && doc.status !== 'rejected' && !expired ? colors.white : colors.ink }}>
                  {busyType === type ? '…' : doc && doc.status !== 'rejected' && !expired ? '✓' : '↑'}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{label}</Text>
                <Text style={{ fontSize: 13, color: status.color }}>
                  {busyType === type ? 'Subiendo…' : status.text}
                  {doc?.expires_on ? ` · vence ${formatDateDMY(doc.expires_on)}` : ''}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <Muted style={{ fontSize: 13 }}>Tus documentos solo los ve el equipo de verificación.</Muted>

      {editable ? (
        <Button
          title={uploaded < REQUIRED_DOCS.length ? `Faltan ${REQUIRED_DOCS.length - uploaded} documentos` : 'Enviar a revisión'}
          onPress={submit}
          loading={submitting}
          disabled={uploaded < REQUIRED_DOCS.length}
        />
      ) : null}
      <Button title="Actualizar estado" tone="secondary" onPress={onChanged} />
      <Button title="Cerrar sesión" tone="ghost" onPress={() => supabase.auth.signOut()} />

      <Modal visible={askExpiry !== null} transparent animationType="fade" onRequestClose={() => setAskExpiry(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(20,22,26,0.5)', justifyContent: 'center', padding: 20 }}>
          <Card style={{ gap: 16 }}>
            <Title>¿Cuándo vence?</Title>
            <Muted>{askExpiry?.label}. Te avisamos 15 días antes de que se venza.</Muted>
            <Field label="Fecha de vencimiento" value={expiryText} onChangeText={setExpiryText} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" autoFocus />
            <Button title="Guardar" onPress={confirmExpiry} />
            <Button title="Cancelar" tone="secondary" onPress={() => setAskExpiry(null)} />
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
