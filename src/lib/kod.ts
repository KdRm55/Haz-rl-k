/** Erişim kodlarının özeti. Kodun kendisi hiçbir yerde saklanmaz (Apps Script'te düz metin olarak duruyordu). */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function kodOzeti(kod: string): string {
  const tuz = randomBytes(16);
  return 'scrypt$' + tuz.toString('base64url') + '$' + scryptSync(kod, tuz, 32).toString('base64url');
}

export function kodDogru(kod: string, ozet: string): boolean {
  const [tur, tuz, deger] = ozet.split('$');
  if (tur !== 'scrypt' || !tuz || !deger) return false;
  const beklenen = Buffer.from(deger, 'base64url');
  const gelen = scryptSync(kod, Buffer.from(tuz, 'base64url'), beklenen.length);
  return timingSafeEqual(beklenen, gelen);
}

export const KOD_EN_AZ = 6;
