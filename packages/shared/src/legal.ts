// Datos legales y textos de autorización (Ley 1581 de 2012).
// ÚNICO lugar donde se llenan los datos del responsable: los usan las dos apps
// y la página /privacidad del panel. Antes de publicar, reemplaza los [CORCHETES].

export const RESPONSIBLE = {
  name: '[RAZÓN SOCIAL o NOMBRE]',
  id: '[NIT o C.C.]',
  address: '[DIRECCIÓN]',
  city: '[CIUDAD]',
  email: '[CORREO, p. ej. datos@tumototaxi.co]',
  phone: '[TELÉFONO]',
  area: '[ÁREA O PERSONA RESPONSABLE, p. ej. Protección de datos]',
} as const;

/** true mientras falte llenar algún dato del responsable */
export const legalPlaceholdersPending = Object.values(RESPONSIBLE).some((v) => v.startsWith('['));

/**
 * Versión vigente de la política. Debe ser igual a public.privacy_policy.version:
 * si la cambias, crea una migración que actualice esa fila (todos vuelven a aceptar).
 */
export const PRIVACY_POLICY_VERSION = '2026-10-15';

/** Ruta de la política en el panel (página pública). */
export const PRIVACY_PATH = '/privacidad';

export type ConsentScope = 'general' | 'biometric';

/** Edad mínima para usar la plataforma (ver la política, sección 8). */
export const MIN_AGE = 18;

/** Textos de las casillas. Deben coincidir con la sección 9 de la política. */
export const CONSENT_TEXT = {
  passengerGeneral:
    `Tengo ${MIN_AGE} años o más, leí la política de tratamiento de datos y autorizo a ${RESPONSIBLE.name} a tratar mis datos ` +
    '(celular, nombre, viajes y ubicación mientras uso la app) para prestarme el servicio y proteger mi seguridad. ' +
    'También autorizo que se procesen en servidores de proveedores fuera de Colombia, como dice la política.',
  driverGeneral:
    `Tengo ${MIN_AGE} años o más, leí la política de tratamiento de datos y autorizo a ${RESPONSIBLE.name} a tratar mis datos ` +
    '(celular, nombre, documentos, datos de la moto, viajes y mi ubicación mientras estoy conectado o en un viaje) ' +
    'para verificarme y prestar el servicio. También autorizo que se procesen en servidores de proveedores fuera de ' +
    'Colombia, como dice la política.',
  driverBiometric:
    'Autorizo el tratamiento de la foto de mi rostro, que es un dato sensible, para verificar mi identidad y ' +
    'mostrársela a mis pasajeros. Sé que no estoy obligado a autorizar datos sensibles, pero sin esta foto no puedo ' +
    'trabajar en la plataforma.',
  trustedContactNotice:
    'Al agregarlo, confirmas que esta persona está de acuerdo en recibir un SMS si activas el botón de emergencia. ' +
    'Su nombre y su celular se usan solo para eso.',
} as const;
