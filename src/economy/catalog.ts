// ---------------------------------------------------------------------------
// Produktkatalog — angelehnt an ein typisches deutsches Supermarkt-Sortiment.
// EK = Einkaufspreis (Großhandel), VK = markt-gegebener Verkaufspreis.
// salesPerDay = Basis-Drehzahl (ohne Saison / Trend / Events).
// seasonFactors: saisonale Nachfrage-Multiplikatoren (±30% Schwankung).
// onlyInSeason: Produkt ist nur in dieser Saison erhältlich.
// seasonWave: 1–3 = Aktionswelle innerhalb der Saison (je ~5 Tage); fehlt = ganze Saison.
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
  ek: number;
  vk: number;
  salesPerDay: number;
  shelfLifeDays?: number;
  seasonFactors?: Partial<Record<Season, number>>;
  onlyInSeason?: Season;
  seasonWave?: 1 | 2 | 3;
  requiresUpgrade?: "eigenmarke"; // nur verfügbar wenn entsprechendes Upgrade aktiv
}

// 13 Tage pro Quartal · 4 Quartale = 52 Tage pro Jahr
export function dayToCalendar(day: number): {
  year: number;
  quarter: number;
  seasonDay: number;
  season: Season;
} {
  const d = day - 1;
  const year = Math.floor(d / 52) + 1;
  const quarterIndex = Math.floor((d % 52) / 13);
  const seasonDay = (d % 13) + 1;
  return { year, quarter: quarterIndex + 1, seasonDay, season: SEASONS[quarterIndex] };
}

// Welle 1 = Tag 1–5, Welle 2 = Tag 6–10, Welle 3 = Tag 11–13 innerhalb einer Saison.
export function currentSeasonWave(seasonDay: number): 1 | 2 | 3 {
  if (seasonDay <= 5) return 1;
  if (seasonDay <= 10) return 2;
  return 3;
}

