import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { DOCUMENTS_BUCKET, type DocType, documentPath } from '@mototaxi/shared';
import { supabase } from './supabase';

export type PhotoSource = 'camera' | 'library';

/** Abre la cámara o la galería. Devuelve la foto en base64 (JPEG) o null si cancela. */
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(source === 'camera' ? 'Necesitamos permiso para usar la cámara.' : 'Necesitamos permiso para ver tus fotos.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  return result.assets[0].base64;
}

/**
 * Sube la foto al bucket privado y registra el documento.
 * Si ya existía, lo actualiza: la base de datos lo devuelve a "pendiente".
 */
export async function uploadDocument(
  driverId: string,
  type: DocType,
  base64Jpeg: string,
  expiresOn: string | null,
): Promise<void> {
  const path = documentPath(driverId, type);
  const upload = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, decode(base64Jpeg), { contentType: 'image/jpeg', upsert: true });
  if (upload.error) throw upload.error;

  // update primero; si no existía, insert (el conductor no puede hacer upsert de driver_id/type)
  const updated = await supabase
    .from('driver_documents')
    .update({ file_path: path, expires_on: expiresOn })
    .eq('driver_id', driverId)
    .eq('type', type)
    .select('id');
  if (updated.error) throw updated.error;
  if (updated.data.length > 0) return;

  const inserted = await supabase
    .from('driver_documents')
    .insert({ driver_id: driverId, type, file_path: path, expires_on: expiresOn });
  if (inserted.error) throw inserted.error;
}
