export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data: any = await response
    .json()
    .catch(() => ({ error: "Le serveur est indisponible." }));
  if (!response.ok)
    throw new ApiError(data.error || "La demande a échoué.", response.status);
  return data;
}
export const money = (n: number) =>
  new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(n) +
  " FCFA";
export const labels: Record<string, string> = {
  en_attente: "En attente",
  payee: "Payée",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
  pending: "À encaisser",
  paid: "Payé",
  cancelled: "Annulé",
};
export type Variant = {
  id: string;
  product_id: string;
  label: string;
  stock: number;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  condition: string;
  category_id: string;
  price: number;
  base_price: number;
  compare_price: number | null;
  flash_price: number | null;
  flash_start: number | null;
  flash_end: number | null;
  image_url: string;
  demo: number;
  active: number;
  variants: Variant[];
  seller_name: string;
};
export type CartLine = {
  variantId: string;
  quantity: number;
  name: string;
  label: string;
  price: number;
  image: string;
  demo: number;
};
