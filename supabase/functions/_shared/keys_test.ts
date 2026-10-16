// deno test supabase/functions/_shared
import { deepStrictEqual as eq, throws } from 'node:assert/strict';
import { supabaseKey } from './keys.ts';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

Deno.test('usa la llave nueva "default" cuando existe', () => {
  const e = env({
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_abc","otra":"sb_secret_xyz"}',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy',
  });
  eq(supabaseKey('secret', e), 'sb_secret_abc');
});

Deno.test('sin "default", usa la primera llave nueva', () => {
  eq(supabaseKey('publishable', env({ SUPABASE_PUBLISHABLE_KEYS: '{"app":"sb_publishable_1"}' })), 'sb_publishable_1');
});

Deno.test('acepta la llave nueva sola, sin JSON', () => {
  eq(supabaseKey('secret', env({ SUPABASE_SECRET_KEYS: 'sb_secret_solo' })), 'sb_secret_solo');
});

Deno.test('sin llaves nuevas, cae a las anteriores', () => {
  eq(supabaseKey('publishable', env({ SUPABASE_ANON_KEY: 'eyJ.anon' })), 'eyJ.anon');
  eq(supabaseKey('secret', env({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service' })), 'eyJ.service');
});

Deno.test('JSON vacío o roto: cae a las anteriores', () => {
  eq(supabaseKey('secret', env({ SUPABASE_SECRET_KEYS: '{}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service' })), 'eyJ.service');
  eq(supabaseKey('secret', env({ SUPABASE_SECRET_KEYS: '{roto', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service' })), 'eyJ.service');
});

Deno.test('sin ninguna llave: error claro', () => {
  throws(() => supabaseKey('secret', env({})), /SUPABASE_SECRET_KEYS/);
});
