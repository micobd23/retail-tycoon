// ---------------------------------------------------------------------------
// Produktkatalog — angelehnt an ein typisches deutsches Supermarkt-Sortiment.
// EK = Einkaufspreis (Großhandel), VK = markt-gegebener Verkaufspreis.
// salesPerDay = Basis-Drehzahl (ohne saisonale Faktoren).
// seasonFactors: saisonale Nachfrage-Multiplikatoren (±30% Schwankung).
// onlyInSeason: Produkt ist nur in dieser Saison erhältlich (Saison-Special).
// ---------------------------------------------------------------------------

export type Season = "Frühling" | "Sommer" | "Herbst" | "Winter";
export const SEASONS: Season[] = ["Frühling", "Sommer", "Herbst", "Winter"];

export type Category =
  | "Getränke"
  | "Grundnahrung"
  | "Drogerie"
  | "Süßwaren"
  | "Frische"
  | "Saisonales";

export type Storage = "trocken" | "frisch";

export interface Product {
  id: string;
  name: string;
  category: Category;
  storage: Storage;
  ek: number; // Basis-Einkaufspreis pro Stück
  vk: number; // Verkaufspreis pro Stück (vom Markt vorgegeben)
  salesPerDay: number; // Basis-Nachfrage pro Tag
  shelfLifeDays?: number; // nur bei Frischware (Verderb)
  seasonFactors?: Partial<Record<Season, number>>; // Nachfrage-Multiplikator je Saison (1.0 = neutral)
  onlyInSeason?: Season; // Saison-Special: nur in dieser Saison kaufbar/verkaufbar
}

// 13 Tage pro Quartal · 4 Quartale = 52 Tage pro Jahr
export function dayToCalendar(day: number): {
  year: number;
  quarter: number;
  seasonDay: number;
  season: Season;
} {
  const d = day - 1; // 0-basiert
  const year = Math.floor(d / 52) + 1;
  const quarterIndex = Math.floor((d % 52) / 13); // 0–3
  const seasonDay = (d % 13) + 1; // 1–13
  return { year, quarter: quarterIndex + 1, seasonDay, season: SEASONS[quarterIndex] };
}

