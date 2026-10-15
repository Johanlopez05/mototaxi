// node --test packages/shared/src
import { test } from 'node:test';
import { deepStrictEqual as eq, ok } from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONSENT_TEXT, MIN_AGE, PRIVACY_POLICY_VERSION } from './legal.ts';

const migrations = join(import.meta.dirname, '../../../supabase/migrations');

test('la versión de la política en el código es la última que fijan las migraciones', () => {
  // Busca, en orden, cada migración que inserte o actualice la versión de public.privacy_policy
  let sqlVersion: string | null = null;
  for (const file of readdirSync(migrations).sort()) {
    const sql = readFileSync(join(migrations, file), 'utf8');
    for (const m of sql.matchAll(/privacy_policy[^;]*?(?:values|version\s*=)\s*\(?\s*'(\d{4}-\d{2}-\d{2})'/gi)) {
      sqlVersion = m[1];
    }
  }
  eq(PRIVACY_POLICY_VERSION, sqlVersion);
});

test('los textos de autorización dicen la edad mínima, el exterior y que el dato sensible es opcional', () => {
  for (const t of [CONSENT_TEXT.passengerGeneral, CONSENT_TEXT.driverGeneral]) {
    ok(t.includes(`${MIN_AGE} años`));
    ok(t.includes('fuera de Colombia'));
  }
  ok(CONSENT_TEXT.driverBiometric.includes('dato sensible'));
  ok(CONSENT_TEXT.driverBiometric.includes('no estoy obligado'));
});
