#!/usr/bin/env bash
# Prueba la migración y el flujo completo de un viaje contra un Postgres local con PostGIS.
# Usa las variables estándar de Postgres (PGHOST, PGPORT, PGUSER, PGPASSWORD). Ejemplo:
#   PGHOST=localhost PGUSER=postgres npm run test:db
# Crea una base temporal "mototaxi_test", simula lo que trae Supabase (00_stub) y corre el flujo.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=mototaxi_test

psql -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/00_stub_supabase.sql 2> >(grep -v -E 'wal_level|HINT' >&2)
for f in supabase/migrations/*.sql; do
  echo "→ migración $f"
  psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo "→ flujo de viaje (los ERROR esperados son bloqueos de seguridad que deben ocurrir)"
psql -d "$DB" -q -f supabase/tests/01_flujo_viaje.sql
echo "→ reparto de solicitudes"
psql -d "$DB" -q -t -f supabase/tests/02_reparto_ofertas.sql | sed '/^\s*$/d'
psql -d postgres -q -c "drop database $DB"
