import "server-only";
import { connection } from "next/server";

/**
 * Hora de la petición (ms). Espera a que llegue una petición real, así nunca
 * se ejecuta al prerenderizar (cacheComponents) y cada visita ve la hora actual.
 */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