export const CATALOG: Product[] = [
  // =========================================================================
  // GETRÄNKE (trocken)
  // =========================================================================
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
  {
    id: "energydrink", name: "Energydrink 0,25 L", category: "Getränke", storage: "trocken",
    ek: 0.49, vk: 0.99, salesPerDay: 22,
    seasonFactors: { Sommer: 1.2, Frühling: 1.1, Winter: 0.85 },
  },
  {
    id: "tee", name: "Tee 20er", category: "Getränke", storage: "trocken",
    ek: 0.79, vk: 1.49, salesPerDay: 14,
    seasonFactors: { Winter: 1.3, Herbst: 1.2, Frühling: 0.85, Sommer: 0.7 },
  },

  // =========================================================================
  // GRUNDNAHRUNG (trocken)
  // =========================================================================
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
  {
    id: "ketchup", name: "Ketchup 500 ml", category: "Grundnahrung", storage: "trocken",
    ek: 0.69, vk: 1.29, salesPerDay: 10,
    seasonFactors: { Sommer: 1.2, Frühling: 1.1, Winter: 0.85 },
  },
  {
    id: "dosentomaten", name: "Dosentomaten 400 g", category: "Grundnahrung", storage: "trocken",
    ek: 0.45, vk: 0.79, salesPerDay: 12,
    seasonFactors: { Herbst: 1.15, Winter: 1.2, Sommer: 0.9 },
  },

  // =========================================================================
  // DROGERIE (trocken)
  // =========================================================================
  { id: "seife", name: "Kernseife", category: "Drogerie", storage: "trocken", ek: 0.27, vk: 0.39, salesPerDay: 5 },
  { id: "zahnpasta", name: "Zahnpasta", category: "Drogerie", storage: "trocken", ek: 0.65, vk: 1.45, salesPerDay: 8 },
  { id: "klopapier", name: "Toilettenpapier 8er", category: "Drogerie", storage: "trocken", ek: 1.8, vk: 2.99, salesPerDay: 14 },

  // =========================================================================
  // SÜSSWAREN (trocken)
  // =========================================================================
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
  {
    id: "chips", name: "Chips 175 g", category: "Süßwaren", storage: "trocken",
    ek: 0.79, vk: 1.49, salesPerDay: 24,
    seasonFactors: { Sommer: 1.25, Frühling: 1.1, Winter: 1.05 },
  },
  {
    id: "nuesse", name: "Nüsse gemischt 200 g", category: "Süßwaren", storage: "trocken",
    ek: 1.2, vk: 2.29, salesPerDay: 12,
    seasonFactors: { Winter: 1.25, Herbst: 1.2, Sommer: 0.85 },
  },

  // =========================================================================
  // FRISCHE (kurze Haltbarkeit)
  // =========================================================================
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
  {
    id: "eier", name: "Eier 6er", category: "Frische", storage: "frisch",
    ek: 0.99, vk: 1.79, salesPerDay: 25, shelfLifeDays: 21,
    seasonFactors: { Winter: 1.15, Herbst: 1.1, Sommer: 0.9 },
  },
  {
    id: "butter", name: "Butter 250 g", category: "Frische", storage: "frisch",
    ek: 1.2, vk: 1.99, salesPerDay: 20, shelfLifeDays: 21,
    seasonFactors: { Winter: 1.2, Herbst: 1.1, Sommer: 0.85 },
  },
  {
    id: "kaese", name: "Käse Scheiben 200 g", category: "Frische", storage: "frisch",
    ek: 1.5, vk: 2.69, salesPerDay: 16, shelfLifeDays: 14,
  },
  {
    id: "sahne", name: "Sahne 200 ml", category: "Frische", storage: "frisch",
    ek: 0.6, vk: 0.99, salesPerDay: 12, shelfLifeDays: 7,
    seasonFactors: { Winter: 1.3, Herbst: 1.15, Sommer: 0.75 },
  },

  // =========================================================================
  // SAISONALES — Evergreen (ganze Saison verfügbar)
  // =========================================================================
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

  // =========================================================================
  // SAISONALES — Welle 1 (Tag 1–5 der Saison)
  // =========================================================================
  {
    id: "radieschen", name: "Radieschen 500 g", category: "Saisonales", storage: "frisch",
    ek: 0.59, vk: 1.09, salesPerDay: 16, shelfLifeDays: 5,
    onlyInSeason: "Frühling", seasonWave: 1,
  },
  {
    id: "wassermelone", name: "Wassermelone 1 Stk.", category: "Saisonales", storage: "frisch",
    ek: 1.8, vk: 3.49, salesPerDay: 20, shelfLifeDays: 7,
    onlyInSeason: "Sommer", seasonWave: 1,
  },
  {
    id: "aepfel", name: "Äpfel 1 kg", category: "Saisonales", storage: "frisch",
    ek: 0.89, vk: 1.79, salesPerDay: 25, shelfLifeDays: 14,
    onlyInSeason: "Herbst", seasonWave: 1,
  },
  {
    id: "lebkuchen", name: "Lebkuchen 300 g", category: "Saisonales", storage: "trocken",
    ek: 1.1, vk: 2.29, salesPerDay: 22, onlyInSeason: "Winter", seasonWave: 1,
  },

  // =========================================================================
  // SAISONALES — Welle 2 (Tag 6–10 der Saison)
  // =========================================================================
  {
    id: "spargel", name: "Spargel 500 g", category: "Saisonales", storage: "frisch",
    ek: 1.8, vk: 3.49, salesPerDay: 22, shelfLifeDays: 4,
    onlyInSeason: "Frühling", seasonWave: 2,
  },
  {
    id: "grillwuerstchen", name: "Grillwürstchen 400 g", category: "Saisonales", storage: "frisch",
    ek: 1.4, vk: 2.79, salesPerDay: 30, shelfLifeDays: 3,
    onlyInSeason: "Sommer", seasonWave: 2,
  },
  {
    id: "weintrauben", name: "Weintrauben 500 g", category: "Saisonales", storage: "frisch",
    ek: 1.1, vk: 2.19, salesPerDay: 20, shelfLifeDays: 8,
    onlyInSeason: "Herbst", seasonWave: 2,
  },
  {
    id: "clementinen", name: "Clementinen Netz", category: "Saisonales", storage: "frisch",
    ek: 1.3, vk: 2.49, salesPerDay: 22, shelfLifeDays: 7,
    onlyInSeason: "Winter", seasonWave: 2,
  },

  // =========================================================================
  // SAISONALES — Welle 3 (Tag 11–13 der Saison)
  // =========================================================================
  {
    id: "rhabarber", name: "Rhabarber 500 g", category: "Saisonales", storage: "frisch",
    ek: 0.89, vk: 1.79, salesPerDay: 14, shelfLifeDays: 6,
    onlyInSeason: "Frühling", seasonWave: 3,
  },
  {
    id: "maiskolben", name: "Maiskolben 2er", category: "Saisonales", storage: "frisch",
    ek: 0.79, vk: 1.49, salesPerDay: 18, shelfLifeDays: 4,
    onlyInSeason: "Sommer", seasonWave: 3,
  },
  {
    id: "maronen", name: "Maronen 200 g", category: "Saisonales", storage: "trocken",
    ek: 0.99, vk: 1.99, salesPerDay: 15, onlyInSeason: "Herbst", seasonWave: 3,
  },
  {
    id: "adventstee", name: "Adventstee 20er", category: "Saisonales", storage: "trocken",
    ek: 1.2, vk: 2.49, salesPerDay: 18, onlyInSeason: "Winter", seasonWave: 3,
  },

  // =========================================================================
  // EIGENMARKEN (nur verfügbar nach Eigenmarken-Regal-Upgrade)
  // =========================================================================
  {
    id: "em-cola", name: "EigenMarke Cola", category: "Getränke", storage: "trocken",
    ek: 0.22, vk: 0.65, salesPerDay: 13, requiresUpgrade: "eigenmarke",
  },
  {
    id: "em-wasser", name: "EigenMarke Wasser", category: "Getränke", storage: "trocken",
    ek: 0.12, vk: 0.45, salesPerDay: 15, requiresUpgrade: "eigenmarke",
  },
  {
    id: "em-mehl", name: "EigenMarke Mehl 1 kg", category: "Grundnahrung", storage: "trocken",
    ek: 0.45, vk: 1.09, salesPerDay: 9, requiresUpgrade: "eigenmarke",
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
  minQty?: number;          // Mindestmenge je Bestellung (nur Großmarkt)
  requiresUpgrade?: "lieferwagen"; // nur verfügbar wenn Upgrade aktiv
}

export const SUPPLIERS: Supplier[] = [
  { id: "becker",     name: "Großmarkt Becker",  factors: { default: 1.0 } },
  { id: "mueller",    name: "Getränke Müller",    factors: { Getränke: 0.85, Saisonales: 0.90, default: 1.06 } },
  { id: "frischefix", name: "FrischeFix",         factors: { Frische: 0.88, Saisonales: 0.88, default: 1.05 } },
  { id: "drodirekt",  name: "DrogerieDirekt",     factors: { Drogerie: 0.82, Süßwaren: 0.94, default: 1.04 } },
  {
    id: "grossmarkt",
    name: "Eigener Großmarkt",
    factors: { default: 0.82 }, // −18 % günstiger als Becker
    minQty: 200,
    requiresUpgrade: "lieferwagen",
  },
];

export function supplierBaseEk(p: Product, supplierId: string): number {
  const s = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
  const f = s.factors[p.category] ?? s.factors.default;
  return +(p.ek * f).toFixed(4);
}

export function cheapestSupplier(p: Product, unlockedSuppliers?: string[]): string {
  const pool = unlockedSuppliers
    ? SUPPLIERS.filter((s) => unlockedSuppliers.includes(s.id))
    : SUPPLIERS.filter((s) => !s.requiresUpgrade);
  if (!pool.length) return SUPPLIERS[0].id;
  return pool.reduce(
    (best, s) => supplierBaseEk(p, s.id) < supplierBaseEk(p, best) ? s.id : best,
    pool[0].id,
  );
}

export function euro(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}


export interface DayRecord {
  day: number;
  revenue: number;
  spoiledValue: number;
  unitsSold: number;
  demandedTotal: number;
  satisfaction: number;
  cash: number;
}
