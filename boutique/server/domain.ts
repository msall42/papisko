export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => Math.floor(Date.now() / 1000);
export function text(v: unknown, label: string, max = 200, min = 1): string {
  if (typeof v !== "string") throw new HttpError(400, `${label} invalide.`);
  const s = v.trim().normalize("NFC");
  if (s.length < min || s.length > max || /[\u0000-\u001f\u007f]/u.test(s))
    throw new HttpError(400, `${label} invalide.`);
  return s;
}
export function integer(
  v: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw new HttpError(400, `${label} invalide.`);
  return v;
}
export function phone(v: unknown): string {
  const s = text(v, "Téléphone", 24)
    .replace(/[\s()-]/g, "")
    .replace(/^00221/, "+221");
  const p = s.startsWith("+221") ? s : `+221${s}`;
  if (!/^\+221(?:70|72|75|76|77|78)\d{7}$/.test(p))
    throw new HttpError(400, "Indiquez un numéro mobile sénégalais valide.");
  return p;
}
export function coordinates(lat: unknown, lon: unknown) {
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < 14.55 ||
    lat > 15.05 ||
    lon < -17.56 ||
    lon > -17.05
  )
    throw new HttpError(
      400,
      "Position hors de notre zone de livraison à Dakar.",
    );
  return { lat, lon };
}
export function haversine(a: number, b: number, c: number, d: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
export function deliveryFee(km: number) {
  if (!Number.isFinite(km) || km < 0)
    throw new HttpError(400, "Distance invalide.");
  const band = [
    [5, 1000],
    [10, 1500],
    [15, 2000],
    [20, 2500],
    [30, 3000],
  ].find(([limit]) => km <= limit);
  return band ? band[1] : null;
}
export type PriceRow = {
  price: number;
  compare_price: number | null;
  flash_price: number | null;
  flash_start: number | null;
  flash_end: number | null;
};
export function effectivePrice(p: PriceRow, time = now()) {
  const flash =
    p.flash_price !== null &&
    p.flash_start !== null &&
    p.flash_end !== null &&
    p.flash_start <= time &&
    time < p.flash_end;
  return {
    price: flash ? p.flash_price! : p.price,
    compare_price: flash ? p.price : p.compare_price,
    flash_end: flash ? p.flash_end : null,
  };
}
export const transitions: Record<string, string[]> = {
  en_attente: ["expediee", "annulee"],
  payee: ["expediee"],
  expediee: ["livree"],
  livree: [],
  annulee: [],
};
export function canTransition(
  from: string,
  to: string,
  paid: boolean,
  method: string,
) {
  return (
    transitions[from]?.includes(to) &&
    !(to === "expediee" && method === "wave_manual" && !paid)
  );
}
export function imageUrl(v: unknown) {
  if (v === "") return "";
  const s = text(v, "URL de photo", 1000);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, "Lien de photo HTTPS invalide.");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw new HttpError(400, "La photo doit utiliser HTTPS.");
  return u.href;
}