export const CATALOG: Product[] = [
  // --- Getränke (trocken lagerbar) ---
  {
    id: "cola", name: "Cola 1,0 L", category: "Getränke", storage: "trocken",
    ek: 0.55, vk: 0.99, salesPerDay: 35,
    seasonFactors: { Sommer: 1.3, Frühling: 1.1, Herbst: 0.9, Winter: 0.75 },
  },
  {
    id: "wasser", name: "Mineralwasser 1,5 L", category: "Getränke", storage: "trocken",
    ek: 0.19, vk: 0.39, salesPerDay: 50,
    seasonFactors: { Sommer: 1.25, Frühling: 1.05, Herbst: 0.9, Winter: 0.85 },
  },
  {
    id: "bier", name: "Pils 0,5 L", category: "Getränke", storage: "trocken",
    ek: 0.55, vk: 0.89, salesPerDay: 40,
    seasonFactors: { Sommer: 1.3, Frühling: 1.1, Herbst: 0.95, Winter: 0.75 },
  },
  {
    id: "saft", name: "Orangensaft 1 L", category: "Getränke", storage: "trocken",
    ek: 0.75, vk: 1.29, salesPerDay: 18,
    seasonFactors: { Winter: 1.25, Herbst: 1.15, Frühling: 0.9, Sommer: 0.8 },
  },

  // --- Grundnahrung (trocken) ---
  {
    id: "haferflocken", name: "Haferflocken 500 g", category: "Grundnahrung", storage: "trocken",
    ek: 0.49, vk: 0.85, salesPerDay: 12,
    seasonFactors: { Herbst: 1.15, Winter: 1.25, Frühling: 0.95, Sommer: 0.8 },
  },
  {
    id: "spaghetti", name: "Spaghetti 500 g", category: "Grundnahrung", storage: "trocken",
    ek: 0.39, vk: 0.69, salesPerDay: 20,
  },
  {
    id: "mehl", name: "Weizenmehl 1 kg", category: "Grundnahrung", storage: "trocken",
    ek: 0.35, vk: 0.59, salesPerDay: 15,
    seasonFactors: { Winter: 1.3, Herbst: 1.15, Frühling: 0.9, Sommer: 0.8 },
  },
  {
    id: "reis", name: "Reis 1 kg", category: "Grundnahrung", storage: "trocken",
    ek: 0.89, vk: 1.49, salesPerDay: 10,
  },

  // --- Drogerie (trocken) ---
  { id: "seife", name: "Kernseife", category: "Drogerie", storage: "trocken", ek: 0.27, vk: 0.39, salesPerDay: 5 },
  { id: "zahnpasta", name: "Zahnpasta", category: "Drogerie", storage: "trocken", ek: 0.65, vk: 1.45, salesPerDay: 8 },
  { id: "klopapier", name: "Toilettenpapier 8er", category: "Drogerie", storage: "trocken", ek: 1.8, vk: 2.99, salesPerDay: 14 },

  // --- Süßwaren (trocken) ---
  {
    id: "schoko", name: "Tafel Schokolade 100 g", category: "Süßwaren", storage: "trocken",
    ek: 0.55, vk: 0.99, salesPerDay: 30,
    seasonFactors: { Winter: 1.3, Herbst: 1.2, Frühling: 0.9, Sommer: 0.75 },
  },
  {
    id: "gummi", name: "Gummibärchen 200 g", category: "Süßwaren", storage: "trocken",
    ek: 0.69, vk: 1.19, salesPerDay: 16,
    seasonFactors: { Sommer: 1.25, Frühling: 1.1, Herbst: 0.95, Winter: 0.85 },
  },

  // --- Frische (kurze Haltbarkeit, verderblich) ---
  {
    id: "milch", name: "Frische Milch 1 L", category: "Frische", storage: "frisch",
    ek: 0.55, vk: 0.95, salesPerDay: 40, shelfLifeDays: 7,
    seasonFactors: { Winter: 1.1, Herbst: 1.05, Sommer: 0.9 },
  },
  {
    id: "joghurt", name: "Joghurt 500 g", category: "Frische", storage: "frisch",
    ek: 0.45, vk: 0.79, salesPerDay: 22, shelfLifeDays: 10,
    seasonFactors: { Sommer: 1.25, Frühling: 1.1, Herbst: 0.95, Winter: 0.85 },
  },
  {
    id: "hack", name: "Hackfleisch 500 g", category: "Frische", storage: "frisch",
    ek: 1.9, vk: 3.49, salesPerDay: 12, shelfLifeDays: 3,
    seasonFactors: { Herbst: 1.2, Winter: 1.1, Frühling: 0.9, Sommer: 0.85 },
  },
  {
    id: "haehnchen", name: "Hähnchenbrust 400 g", category: "Frische", storage: "frisch",
    ek: 2.4, vk: 4.29, salesPerDay: 10, shelfLifeDays: 4,
    seasonFactors: { Sommer: 1.25, Frühling: 1.1, Herbst: 0.9, Winter: 0.85 },
  },

  // --- Saisonales (nur in ihrer Saison verfügbar) -------------------------
  {
    id: "gluehwein", name: "Glühwein 0,5 L", category: "Saisonales", storage: "trocken",
    ek: 1.2, vk: 2.49, salesPerDay: 30, onlyInSeason: "Winter",
  },
  {
    id: "eis", name: "Eis am Stiel 4er", category: "Saisonales", storage: "frisch",
    ek: 1.5, vk: 2.99, salesPerDay: 35, shelfLifeDays: 30, onlyInSeason: "Sommer",
  },
  {
    id: "erdbeeren", name: "Erdbeeren 500 g", category: "Saisonales", storage: "frisch",
    ek: 1.0, vk: 1.99, salesPerDay: 28, shelfLifeDays: 4, onlyInSeason: "Frühling",
  },
  {
    id: "kuerbis", name: "Kürbis 1 kg", category: "Saisonales", storage: "trocken",
    ek: 0.6, vk: 1.29, salesPerDay: 20, onlyInSeason: "Herbst",
  },
];

// --- Staffelpreise (Mengenrabatt) ----------------------------------------
export const STAFFEL: { minQty: number; rabatt: number }[] = [
  { minQty: 1000, rabatt: 0.2 },
  { minQty: 500, rabatt: 0.15 },
  { minQty: 200, rabatt: 0.1 },
  { minQty: 50, rabatt: 0.05 },
  { minQty: 1, rabatt: 0 },
];

export function unitPrice(baseEk: number, qty: number): number {
  const tier = STAFFEL.find((t) => qty >= t.minQty) ?? STAFFEL[STAFFEL.length - 1];
  return +(baseEk * (1 - tier.rabatt)).toFixed(4);
}

export function rabattProzent(qty: number): number {
  const tier = STAFFEL.find((t) => qty >= t.minQty) ?? STAFFEL[STAFFEL.length - 1];
  return Math.round(tier.rabatt * 100);
}

// --- Lieferanten ---------------------------------------------------------
export interface Supplier {
  id: string;
  name: string;
  factors: Partial<Record<Category, number>> & { default: number };
}

export const SUPPLIERS: Supplier[] = [
  { id: "becker", name: "Großmarkt Becker", factors: { default: 1.0 } },
  { id: "mueller", name: "Getränke Müller", factors: { Getränke: 0.85, Saisonales: 0.9, default: 1.06 } },
  { id: "frischefix", name: "FrischeFix", factors: { Frische: 0.88, Saisonales: 0.88, default: 1.05 } },
  { id: "drodirekt", name: "DrogerieDirekt", factors: { Drogerie: 0.82, Süßwaren: 0.94, default: 1.04 } },
];

export function supplierBaseEk(p: Product, supplierId: string): number {
  const s = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
  const f = s.factors[p.category] ?? s.factors.default;
  return +(p.ek * f).toFixed(4);
}

export function cheapestSupplier(p: Product): string {
  return SUPPLIERS.reduce(
    (best, s) =>
      supplierBaseEk(p, s.id) < supplierBaseEk(p, best) ? s.id : best,
    SUPPLIERS[0].id,
  );
}

export function euro(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
