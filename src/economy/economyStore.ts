import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATALOG,
  unitPrice,
  supplierBaseEk,
  cheapestSupplier,
  currentSeasonWave,
  SUPPLIERS,
  euro,
  dayToCalendar,
  type Product,
  type Season,
  type DayRecord,
} from "./catalog";
import { useMail } from "./mailStore";
import { useGoal } from "./goalStore";
import { useCompetitor } from "./competitorStore";

// --- Spielmodi (nur unterschiedliches Startbudget) -----------------------
export type GameModeId =
  | "neuling"
  | "anfaenger"
  | "fortgeschritten"
  | "profi"
  | "workaholic";

export interface GameMode {
  id: GameModeId;
  name: string;
  emoji: string;
  budget: number;
  desc: string;
}

export const MODES: GameMode[] = [
  { id: "neuling", name: "Neuling", emoji: "🐣", budget: 25000, desc: "Dickes Polster, kaum Druck — zum Ausprobieren." },
  { id: "anfaenger", name: "Anfänger", emoji: "🌱", budget: 15000, desc: "Bequemer Start mit Sicherheitsnetz." },
  { id: "fortgeschritten", name: "Fortgeschrittener", emoji: "📈", budget: 10000, desc: "Ausgewogen — haushalten nötig." },
  { id: "profi", name: "Profi", emoji: "💼", budget: 5000, desc: "Knappes Kapital, kluge Einkäufe gefragt." },
  { id: "workaholic", name: "Workaholic", emoji: "🔥", budget: 2000, desc: "Minimal — jeder Euro zählt." },
];

// --- Daten-Strukturen -----------------------------------------------------

// Eine Charge: beim Einkauf entsteht ein "Posten" mit Menge und Alter (Tage).
// Frischware verdirbt, wenn das Alter die Haltbarkeit erreicht.
export interface Batch {
  qty: number;
  age: number; // Tage im Bestand
}

// Lebenslange Statistik je Produkt (für die spätere Statistik-Ansicht).
export interface ProductStat {
  sold: number; // verkaufte Stück gesamt
  revenue: number; // Umsatz gesamt
  spoiled: number; // verdorbene Stück gesamt
  ageSum: number; // Summe (Alter × verkaufte Stück) -> für Ø Lagerdauer
}

const emptyStat = (): ProductStat => ({ sold: 0, revenue: 0, spoiled: 0, ageSum: 0 });

// Eine Kundenstimme im Recap (gut = positiv 🙂, sonst kritisch 😕).
export interface CustomerVoice {
  text: string;
  good: boolean;
}

// DayRecord: in catalog.ts definiert (von goalStore + economyStore genutzt, kein Zirkel)
export type { DayRecord };

// Zusammenfassung eines abgeschlossenen Tages -> für den Vollbild-Recap.
export interface DayRecap {
  day: number; // der abgeschlossene Tag
  revenue: number; // Umsatz des Tages
  spoiledValue: number; // Verderb-Verlust (EK-Wert)
  prevRevenue: number; // Umsatz des Vortags (für ↑/↓-Vergleich)
  unitsSold: number; // verkaufte Stück gesamt
  bestseller: { name: string; qty: number } | null;
  satisfaction: number; // Kundenzufriedenheit nach dem Tag (0–100)
  prevSatisfaction: number; // Zufriedenheit vor dem Tag (für ↑/↓)
  missedUnits: number; // Stück, die mangels Bestand nicht verkauft wurden
  voices: CustomerVoice[]; // Kundenstimmen
  branchIncome: number; // Passiveinkommen aus Filialen an diesem Tag
}

// Ein befristetes Angebot: prozentualer EK-Rabatt für ein Produkt, X Tage gültig.
export interface Offer {
  rabatt: number; // z.B. 0.2 = −20 %
  daysLeft: number;
}

// Ein Saison-Event: einmaliger Nachfrage-Spike für ein Produkt, mit Mail-Vorankündigung.
export interface SeasonEvent {
  triggerDay: number; // globaler Tag, an dem der Spike passiert
  productId: string;
  notified: boolean; // wurde die Vorankündigungs-Mail schon gesendet?
}

const RABATTE = [0.1, 0.15, 0.2, 0.25];

// --- Krisen-System -------------------------------------------------------
// Einmal pro Saison kann eine Krise auftreten (70 % Chance).
// Jede Krise hat einen Trigger-Tag, eine Dauer und typspezifische Effekte.
export type CrisisType = "hitzewelle" | "preiskampf" | "lieferskandal";

export interface SeasonCrisis {
  type: CrisisType;
  triggerDay: number;   // erster Tag der Krise
  endDay: number;       // letzter Tag (inkl.)
  announced: boolean;   // Ankündigungs-Mail bereits gesendet?
  affectedProductIds?: string[];  // preiskampf: betroffene Produkte
  affectedSupplierId?: string;    // lieferskandal: gesperrter Lieferant
}

export function isCrisisActive(crisis: SeasonCrisis | null, day: number): boolean {
  return !!crisis && day >= crisis.triggerDay && day <= crisis.endDay;
}

const CRISIS_DEMAND_PENALTY = 0.25; // preiskampf: −25 % Nachfrage für betroffene Produkte

// --- Spielmodi & Missionen -----------------------------------------------
export type PlayMode = "kampagne" | "endlos";

export type WinConditionDef =
  | { type: "year_revenue"; year: number; target: number }
  | { type: "branches"; count: number }
  | { type: "survive_seasons"; count: number; minSat: number }
  | { type: "empire"; branches: number; yearRevenue: number };

export interface MissionDef {
  id: string;
  emoji: string;
  title: string;
  flavor: string;
  desc: string;
  budget: number;
  winCondition: WinConditionDef;
}

export const MISSIONS: MissionDef[] = [
  {
    id: "mission1",
    emoji: "🌱",
    title: "Der erste Laden",
    flavor: "Du hast einen kleinen Supermarkt geerbt. Beweise, dass du das Zeug zum Händler hast.",
    desc: "50.000 € Gesamtumsatz im ersten Jahr erreichen.",
    budget: 10000,
    winCondition: { type: "year_revenue", year: 1, target: 50000 },
  },
  {
    id: "mission2",
    emoji: "🏬",
    title: "Die Expansion",
    flavor: "Dein Stammladen läuft — jetzt baust du die Kette aus.",
    desc: "3 Filialen eröffnen.",
    budget: 8000,
    winCondition: { type: "branches", count: 3 },
  },
  {
    id: "mission3",
    emoji: "⚡",
    title: "Krisenfest",
    flavor: "Der Markt ist turbulent. Zeig, dass dein Laden auch schwere Zeiten übersteht.",
    desc: "3 Saisonen mit ≥ 75 % Kundenzufriedenheit am Ende überstehen.",
    budget: 5000,
    winCondition: { type: "survive_seasons", count: 3, minSat: 75 },
  },
  {
    id: "mission4",
    emoji: "👑",
    title: "Das Imperium",
    flavor: "Du bist bereit für die große Liga. Baue ein wahres Supermarkt-Imperium.",
    desc: "10 Filialen UND 500.000 € Gesamtumsatz.",
    budget: 15000,
    winCondition: { type: "empire", branches: 10, yearRevenue: 500000 },
  },
];

// --- Spezialisierungspfade ------------------------------------------------
// Strategische Ausrichtung des Ladens. Spiegelt die Konkurrenten-Typen wider
// (Discounter vs. Bio) und gibt jedem Pfad klare Vor- und Nachteile.
export type Specialization = "discounter" | "premium" | "vollsortimenter";

export interface SpecMeta {
  id: Specialization;
  emoji: string;
  name: string;
  tagline: string;
  perks: string[];
  tradeoff: string;
}

export const SPECIALIZATIONS: SpecMeta[] = [
  {
    id: "discounter",
    emoji: "🏷️",
    name: "Discounter",
    tagline: "Masse statt Marge — der Laden für jeden Geldbeutel.",
    perks: ["+15 % Laufkundschaft", "Volle Läden schrecken niemanden ab"],
    tradeoff: "Kunden sind sehr preissensibel — höhere VK-Preise vertreiben sie schnell.",
  },
  {
    id: "premium",
    emoji: "🌿",
    name: "Bio & Premium",
    tagline: "Qualität hat ihren Preis — und die Kunden zahlen ihn gern.",
    perks: ["Kunden zahlen höhere Preise klaglos", "+ dauerhafte Zufriedenheit"],
    tradeoff: "Weniger Laufkundschaft (−12 %) — du lebst von wenigen, treuen Kunden.",
  },
  {
    id: "vollsortimenter",
    emoji: "🛒",
    name: "Vollsortimenter",
    tagline: "Alles unter einem Dach — der verlässliche Allrounder.",
    perks: ["+30 % Lagerkapazität (beide Flächen)", "+5 % Nachfrage über alle Kategorien"],
    tradeoff: "Keine Spitzen-Boni — solide, aber ohne Extrem-Stärken.",
  },
];

// Kosten für einen späteren Strategiewechsel (die erste Wahl ist gratis).
export const SPEC_SWITCH_COST = 2000;

// Spezialisierungs-Effekte (zentral, damit UI und Logik dieselbe Quelle nutzen).
export function specDemandMult(spec: Specialization | null): number {
  switch (spec) {
    case "discounter": return 1.15;
    case "premium": return 0.88;
    case "vollsortimenter": return 1.05;
    default: return 1.0;
  }
}
export function specPriceExp(spec: Specialization | null): number {
  switch (spec) {
    case "discounter": return 2.3; // sehr preissensibel
    case "premium": return 0.8;    // tolerant gegenüber hohen Preisen
    default: return 1.5;           // mittlere Elastizität
  }
}
export function specCapMult(spec: Specialization | null): number {
  return spec === "vollsortimenter" ? 1.3 : 1.0;
}
export function specSatBonus(spec: Specialization | null): number {
  return spec === "premium" ? 3 : 0; // täglicher Zufriedenheits-Bonus
}

// --- Konkurrenz-Aktionen (Feature 4) --------------------------------------
// Aktive Hebel gegen die Konkurrenz: kosten Geld/Marge, wirken zeitlich begrenzt.
export const AD_CAMPAIGN = {
  cost: 1500,
  days: 5,
  demandMult: 1.3,        // +30 % Kundenstrom während der Kampagne
  pressureMult: 0.4,      // Marktdruck der Konkurrenz auf 40 % gedrückt
};
export const PRICE_OFFENSIVE = {
  days: 4,
  demandMult: 1.25,       // +25 % Nachfrage durch Lockpreise
  priceMult: 0.85,        // −15 % auf alle Verkaufspreise (Margen-Opfer)
  pressureMult: 0.5,      // klaut der Konkurrenz Marktanteil
};

// Kosten für die n-te Filiale (exponentiell steigend, auf 100 € gerundet).
export function branchCost(n: number): number {
  return Math.round((40000 * Math.pow(1.8, n)) / 100) * 100;
}

// Erzeugt ein Angebot für ein zufälliges Produkt (das noch keins hat).
function rollOffer(active: Record<string, Offer>): [string, Offer] | null {
  const frei = CATALOG.filter((p) => !active[p.id]);
  if (!frei.length) return null;
  const p = frei[Math.floor(Math.random() * frei.length)];
  const rabatt = RABATTE[Math.floor(Math.random() * RABATTE.length)];
  const daysLeft = 3 + Math.floor(Math.random() * 4); // 3–6 Tage
  return [p.id, { rabatt, daysLeft }];
}

// --- Lieferantenpreise -------------------------------------------------------
// Alle 3 Tage ändert sich der Preis jedes Lieferanten um ±0–15% (in 5%-Schritten).
function rollSupplierMods(): Record<string, number> {
  const steps = [-0.15, -0.10, -0.05, -0.05, 0, 0, 0.05, 0.05, 0.10, 0.15];
  const mods: Record<string, number> = {};
  for (const s of SUPPLIERS) {
    mods[s.id] = 1 + steps[Math.floor(Math.random() * steps.length)];
  }
  return mods;
}

// --- Trend-Produkt -----------------------------------------------------------
// Jeden Tag ein zufälliges verfügbares Produkt mit +30% Nachfrage.
function rollTrendProduct(season: Season, seasonDay: number): string {
  const wave = currentSeasonWave(seasonDay);
  const available = CATALOG.filter(
    (p) =>
      (!p.onlyInSeason || p.onlyInSeason === season) &&
      (!p.seasonWave || p.seasonWave === wave),
  );
  if (!available.length) return CATALOG[0].id;
  return available[Math.floor(Math.random() * available.length)].id;
}

// --- Saison-Event ------------------------------------------------------------
// Einmal pro Saison: Mega-Spike für ein zufälliges (saison-)passendes Produkt.
// Trigger-Tag = 7–11 Tage nach Saison-Start; Vorankündigung 2 Tage früher per Mail.
function makeSeasonEvent(firstDayOfSeason: number, season: Season): SeasonEvent {
  const offset = 7 + Math.floor(Math.random() * 5); // Tag 7–11 innerhalb der Saison
  const triggerDay = firstDayOfSeason + offset;
  const candidates = CATALOG.filter(
    (p) =>
      !p.seasonWave && // Evergreens oder reguläre Produkte
      (!p.onlyInSeason || p.onlyInSeason === season) &&
      p.salesPerDay >= 10,
  );
  const p = candidates[Math.floor(Math.random() * candidates.length)] ?? CATALOG[0];
  return { triggerDay, productId: p.id, notified: false };
}

// --- Lieferanten-Ausfall -----------------------------------------------------
// 10% Chance je Tag, dass ein verfügbarer Lieferant 1–2 Tage ausfällt.
function maybeSupplierOutage(
  current: Record<string, number>,
  day: number,
): Record<string, number> | null {
  const active = { ...current };
  // Abgelaufene Ausfälle bereinigen.
  for (const id of Object.keys(active)) {
    if (active[id] < day) delete active[id];
  }
  if (Math.random() >= 0.1) return Object.keys(active).length ? active : null;
  const free = SUPPLIERS.filter((s) => !active[s.id]);
  if (free.length <= 1) return Object.keys(active).length ? active : null; // mindestens 1 frei lassen
  const s = free[Math.floor(Math.random() * free.length)];
  const duration = 1 + Math.floor(Math.random() * 2); // 1–2 Tage
  active[s.id] = day + duration - 1; // letzter Tag des Ausfalls (inkl.)
  // Mail schicken.
  useMail.getState().receive({
    from: "Lieferantenhotline",
    subject: `⚠️ Lieferausfall: ${s.name}`,
    body:
      `Aufgrund eines internen Problems steht ${s.name} heute und ggf. morgen nicht zur Verfügung.\n\n` +
      `Bitte weiche für diesen Zeitraum auf einen anderen Lieferanten aus.\n\n` +
      `Wir entschuldigen uns für die Unannehmlichkeiten.`,
    day,
    kind: "info",
  });
  return active;
}

// --- Krise rollieren -----------------------------------------------------
function rollCrisis(firstDayOfSeason: number, season: Season): SeasonCrisis {
  const types: CrisisType[] = season === "Sommer"
    ? ["hitzewelle", "preiskampf", "lieferskandal"]
    : ["preiskampf", "lieferskandal"];
  const type = types[Math.floor(Math.random() * types.length)];
  const offset = 4 + Math.floor(Math.random() * 6); // Tag 4–9 der Saison
  const triggerDay = firstDayOfSeason + offset;
  const duration = type === "hitzewelle" ? 3 : 5 + Math.floor(Math.random() * 3);
  const endDay = Math.min(triggerDay + duration - 1, firstDayOfSeason + 12);

  const affectedProductIds = type === "preiskampf"
    ? CATALOG
        .filter((p) => p.storage === "trocken" && p.salesPerDay >= 10 && !p.onlyInSeason)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3 + Math.floor(Math.random() * 3))
        .map((p) => p.id)
    : undefined;

  const freeSup = SUPPLIERS.filter((s) => !s.requiresUpgrade);
  const affectedSupplierId = type === "lieferskandal"
    ? freeSup[Math.floor(Math.random() * freeSup.length)]?.id
    : undefined;

  return { type, triggerDay, endDay, announced: false, affectedProductIds, affectedSupplierId };
}

// --- Krisen-Ankündigungs-Mail ---------------------------------------------
function sendCrisisAnnouncementMail(crisis: SeasonCrisis, day: number) {
  const daysLeft = crisis.triggerDay - day; // Tage bis zur Krise
  const duration = crisis.endDay - crisis.triggerDay + 1;
  if (crisis.type === "hitzewelle") {
    useMail.getState().receive({
      from: "Wetterdienst",
      subject: `☀️ Hitzewelle in ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tagen"} — Frischware gefährdet!`,
      body:
        `Eine außergewöhnliche Hitzewelle erwartet uns in ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tagen"}.\n\n` +
        `Die hohen Temperaturen halbieren die Haltbarkeit aller Frischprodukte für ca. ${duration} Tage.\n\n` +
        `Empfehlung: Reduziere deine Frischware-Bestände — oder riskiere deutlich erhöhten Verderb.\n\n` +
        `Dauer: Tag ${crisis.triggerDay}–${crisis.endDay}.`,
      day,
      kind: "info",
    });
  } else if (crisis.type === "preiskampf") {
    const names = (crisis.affectedProductIds ?? [])
      .map((id) => CATALOG.find((p) => p.id === id)?.name ?? id)
      .join(", ");
    useMail.getState().receive({
      from: "Marktforschung",
      subject: `⚔️ Preiskampf von Sparfuchs in ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tagen"}!`,
      body:
        `Sparfuchs startet in ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tagen"} eine aggressive Preisaktion.\n\n` +
        `Betroffene Produkte: ${names}.\n\n` +
        `Die Nachfrage für diese Artikel sinkt bei uns für ca. ${duration} Tage um 25 %, ` +
        `da Kunden zum Mitbewerber abwandern.\n\n` +
        `Tipp: Bestellmengen für diese Produkte temporär reduzieren.\n\n` +
        `Dauer: Tag ${crisis.triggerDay}–${crisis.endDay}.`,
      day,
      kind: "info",
    });
  } else {
    const supName = SUPPLIERS.find((s) => s.id === crisis.affectedSupplierId)?.name ?? "Unbekannter Lieferant";
    useMail.getState().receive({
      from: "Verbrauchermagazin",
      subject: `🚨 Lieferantenskandal: ${supName} in ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tagen"} gesperrt!`,
      body:
        `Achtung: Bei ${supName} wurde ein schwerwiegender Qualitätsskandal aufgedeckt.\n\n` +
        `Der Lieferant wird ab Tag ${crisis.triggerDay} für ca. ${duration} Tage gesperrt ` +
        `(bis Tag ${crisis.endDay}).\n\n` +
        `Sichere dich jetzt mit Alternativlieferanten ab oder besorge ausreichend Vorrat, ` +
        `um die Ausfallzeit zu überbrücken.`,
      day,
      kind: "info",
    });
  }
}

// --- Start-Angebote: 2 Stück.
function seedOffers(): Record<string, Offer> {
  const active: Record<string, Offer> = {};
  for (let i = 0; i < 2; i++) {
    const o = rollOffer(active);
    if (o) active[o[0]] = o[1];
  }
  return active;
}

// --- Ausstehende Bestellungen (Lieferzeiten) --------------------------------
// Waren, die bestellt aber noch nicht eingetroffen sind.
// Lagerplatz wird sofort bei Bestellung reserviert; Goods arrive at arrivalDay.
export interface PendingOrder {
  id: string;
  productId: string;
  qty: number;
  arrivalDay: number;
  supplierId: string;
  area: StorageArea;
}

// Gesamte unterwegs-Menge eines Produkts.
export function pendingQtyOf(orders: PendingOrder[], productId: string): number {
  return orders.filter((o) => o.productId === productId).reduce((s, o) => s + o.qty, 0);
}

// Reservierter Lagerplatz durch ausstehende Bestellungen, aufgeteilt nach Fläche.
export function pendingCapOf(orders: PendingOrder[]): { trocken: number; frisch: number } {
  return orders.reduce(
    (acc, o) => { acc[o.area] += o.qty; return acc; },
    { trocken: 0, frisch: 0 },
  );
}

// --- Store ----------------------------------------------------------------
interface EconomyState {
  started: boolean;
  mode: GameModeId | null;
  cash: number;
  day: number;
  batches: Record<string, Batch[]>;
  stats: Record<string, ProductStat>;
  offers: Record<string, Offer>;
  upgrades: Upgrades;
  lastRevenue: number;
  lastSpoiledValue: number;
  satisfaction: number;
  lastMissed: Record<string, number>;
  recap: DayRecap | null;
  recapOpen: boolean;
  // Dynamische Lieferantenpreise: Multiplikator je Lieferant (1.0 = normal, ±15%).
  supplierMods: Record<string, number>;
  // Trend-Produkt des Tages: dieses Produkt hat +30% Nachfrage heute.
  trendProductId: string | null;
  // Saison-Event: einmaliger Mega-Spike pro Saison.
  seasonEvent: SeasonEvent | null;
  // Lieferanten-Ausfall: supplierId → globaler Tag bis zu dem der Ausfall geht (inkl.).
  supplierOutage: Record<string, number>;
  // Tagesverlauf (max. 52 Einträge = 1 Spieljahr), neueste Tage hinten.
  history: DayRecord[];
  // Kumulierte Gesamtnachfrage je Produkt (für Fill-Rate-Berechnung).
  demandedByProduct: Record<string, number>;
  // Stammkunden-Verträge: Liste der Lieferanten-IDs mit aktivem Vertrag (max. 2).
  contracts: string[];
  // Ausstehende Bestellungen (Lieferzeiten) — Lagerplatz sofort reserviert.
  pendingOrders: PendingOrder[];
  // Name des Supermarkts — wird auf dem Startscreen gesetzt.
  firmName: string;
  // Spieler-eigene VK-Preise (überschreiben Katalog-VK; leeres Objekt = Katalogpreise).
  prices: Record<string, number>;
  // Anzahl zusätzlicher Filialen (jede bringt 12 % des Tagesumsatzes als Passiveinkommen).
  branches: number;
  // Krisen-System
  seasonCrisis: SeasonCrisis | null;
  // Spielmodus
  playMode: PlayMode | null;
  missionId: string | null;
  wonMission: boolean;
  missionSeasonsCompleted: number;
  // Spezialisierung (null = noch nicht gewählt)
  specialization: Specialization | null;
  // Konkurrenz-Aktionen: aktiv solange day <= …UntilDay (0 = inaktiv)
  adUntilDay: number;
  offensiveUntilDay: number;

  startGame: (id: GameModeId | null, name?: string, playMode?: PlayMode, missionId?: string) => void;
  setFirmName: (name: string) => void;
  resetGame: () => void;
  closeWin: () => void;
  setSpecialization: (spec: Specialization) => { ok: boolean; msg?: string };
  launchAdCampaign: () => { ok: boolean; msg?: string };
  launchPriceOffensive: () => { ok: boolean; msg?: string };
  buy: (productId: string, qty: number, supplierId: string) => { ok: boolean; msg?: string; arrivalDay?: number; deliveryDays?: number };
  upgrade: (track: UpgradeTrack) => { ok: boolean; msg?: string };
  signContract: (supplierId: string) => { ok: boolean; msg?: string };
  cancelContract: (supplierId: string) => void;
  setPrice: (productId: string, price: number) => void;
  openBranch: () => { ok: boolean; msg?: string };
  advanceDay: () => void;
  closeRecap: () => void;
}

const byId = (id: string): Product =>
  CATALOG.find((p) => p.id === id) as Product;

// Gesamtbestand eines Produkts = Summe aller Chargen.
export function stockOf(batches: Record<string, Batch[]>, id: string): number {
  return (batches[id] ?? []).reduce((sum, b) => sum + b.qty, 0);
}

// --- Lagerplatz & Ausbau --------------------------------------------------
// Zwei getrennte Flächen: trockene Ware liegt im Lager, Frischware geht
// direkt in die Verkaufsfläche (Kühlregal). Beide haben eine Kapazität in
// Stück. Das ist die zweite strategische Grenze neben dem Budget.
// Die Kapazität wächst durch Ausbau-Stufen (Reinvestition des Gewinns).
export type StorageArea = "trocken" | "frisch";

// Stufen, die der Spieler kaufen kann.
export interface Upgrades {
  lager: number;       // +4.000 Trockenware-Kapazität
  flaeche: number;     // +1.000 Frischware-Kapazität
  kassen: number;      // +15% Kundenstrom
  kuehltheke: number;  // +1 Tag Haltbarkeit Frischware (max. 3)
  marketing: number;   // +8% Kundenstrom-Multiplikator (max. 5)
  personal: number;    // Mitarbeiter: −10% Verderb + Zufriedenheit (max. 3, Tageslohn)
  lieferwagen: number; // einmalig: Großmarkt als 4. Lieferant (min. 200 Stk, −18%)
  eigenmarke: number;  // einmalig: 3 Eigenmarken-Produkte freischalten
}

const emptyUpgrades = (): Upgrades => ({
  lager: 0, flaeche: 0, kassen: 0,
  kuehltheke: 0, marketing: 0, personal: 0, lieferwagen: 0, eigenmarke: 0,
});

// Basis-Kapazität (Stufe 0) + Zuwachs je Stufe.
const BASE_CAP = { trocken: 10000, frisch: 2500 };
const CAP_STEP = { trocken: 4000, frisch: 1000 };

// Aktuelle Kapazität beider Flächen aus den Ausbaustufen.
// Vollsortimenter-Spezialisierung gibt +30 % auf beide Flächen.
export function capacityOf(u?: Upgrades): { trocken: number; frisch: number } {
  const spec = useEconomy.getState?.()?.specialization ?? null;
  const m = specCapMult(spec);
  return {
    trocken: Math.round((BASE_CAP.trocken + (u?.lager ?? 0) * CAP_STEP.trocken) * m),
    frisch: Math.round((BASE_CAP.frisch + (u?.flaeche ?? 0) * CAP_STEP.frisch) * m),
  };
}

// Kundenstrom: Kassen (+15%/Stufe) × Marketing (+8%/Stufe) — beide multiplikativ.
export function kundenstrom(u?: Upgrades): number {
  return (1 + (u?.kassen ?? 0) * 0.15) * (1 + (u?.marketing ?? 0) * 0.08);
}

// Täglicher Lohn für alle angestellten Mitarbeiter.
export function dailyWage(u?: Upgrades): number {
  return (u?.personal ?? 0) * 60;
}

// Effektive Haltbarkeit eines Frischprodukts (inkl. Kühltheke-Bonus).
export function effectiveShelfLife(p: Product, u?: Upgrades): number {
  if (!p.shelfLifeDays) return 0;
  return p.shelfLifeDays + (u?.kuehltheke ?? 0);
}

// Zufriedenheit wirkt mild auf die Nachfrage zurück: zufriedene Kunden bleiben,
// unzufriedene bleiben weg. Bewusst gedämpft (0,8–1,1), kein Todesspiral-Risiko.
export function satisfactionMultiplier(sat: number): number {
  return 0.8 + 0.3 * (Math.max(0, Math.min(100, sat)) / 100);
}

// Saisonaler Nachfrage-Multiplikator: seasonFactors aus dem Produkt, sonst 1.0.
export function seasonalFactor(p: Product, season: Season): number {
  return p.seasonFactors?.[season] ?? 1.0;
}

// Nachfrage/Tag — berücksichtigt: Saison, Aktionswelle, Kundenstrom, Zufriedenheit,
// Trend-Produkt (+30%) und Saison-Event (+200%). Alle Parameter optional.
export function effectiveSales(
  p: Product,
  u?: Upgrades,
  sat?: number,
  season?: Season,
  seasonDay?: number,
): number {
  const state = useEconomy.getState();
  const cal = dayToCalendar(state.day);
  const sz = season ?? cal.season;
  const sd = seasonDay ?? cal.seasonDay;

  // Saison-Specials: nur in ihrer Saison und Welle.
  if (p.onlyInSeason && p.onlyInSeason !== sz) return 0;
  if (p.seasonWave && p.seasonWave !== currentSeasonWave(sd)) return 0;

  const s = sat ?? state.satisfaction;
  const sf = seasonalFactor(p, sz);
  const trendFactor = state.trendProductId === p.id ? 1.3 : 1.0;
  const eventFactor =
    state.seasonEvent &&
    state.day === state.seasonEvent.triggerDay &&
    p.id === state.seasonEvent.productId
      ? 3.0
      : 1.0;

  // Preis-Elastizität: teurere Ware senkt die Nachfrage (und umgekehrt).
  // Exponent hängt von der Spezialisierung ab: Discounter = sehr preissensibel,
  // Premium = tolerant. Standard 1.5 (+20% Preis → −27% Nachfrage).
  const spec = state.specialization;
  const customVK = useEconomy.getState().prices[p.id];
  const priceFactor = customVK ? Math.pow(p.vk / customVK, specPriceExp(spec)) : 1.0;

  // Spezialisierungs-Nachfrage und aktive Konkurrenz-Aktionen.
  const specMult = specDemandMult(spec);
  const adMult = state.adUntilDay >= state.day ? AD_CAMPAIGN.demandMult : 1.0;
  const offMult = state.offensiveUntilDay >= state.day ? PRICE_OFFENSIVE.demandMult : 1.0;

  // Krisen-Effekt: Preiskampf senkt Nachfrage für betroffene Produkte
  const crisis = state.seasonCrisis;
  const preiskampfFactor =
    crisis &&
    crisis.type === "preiskampf" &&
    isCrisisActive(crisis, state.day) &&
    crisis.affectedProductIds?.includes(p.id)
      ? 1 - CRISIS_DEMAND_PENALTY
      : 1.0;

  return Math.round(
    p.salesPerDay * kundenstrom(u) * satisfactionMultiplier(s) * sf * trendFactor * eventFactor * priceFactor * preiskampfFactor * specMult * adMult * offMult,
  );
}

// Vorab-Schätzung des kommenden Tages (ohne den Zustand zu ändern) — für den
// sichtbaren Tagesablauf: hochzählender Umsatz + Live-Leeren der Regale.
// Dieselbe Verkaufslogik wie advanceDay, daher exakt der echte Tagesumsatz.
export function projectDay(): {
  revenue: number;
  soldTrocken: number;
  soldFrisch: number;
} {
  const { batches: rawBatches, upgrades, day, satisfaction, pendingOrders, prices, offensiveUntilDay } = useEconomy.getState();
  const { season, seasonDay } = dayToCalendar(day);
  const sellMult = offensiveUntilDay >= day ? PRICE_OFFENSIVE.priceMult : 1.0;
  // Heute ankommende Bestellungen einbeziehen (damit HUD-Umsatz mit Recap übereinstimmt).
  const batches = { ...rawBatches };
  for (const o of (pendingOrders ?? []).filter((o) => o.arrivalDay === day)) {
    const list = batches[o.productId] ? [...batches[o.productId]] : [];
    list.push({ qty: o.qty, age: 0 });
    batches[o.productId] = list;
  }
  let revenue = 0;
  let soldTrocken = 0;
  let soldFrisch = 0;
  for (const p of CATALOG) {
    const stock = stockOf(batches, p.id);
    const sell = Math.min(effectiveSales(p, upgrades, satisfaction, season, seasonDay), stock);
    revenue += sell * (prices[p.id] ?? p.vk) * sellMult;
    if (p.storage === "frisch") soldFrisch += sell;
    else soldTrocken += sell;
  }
  return { revenue: +revenue.toFixed(2), soldTrocken, soldFrisch };
}

// --- Ausbau-Linien (Meta + Kostenkurve) ----------------------------------
export type UpgradeTrack =
  | "lager" | "flaeche" | "kassen"
  | "kuehltheke" | "marketing" | "personal"
  | "lieferwagen" | "eigenmarke";

export const UPGRADE_META: Record<
  UpgradeTrack,
  { name: string; icon: string; desc: string; baseCost: number; growth: number; maxLevel?: number }
> = {
  lager: {
    name: "Lager vergrößern",
    icon: "📦",
    desc: "+4.000 Plätze für Trockenware.",
    baseCost: 2500,
    growth: 1.6,
  },
  flaeche: {
    name: "Verkaufsfläche vergrößern",
    icon: "🧊",
    desc: "+1.000 Plätze für Frischware.",
    baseCost: 2000,
    growth: 1.6,
  },
  kassen: {
    name: "Kasse aufstellen",
    icon: "🛒",
    desc: "+15 % Kundenstrom (mehr Verkäufe/Tag).",
    baseCost: 3000,
    growth: 1.8,
  },
  kuehltheke: {
    name: "Kühltheke ausbauen",
    icon: "🌡️",
    desc: "+1 Tag Haltbarkeit für alle Frischprodukte.",
    baseCost: 3500,
    growth: 1.7,
    maxLevel: 3,
  },
  marketing: {
    name: "Marketing & Werbung",
    icon: "📣",
    desc: "+8 % Kundenstrom — mehr Laufkundschaft (stapelt mit Kassen).",
    baseCost: 4000,
    growth: 1.9,
    maxLevel: 5,
  },
  personal: {
    name: "Mitarbeiter einstellen",
    icon: "👷",
    desc: "−10 % Verderb + Zufriedenheitsbonus. Kostet 60 €/Tag pro Mitarbeiter.",
    baseCost: 5000,
    growth: 1.5,
    maxLevel: 3,
  },
  lieferwagen: {
    name: "Eigener Lieferwagen",
    icon: "🚐",
    desc: "Schaltet Eigenen Großmarkt als 4. Lieferanten frei (−18 %, Mindestmenge 200 Stk).",
    baseCost: 8000,
    growth: 1,
    maxLevel: 1,
  },
  eigenmarke: {
    name: "Eigenmarken-Regal",
    icon: "🏷️",
    desc: "Schaltet 3 Eigenmarken-Produkte mit besserer Marge frei (Cola, Wasser, Mehl).",
    baseCost: 6000,
    growth: 1,
    maxLevel: 1,
  },
};

// Kosten für die nächste Stufe einer Ausbau-Linie (steigend, auf 10 € gerundet).
export function upgradeCost(track: UpgradeTrack, level: number): number {
  const m = UPGRADE_META[track];
  return Math.round((m.baseCost * Math.pow(m.growth, level)) / 10) * 10;
}

// Belegung beider Flächen aus den aktuellen Chargen.
export function usedCapacity(batches: Record<string, Batch[]>): {
  trocken: number;
  frisch: number;
} {
  let trocken = 0;
  let frisch = 0;
  for (const p of CATALOG) {
    const s = stockOf(batches, p.id);
    if (p.storage === "frisch") frisch += s;
    else trocken += s;
  }
  return { trocken, frisch };
}

// Mail-Text für ein neues Lieferanten-Angebot.
function offerMail(productId: string, o: Offer, day: number) {
  const p = byId(productId);
  const lief = SUPPLIERS.find((s) => s.id === cheapestSupplier(p)) ?? SUPPLIERS[0];
  useMail.getState().receive({
    from: lief.name,
    subject: `Sonderaktion: ${p.name} −${Math.round(o.rabatt * 100)} %`,
    body:
      `Sehr geehrter Einkäufer,\n\nfür kurze Zeit bieten wir Ihnen ${p.name} ` +
      `mit ${Math.round(o.rabatt * 100)} % Rabatt auf den Einkaufspreis an. ` +
      `Das Angebot gilt noch ${o.daysLeft} Tage.\n\n` +
      `Jetzt zugreifen lohnt sich — gute Marge bei voller Drehzahl.\n\n` +
      `Mit freundlichen Grüßen\n${lief.name}`,
    day,
    kind: "angebot",
  });
}

// Textbausteine für Kundenstimmen.
const VOICE = {
  empty: (n: string) => `„Schade, ${n} war heute leer!“`,
  empty2: (n: string) => `„${n} schon wieder ausverkauft…“`,
  queue: "„Die Schlange an der Kasse war ganz schön lang.“",
  full: "„Klasse, alles da was ich brauchte!“",
  happy: "„Hier kauf ich gerne ein.“",
  ok: "„War ganz okay heute.“",
};

// Zufriedenheit (mit Trägheit) + Kundenstimmen aus den Tageszahlen ableiten.
function computeSatisfaction(args: {
  prevSat: number;
  demanded: number;
  served: number;
  missedByProduct: Record<string, number>;
  upgrades: Upgrades;
  personalBonus?: number;
}): { satisfaction: number; voices: CustomerVoice[] } {
  const { prevSat, demanded, served, missedByProduct, upgrades, personalBonus = 0 } = args;
  const serviceRate = demanded > 0 ? served / demanded : 1;

  // Kassen-Komfort: Andrang vs. Kassenzahl (mild gewichtet).
  const kassen = 1 + upgrades.kassen;
  const load = demanded / (kassen * 300);
  const queueOk = load <= 1 ? 1 : Math.max(0, 1 - (load - 1) * 0.6);

  const target = Math.min(100, 100 * (0.85 * serviceRate + 0.15 * queueOk) + personalBonus);
  // Trägheit: ein einzelner Tag verschiebt die Zufriedenheit nur teilweise.
  const satisfaction = Math.round(
    Math.max(0, Math.min(100, prevSat * 0.6 + target * 0.4)),
  );

  // Kundenstimmen (max. 3, gemischt positiv/kritisch).
  const voices: CustomerVoice[] = [];
  const missed = Object.entries(missedByProduct)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (missed[0]) voices.push({ text: VOICE.empty(byId(missed[0][0]).name), good: false });
  if (missed[1]) voices.push({ text: VOICE.empty2(byId(missed[1][0]).name), good: false });
  if (load > 1.3) voices.push({ text: VOICE.queue, good: false });
  if (serviceRate >= 0.98) voices.push({ text: VOICE.full, good: true });
  if (satisfaction >= 85) voices.push({ text: VOICE.happy, good: true });
  if (voices.length === 0) voices.push({ text: VOICE.ok, good: true });

  return { satisfaction, voices: voices.slice(0, 3) };
}

export const useEconomy = create<EconomyState>()(
  persist(
    (set, get) => ({
      started: false,
      mode: null,
      cash: 0,
      day: 1,
      batches: {},
      stats: {},
      offers: {},
      upgrades: emptyUpgrades(),
      lastRevenue: 0,
      lastSpoiledValue: 0,
      satisfaction: 80,
      lastMissed: {},
      recap: null,
      recapOpen: false,
      supplierMods: {},
      trendProductId: null,
      seasonEvent: null,
      supplierOutage: {},
      history: [],
      demandedByProduct: {},
      contracts: [],
      pendingOrders: [],
      firmName: "",
      prices: {},
      branches: 0,
      seasonCrisis: null,
      playMode: null,
      missionId: null,
      wonMission: false,
      missionSeasonsCompleted: 0,
      specialization: null,
      adUntilDay: 0,
      offensiveUntilDay: 0,

      startGame: (id, name, playMode = "endlos", missionId) => {
        const missionDef = missionId ? MISSIONS.find((m) => m.id === missionId) : null;
        const budget = missionDef
          ? missionDef.budget
          : (MODES.find((m) => m.id === id)?.budget ?? 10000);
        const firm = name?.trim() || "Mein Supermarkt";
        const offers = seedOffers();
        set({
          started: true,
          mode: id,
          firmName: firm,
          cash: budget,
          day: 1,
          batches: {},
          stats: {},
          offers,
          upgrades: emptyUpgrades(),
          lastRevenue: 0,
          lastSpoiledValue: 0,
          satisfaction: 80,
          lastMissed: {},
          recap: null,
          recapOpen: false,
          supplierMods: rollSupplierMods(),
          trendProductId: rollTrendProduct("Frühling", 1),
          seasonEvent: makeSeasonEvent(1, "Frühling"),
          supplierOutage: {},
          history: [],
          demandedByProduct: {},
          contracts: [],
          pendingOrders: [],
          prices: {},
          branches: 0,
          seasonCrisis: null,
          playMode: playMode ?? "endlos",
          missionId: missionId ?? null,
          wonMission: false,
          missionSeasonsCompleted: 0,
          specialization: null,
          adUntilDay: 0,
          offensiveUntilDay: 0,
        });

        // Konkurrenten zurücksetzen.
        useCompetitor.getState().resetCompetitors();

        // Ziele und Postfach frisch aufsetzen.
        useGoal.getState().reset();
        useGoal.getState().generateGoals("Frühling", 1);
        const mail = useMail.getState();
        mail.clearAll();
        mail.receive({
          from: "Zentrale",
          subject: `Willkommen bei ${firm}!`,
          body:
            `Herzlich willkommen bei ${firm}!\n\nDein Startkapital beträgt ${euro(budget)}. ` +
            `Deine Aufgabe: das Lager klug füllen und Gewinn machen — Marge × Drehzahl.\n\n` +
            `Achte auf Lagerplatz (Lager für Trockenware, Verkaufsfläche für Frischware) ` +
            `und auf die Haltbarkeit der Frischware. Viel Erfolg!`,
          day: 1,
          kind: "info",
        });
        for (const [pid, o] of Object.entries(offers)) offerMail(pid, o, 1);
      },

      setFirmName: (name) => set({ firmName: name }),

      resetGame: () => {
        useGoal.getState().reset();
        useMail.getState().clearAll();
        useCompetitor.getState().resetCompetitors();
        set({
          started: false,
          mode: null,
          firmName: "",
          cash: 0,
          day: 1,
          batches: {},
          stats: {},
          offers: {},
          upgrades: emptyUpgrades(),
          lastRevenue: 0,
          lastSpoiledValue: 0,
          satisfaction: 80,
          lastMissed: {},
          recap: null,
          recapOpen: false,
          supplierMods: {},
          trendProductId: null,
          seasonEvent: null,
          supplierOutage: {},
          history: [],
          demandedByProduct: {},
          contracts: [],
          pendingOrders: [],
          prices: {},
          branches: 0,
          seasonCrisis: null,
          playMode: null,
          missionId: null,
          wonMission: false,
          missionSeasonsCompleted: 0,
          specialization: null,
          adUntilDay: 0,
          offensiveUntilDay: 0,
        });
      },

      closeWin: () => set({ wonMission: false, missionId: null, playMode: "endlos" }),

      setSpecialization: (spec) => {
        const { specialization, branches, cash } = get();
        if (branches < 1) {
          return { ok: false, msg: "Spezialisierung wird erst nach deiner ersten Filiale freigeschaltet." };
        }
        if (specialization === spec) return { ok: false, msg: "Diese Ausrichtung ist bereits aktiv." };
        // Erste Wahl gratis, jeder weitere Wechsel kostet eine Umbau-Gebühr.
        const cost = specialization === null ? 0 : SPEC_SWITCH_COST;
        if (cost > cash) {
          return { ok: false, msg: `Strategiewechsel kostet ${euro(cost)} — nicht genug Geld.` };
        }
        const meta = SPECIALIZATIONS.find((s) => s.id === spec)!;
        set({ specialization: spec, cash: +(cash - cost).toFixed(2) });
        useMail.getState().receive({
          from: "Zentrale",
          subject: `${meta.emoji} Neue Ausrichtung: ${meta.name}`,
          body:
            `Dein Markt richtet sich neu aus: ${meta.name}.\n\n${meta.tagline}\n\n` +
            `Vorteile:\n• ${meta.perks.join("\n• ")}\n\n` +
            `Zu beachten: ${meta.tradeoff}` +
            (cost > 0 ? `\n\nUmbaukosten: ${euro(cost)}.` : ""),
          day: get().day,
          kind: "info",
        });
        return { ok: true };
      },

      launchAdCampaign: () => {
        const { cash, day, adUntilDay } = get();
        if (adUntilDay >= day) return { ok: false, msg: "Es läuft bereits eine Werbekampagne." };
        if (cash < AD_CAMPAIGN.cost) {
          return { ok: false, msg: `Werbekampagne kostet ${euro(AD_CAMPAIGN.cost)} — nicht genug Geld.` };
        }
        set({ cash: +(cash - AD_CAMPAIGN.cost).toFixed(2), adUntilDay: day + AD_CAMPAIGN.days - 1 });
        useMail.getState().receive({
          from: "Marketing",
          subject: "📢 Werbekampagne gestartet",
          body:
            `Deine Kampagne läuft für ${AD_CAMPAIGN.days} Tage.\n\n` +
            `+30 % Laufkundschaft und der Druck der Konkurrenz wird spürbar zurückgedrängt.\n\n` +
            `Kosten: ${euro(AD_CAMPAIGN.cost)}.`,
          day,
          kind: "info",
        });
        return { ok: true };
      },

      launchPriceOffensive: () => {
        const { day, offensiveUntilDay } = get();
        if (offensiveUntilDay >= day) return { ok: false, msg: "Es läuft bereits eine Preisoffensive." };
        set({ offensiveUntilDay: day + PRICE_OFFENSIVE.days - 1 });
        useMail.getState().receive({
          from: "Marketing",
          subject: "💥 Preisoffensive gestartet",
          body:
            `Für ${PRICE_OFFENSIVE.days} Tage verkaufst du alles 15 % günstiger.\n\n` +
            `+25 % Nachfrage und du jagst der Konkurrenz Marktanteile ab — ` +
            `dafür opferst du Marge. Achte auf deinen Gewinn!`,
          day,
          kind: "info",
        });
        return { ok: true };
      },

      buy: (productId, qty, supplierId) => {
        if (qty <= 0) return { ok: false, msg: "Menge muss größer als 0 sein." };
        const p = byId(productId);
        if (!p) return { ok: false, msg: "Produkt unbekannt." };
        const { cash, batches, offers, day, upgrades, supplierMods, supplierOutage, contracts, pendingOrders } = get();
        // Eigenmarken: nur kaufen wenn Upgrade aktiv.
        if (p.requiresUpgrade === "eigenmarke" && (upgrades.eigenmarke ?? 0) < 1) {
          return { ok: false, msg: "Eigenmarken-Regal noch nicht freigeschaltet." };
        }
        // Ausfall-Check.
        if (supplierOutage[supplierId] !== undefined && supplierOutage[supplierId] >= day) {
          const name = SUPPLIERS.find((s) => s.id === supplierId)?.name ?? supplierId;
          return { ok: false, msg: `${name} ist gerade nicht verfügbar (Ausfall bis Tag ${supplierOutage[supplierId]}).` };
        }
        // Großmarkt: Lieferwagen-Upgrade + Mindestmenge prüfen.
        const sup = SUPPLIERS.find((s) => s.id === supplierId);
        if (sup?.requiresUpgrade === "lieferwagen" && (upgrades.lieferwagen ?? 0) < 1) {
          return { ok: false, msg: "Lieferwagen noch nicht vorhanden." };
        }
        if (sup?.minQty && qty < sup.minQty) {
          return { ok: false, msg: `${sup.name} liefert mindestens ${sup.minQty} Stück.` };
        }
        // Effektiver EK: Lieferantenpreis × Tagesmod × (1 − Angebotsrabatt) × (1 − Vertragsrabatt).
        const priceMod = supplierMods[supplierId] ?? 1.0;
        const offerRabatt = offers[productId]?.rabatt ?? 0;
        const contractRabatt = contracts.includes(supplierId) ? 0.10 : 0.0;
        const effBase = supplierBaseEk(p, supplierId) * priceMod * (1 - offerRabatt) * (1 - contractRabatt);
        const total = +(unitPrice(effBase, qty) * qty).toFixed(2);
        if (total > cash) return { ok: false, msg: "Nicht genug Geld auf dem Konto." };

        // Lagerplatz prüfen: Bestand + ausstehende Bestellungen + neue Menge ≤ Kapazität.
        const used = usedCapacity(batches);
        const pend = pendingCapOf(pendingOrders);
        const cap = capacityOf(upgrades);
        const area: StorageArea = p.storage === "frisch" ? "frisch" : "trocken";
        const frei = cap[area] - used[area] - pend[area];
        if (qty > frei) {
          const ort = area === "frisch" ? "in der Verkaufsfläche" : "im Lager";
          return {
            ok: false,
            msg: `Kein Platz mehr ${ort} — nur noch ${frei} Stück frei (inkl. unterwegs).`,
          };
        }

        const deliveryDays = sup?.deliveryDays ?? 1;
        const lief = sup ?? SUPPLIERS[0];

        if (deliveryDays === 0) {
          // Sofortige Lieferung (Großmarkt-Abholung): direkt in Bestand.
          const list = batches[productId] ? [...batches[productId]] : [];
          list.push({ qty, age: 0 });
          set({
            cash: +(cash - total).toFixed(2),
            batches: { ...batches, [productId]: list },
          });
          useMail.getState().receive({
            from: lief.name,
            subject: `Rechnung: ${qty}× ${p.name} — ${euro(total)}`,
            body:
              `Bestellbestätigung\n\n` +
              `Artikel: ${p.name}\nMenge: ${qty} Stück\n` +
              `Stückpreis: ${euro(unitPrice(effBase, qty))}\n` +
              `Gesamtbetrag: ${euro(total)}\n\n` +
              `Abholung: sofort (Großmarkt). Ware ist eingetroffen und ` +
              `${area === "frisch" ? "in der Verkaufsfläche" : "im Lager"} eingelagert.\n\n` +
              `Vielen Dank!\n${lief.name}`,
            day,
            kind: "rechnung",
          });
          return { ok: true, arrivalDay: day, deliveryDays: 0 };
        }

        // Verzögerte Lieferung: Bestellung in Warteschlange.
        const arrivalDay = day + deliveryDays;
        const order: PendingOrder = {
          id: `${day}-${productId}-${supplierId}-${Date.now()}`,
          productId,
          qty,
          arrivalDay,
          supplierId,
          area,
        };
        set({
          cash: +(cash - total).toFixed(2),
          pendingOrders: [...pendingOrders, order],
        });
        useMail.getState().receive({
          from: lief.name,
          subject: `Bestellung: ${qty}× ${p.name} — ${euro(total)}`,
          body:
            `Bestellbestätigung\n\n` +
            `Artikel: ${p.name}\nMenge: ${qty} Stück\n` +
            `Stückpreis: ${euro(unitPrice(effBase, qty))}\n` +
            `Gesamtbetrag: ${euro(total)}\n\n` +
            `Lieferung: Tag ${arrivalDay} (in ${deliveryDays} Tag${deliveryDays > 1 ? "en" : ""}).\n` +
            `Betrag wurde bereits beglichen. Lagerplatz ist reserviert.\n\n` +
            `Vielen Dank für Ihren Einkauf!\n${lief.name}`,
          day,
          kind: "rechnung",
        });
        return { ok: true, arrivalDay, deliveryDays };
      },

      upgrade: (track) => {
        const { cash, upgrades } = get();
        const level = upgrades[track];
        const meta = UPGRADE_META[track];
        if (meta.maxLevel !== undefined && level >= meta.maxLevel) {
          return { ok: false, msg: "Maximalstufe bereits erreicht." };
        }
        const cost = upgradeCost(track, level);
        if (cost > cash) return { ok: false, msg: "Nicht genug Geld für den Ausbau." };
        set({
          cash: +(cash - cost).toFixed(2),
          upgrades: { ...upgrades, [track]: level + 1 },
        });
        return { ok: true };
      },

      signContract: (supplierId) => {
        const { cash, contracts } = get();
        if (contracts.includes(supplierId)) {
          return { ok: false, msg: "Mit diesem Lieferanten besteht bereits ein Vertrag." };
        }
        if (contracts.length >= 2) {
          return { ok: false, msg: "Maximal 2 Stammkunden-Verträge gleichzeitig möglich." };
        }
        const cost = 1000;
        if (cash < cost) return { ok: false, msg: "Nicht genug Geld für den Vertragsabschluss." };
        const sup = SUPPLIERS.find((s) => s.id === supplierId);
        set({ cash: +(cash - cost).toFixed(2), contracts: [...contracts, supplierId] });
        useMail.getState().receive({
          from: sup?.name ?? supplierId,
          subject: `✅ Stammkunden-Vertrag abgeschlossen`,
          body:
            `Herzlichen Glückwunsch!\n\nIhr Stammkunden-Vertrag mit ${sup?.name ?? supplierId} ist jetzt aktiv.\n\n` +
            `Sie erhalten ab sofort −10 % auf alle Bestellungen bei uns.\n\n` +
            `Mit freundlichen Grüßen\n${sup?.name ?? supplierId}`,
          day: get().day,
          kind: "info",
        });
        return { ok: true };
      },

      cancelContract: (supplierId) => {
        const { contracts } = get();
        set({ contracts: contracts.filter((id) => id !== supplierId) });
      },

      setPrice: (productId, price) =>
        set((s) => ({ prices: { ...s.prices, [productId]: price } })),

      openBranch: () => {
        const { cash, branches, lastRevenue, day, playMode, missionId, wonMission, stats } = get();
        const cost = branchCost(branches);
        if (cash < cost) return { ok: false, msg: `Noch ${euro(cost - cash)} fehlen für die Expansion.` };
        const newBranches = branches + 1;
        set({ cash: +(cash - cost).toFixed(2), branches: newBranches });
        useMail.getState().receive({
          from: "Immobilienmakler Schmidt",
          subject: `🏪 Filiale ${newBranches} eröffnet!`,
          body:
            `Herzlichen Glückwunsch!\n\nIhre Filiale ${newBranches} ist ab sofort eröffnet.\n\n` +
            `Sie generiert täglich 12 % Ihres gestrigen Tagesumsatzes als Passiveinkommen — ` +
            `gestern wären das ${euro(+(lastRevenue * 0.12).toFixed(2))} gewesen.\n\n` +
            `Viel Erfolg bei der weiteren Expansion!\n\nIhr Immobilienmakler Schmidt`,
          day,
          kind: "info",
        });
        // Win-Condition prüfen (Kampagne: branches / empire)
        if (playMode === "kampagne" && missionId && !wonMission) {
          const mission = MISSIONS.find((m) => m.id === missionId);
          if (mission) {
            const wc = mission.winCondition;
            const totalRev = Object.values(stats).reduce((s, r) => s + r.revenue, 0);
            if (
              (wc.type === "branches" && newBranches >= wc.count) ||
              (wc.type === "empire" && newBranches >= wc.branches && totalRev >= wc.yearRevenue)
            ) {
              set({ wonMission: true });
            }
          }
        }
        return { ok: true };
      },

      advanceDay: () => {
        const { batches: rawBatches, stats, cash, day, offers, upgrades, lastRevenue, satisfaction,
          supplierMods, seasonEvent, supplierOutage, history, demandedByProduct, pendingOrders,
          prices, branches, seasonCrisis, playMode, missionId, wonMission, missionSeasonsCompleted,
          specialization, adUntilDay, offensiveUntilDay } = get();
        const { season, seasonDay } = dayToCalendar(day);

        // Aktive Konkurrenz-Aktionen heute?
        const adActive = adUntilDay >= day;
        const offensiveActive = offensiveUntilDay >= day;
        // Preisoffensive senkt alle Verkaufspreise (Margen-Opfer für Marktanteil).
        const sellMult = offensiveActive ? PRICE_OFFENSIVE.priceMult : 1.0;

        // Konkurrenten für diesen Tag ticken lassen (Stärke + Nachrichten).
        useCompetitor.getState().advance(day);
        // Marktdruck: Konkurrenten reduzieren die effektive Nachfrage leicht (max. 12 %).
        // Werbung/Preisoffensive drängen diesen Druck zurück.
        let competitorPressure = useCompetitor.getState().marketPressure();
        if (adActive) competitorPressure *= AD_CAMPAIGN.pressureMult;
        if (offensiveActive) competitorPressure *= PRICE_OFFENSIVE.pressureMult;

        // Lieferungen ausliefern: Bestellungen die heute ankommen → in Bestand.
        const arrivingOrders = pendingOrders.filter((o) => o.arrivalDay === day);
        const batches = { ...rawBatches };
        for (const o of arrivingOrders) {
          const list = batches[o.productId] ? [...batches[o.productId]] : [];
          list.push({ qty: o.qty, age: 0 });
          batches[o.productId] = list;
        }
        const remainingPending = pendingOrders.filter((o) => o.arrivalDay !== day);
        const newBatches: Record<string, Batch[]> = {};
        const newStats: Record<string, ProductStat> = { ...stats };
        const newDemandedByProduct: Record<string, number> = { ...demandedByProduct };
        let revenue = 0;
        let spoiledValue = 0;
        let unitsSold = 0;
        let unitsFresh = 0; // für Ziel "units_fresh"
        let best: { name: string; qty: number } | null = null;
        let demandedTotal = 0;
        const missedByProduct: Record<string, number> = {};

        for (const p of CATALOG) {
          let list = (batches[p.id] ?? []).map((b) => ({ ...b }));
          const stat = { ...(newStats[p.id] ?? emptyStat()) };

          // 1) Verkauf nach Nachfrage (inkl. Saison, Welle, Trend, Event), FIFO.
          let soldThis = 0;
          const demand = Math.floor(
            effectiveSales(p, upgrades, satisfaction, season, seasonDay) * (1 - competitorPressure),
          );
          const stock = list.reduce((s, b) => s + b.qty, 0);
          demandedTotal += demand;
          newDemandedByProduct[p.id] = (newDemandedByProduct[p.id] ?? 0) + demand;
          if (demand > stock) missedByProduct[p.id] = demand - stock;
          let toSell = Math.min(demand, stock);
          for (const b of list) {
            if (toSell <= 0) break;
            const take = Math.min(b.qty, toSell);
            b.qty -= take;
            toSell -= take;
            soldThis += take;
            revenue += take * (prices[p.id] ?? p.vk) * sellMult;
            stat.sold += take;
            stat.revenue += take * p.vk;
            stat.ageSum += take * b.age; // Alter beim Verkauf -> Ø Lagerdauer
          }
          unitsSold += soldThis;
          if (p.storage === "frisch") unitsFresh += soldThis;
          if (soldThis > 0 && (!best || soldThis > best.qty))
            best = { name: p.name, qty: soldThis };
          list = list.filter((b) => b.qty > 0);

          // 2) Chargen altern.
          for (const b of list) b.age += 1;

          // 3) Verderb: nur Frischware, deren effektive Haltbarkeit (inkl. Kühltheke) erreicht.
          if (p.storage === "frisch" && p.shelfLifeDays) {
            const baseShelf = effectiveShelfLife(p, upgrades);
            // Hitzewelle halbiert die Haltbarkeit aller Frischprodukte
            const hitzeFactor = isCrisisActive(seasonCrisis, day) && seasonCrisis?.type === "hitzewelle" ? 0.5 : 1.0;
            const shelf = Math.max(1, Math.floor(baseShelf * hitzeFactor));
            const personalFactor = 1 - (upgrades.personal ?? 0) * 0.10;
            const survivors: Batch[] = [];
            for (const b of list) {
              if (b.age >= shelf) {
                // Mitarbeiter retten einen Teil der verderbenden Ware (bessere Rotation).
                const actualSpoiled = Math.ceil(b.qty * personalFactor);
                stat.spoiled += actualSpoiled;
                spoiledValue += actualSpoiled * p.ek;
              } else {
                survivors.push(b);
              }
            }
            list = survivors;
          }

          newBatches[p.id] = list;
          newStats[p.id] = stat;
        }

        // Angebote altern lassen, abgelaufene entfernen, ggf. neues dazu.
        const newOffers: Record<string, Offer> = {};
        for (const [id, o] of Object.entries(offers)) {
          if (o.daysLeft - 1 > 0) newOffers[id] = { ...o, daysLeft: o.daysLeft - 1 };
        }
        if (Object.keys(newOffers).length < 3 && Math.random() < 0.5) {
          const o = rollOffer(newOffers);
          if (o) {
            newOffers[o[0]] = o[1];
            offerMail(o[0], o[1], day + 1); // Lieferant meldet sich per Mail
          }
        }

        // --- Saison-Wechsel-Logik -----------------------------------------------
        const nextCal = dayToCalendar(day + 1);
        const SEASON_EMOJI: Record<string, string> = {
          Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
        };
        let newSeasonEvent = seasonEvent;

        if (nextCal.season !== season) {
          // Neue Saison: Mail + neues Saison-Event anlegen.
          const evergreens = CATALOG.filter((p) => p.onlyInSeason === nextCal.season && !p.seasonWave);
          const wave1 = CATALOG.filter((p) => p.onlyInSeason === nextCal.season && p.seasonWave === 1);
          const everText = evergreens.length ? `Dauerhaft: ${evergreens.map((p) => p.name).join(", ")}.` : "";
          const w1Text = wave1.length ? `\nAktionswelle 1 (Tage 1–5): ${wave1.map((p) => p.name).join(", ")}.` : "";
          useMail.getState().receive({
            from: "Zentrale",
            subject: `${SEASON_EMOJI[nextCal.season]} ${nextCal.season} beginnt — Q${nextCal.quarter}`,
            body:
              `Ab morgen (Tag ${day + 1}) beginnt ${nextCal.season}!\n\n` +
              `Das Kaufverhalten deiner Kunden ändert sich — passe deine Bestellmengen an.\n\n` +
              `${everText}${w1Text}\n\nViel Erfolg im ${nextCal.season}!`,
            day: day + 1,
            kind: "info",
          });
          newSeasonEvent = makeSeasonEvent(day + 1, nextCal.season);
        }

        // Aktionswellen-Wechsel innerhalb der Saison.
        if (nextCal.season === season) {
          const curWave = currentSeasonWave(seasonDay);
          const nextWave = currentSeasonWave(nextCal.seasonDay);
          if (nextWave !== curWave) {
            const waveProducts = CATALOG.filter(
              (p) => p.onlyInSeason === season && p.seasonWave === nextWave,
            );
            if (waveProducts.length) {
              useMail.getState().receive({
                from: "Zentrale",
                subject: `${SEASON_EMOJI[season]} Aktionswelle ${nextWave} startet morgen`,
                body:
                  `Morgen startet Aktionswelle ${nextWave} im ${season}!\n\n` +
                  `Neu im Sortiment: ${waveProducts.map((p) => p.name).join(", ")}.\n\n` +
                  `Bestelle rechtzeitig!`,
                day: day + 1,
                kind: "info",
              });
            }
          }
        }

        // Jahreswechsel.
        if (nextCal.year !== dayToCalendar(day).year) {
          useMail.getState().receive({
            from: "Zentrale",
            subject: `🎉 Jahr ${nextCal.year} beginnt`,
            body:
              `Herzlichen Glückwunsch — du hast dein erstes Jahr erfolgreich abgeschlossen!\n\n` +
              `Jahr ${nextCal.year} startet. Weiter so!`,
            day: day + 1,
            kind: "info",
          });
        }

        // --- Saison-Event: Vorankündigung 2 Tage vorher -----------------------
        let notifiedEvent = newSeasonEvent;
        if (newSeasonEvent && !newSeasonEvent.notified && day + 1 === newSeasonEvent.triggerDay - 1) {
          const ep = byId(newSeasonEvent.productId);
          useMail.getState().receive({
            from: "Marktforschung",
            subject: `📊 Trend-Alert: ${ep.name} übermorgen!`,
            body:
              `Unsere Analyse zeigt: In 2 Tagen ist mit einer massiven Nachfragespitze ` +
              `bei ${ep.name} zu rechnen.\n\nSorge jetzt für ausreichend Vorrat — ` +
              `wer gut bestückt ist, kann an diesem Tag besonders gut verdienen!`,
            day: day + 1,
            kind: "info",
          });
          notifiedEvent = { ...newSeasonEvent, notified: true };
        }

        // --- Krisen-Logik ------------------------------------------------
        // Abgelaufene Krise bereinigen; bei Saisonwechsel neue rollen.
        let newSeasonCrisis: SeasonCrisis | null = day >= (seasonCrisis?.endDay ?? -1) ? null : seasonCrisis;
        if (nextCal.season !== season) {
          newSeasonCrisis = Math.random() < 0.7 ? rollCrisis(day + 1, nextCal.season) : null;
        }
        // Vorankündigung 1 Tag vorher senden (Mail erscheint morgen, Trigger übermorgen)
        if (newSeasonCrisis && !newSeasonCrisis.announced && day + 1 === newSeasonCrisis.triggerDay - 1) {
          sendCrisisAnnouncementMail(newSeasonCrisis, day + 1);
          newSeasonCrisis = { ...newSeasonCrisis, announced: true };
        }

        // --- Neue Lieferantenpreise (alle 3 Tage) ----------------------------
        const newSupplierMods = (day + 1) % 3 === 1 ? rollSupplierMods() : supplierMods;

        // --- Trend-Produkt für morgen rollen ---------------------------------
        const newTrend = rollTrendProduct(nextCal.season, nextCal.seasonDay);

        // --- Lieferanten-Ausfall ---------------------------------------------
        const newOutage = maybeSupplierOutage(supplierOutage, day + 1) ?? {};
        // Lieferskandal: Lieferant für die gesamte Krisen-Dauer sperren
        if (newSeasonCrisis?.type === "lieferskandal" &&
            day + 1 === newSeasonCrisis.triggerDay &&
            newSeasonCrisis.affectedSupplierId) {
          newOutage[newSeasonCrisis.affectedSupplierId] = newSeasonCrisis.endDay;
        }

        // --- Ziel-Fortschritt für heute aktualisieren --------------------
        const goalDailyBonus = useGoal.getState().updateProgress({
          day,
          revenue: +revenue.toFixed(2),
          spoiledValue: +spoiledValue.toFixed(2),
          unitsFresh,
          unitsSold,
          demandedTotal,
        });

        // Tageslohn abziehen und per Mail warnen wenn Konto kritisch.
        const wage = dailyWage(upgrades);
        // Passiveinkommen aus Filialen: 12 % des gestrigen Tagesumsatzes pro Filiale.
        const branchIncome = +(branches * 0.12 * lastRevenue).toFixed(2);
        const cashAfterSales = +(cash + revenue + goalDailyBonus + branchIncome).toFixed(2);
        const cashAfter = +(cashAfterSales - wage).toFixed(2);
        if (wage > 0 && cashAfter < 500) {
          useMail.getState().receive({
            from: "Buchhaltung",
            subject: "⚠️ Kontostand kritisch nach Lohnzahlung",
            body:
              `Heute wurden ${euro(wage)} Tageslohn für ${upgrades.personal} Mitarbeiter abgezogen.\n\n` +
              `Dein Kontostand beträgt jetzt nur noch ${euro(cashAfter)}.\n\n` +
              `Sorge für ausreichend Einnahmen — oder erwäge, Personal zu reduzieren.`,
            day: day + 1,
            kind: "info",
          });
        }

        // Tages-Datensatz für die Historie (max. 52 Einträge behalten).
        const todayRecord: DayRecord = {
          day,
          revenue: +revenue.toFixed(2),
          spoiledValue: +spoiledValue.toFixed(2),
          unitsSold,
          demandedTotal,
          satisfaction: 0, // wird gleich mit newSat überschrieben
          cash: cashAfter,
        };

        // Zufriedenheit + Kundenstimmen aus dem Tag ableiten.
        const missedUnits = Object.values(missedByProduct).reduce((s, n) => s + n, 0);
        const { satisfaction: newSat, voices } = computeSatisfaction({
          prevSat: satisfaction,
          demanded: demandedTotal,
          served: unitsSold,
          missedByProduct,
          upgrades,
          personalBonus: (upgrades.personal ?? 0) * 3 + specSatBonus(specialization),
        });

        // Konkurrenz-Reaktion prüfen: wenn Spieler stark, reagiert ein Konkurrent per Mail.
        const reaction = useCompetitor.getState().checkReaction(+revenue.toFixed(2), newSat, day);
        if (reaction) {
          useMail.getState().receive({
            from: reaction.competitor.name,
            subject: reaction.mailSubject,
            body: reaction.mailBody,
            day: day + 1,
            kind: "info",
          });
        }

        const newHistory = [
          ...history.slice(-51),
          { ...todayRecord, satisfaction: newSat },
        ];

        // --- Saison-Ziele finalisieren & neue Ziele generieren -----------
        const seasonChanging = nextCal.season !== season;
        const yearChanging = nextCal.year !== dayToCalendar(day).year;
        let goalSeasonBonus = 0;

        if (seasonChanging || yearChanging) {
          goalSeasonBonus = useGoal.getState().finalizeSeasonGoals(newSat, day);
        }
        if (seasonChanging) {
          useGoal.getState().generateGoals(nextCal.season, nextCal.year);
        }
        if (yearChanging) {
          useGoal.getState().triggerYearEnd(newHistory);
        }

        // --- Win-Condition prüfen (Kampagnenmodus) ---------------------------
        let didWin = wonMission;
        let newMissionSeasonsCompleted = missionSeasonsCompleted;
        if (!didWin && playMode === "kampagne" && missionId) {
          const mission = MISSIONS.find((m) => m.id === missionId);
          if (mission) {
            const wc = mission.winCondition;
            // year_revenue: am Jahresende prüfen
            if (wc.type === "year_revenue" && yearChanging) {
              const thisYear = dayToCalendar(day).year;
              if (thisYear >= wc.year) {
                const yearRev = newHistory
                  .filter((r) => dayToCalendar(r.day).year === thisYear)
                  .reduce((s, r) => s + r.revenue, 0);
                if (yearRev >= wc.target) didWin = true;
              }
            }
            // branches & empire: Fallback (wird auch in openBranch geprüft)
            if (wc.type === "branches" && branches >= wc.count) didWin = true;
            if (wc.type === "empire") {
              const totalRev = Object.values(newStats).reduce((s, r) => s + r.revenue, 0);
              if (branches >= wc.branches && totalRev >= wc.yearRevenue) didWin = true;
            }
            // survive_seasons: am Saisonende prüfen
            if (wc.type === "survive_seasons" && seasonChanging && newSat >= wc.minSat) {
              newMissionSeasonsCompleted += 1;
              if (newMissionSeasonsCompleted >= wc.count) didWin = true;
            }
          }
        }

        set({
          batches: newBatches,
          stats: newStats,
          offers: newOffers,
          pendingOrders: remainingPending,
          cash: +(cashAfter + goalSeasonBonus).toFixed(2),
          day: day + 1,
          lastRevenue: +revenue.toFixed(2),
          lastSpoiledValue: +spoiledValue.toFixed(2),
          satisfaction: newSat,
          lastMissed: missedByProduct,
          supplierMods: newSupplierMods,
          trendProductId: newTrend,
          seasonEvent: notifiedEvent,
          supplierOutage: newOutage,
          history: newHistory,
          demandedByProduct: newDemandedByProduct,
          seasonCrisis: newSeasonCrisis,
          wonMission: didWin,
          missionSeasonsCompleted: newMissionSeasonsCompleted,
          recap: {
            day,
            revenue: +revenue.toFixed(2),
            spoiledValue: +spoiledValue.toFixed(2),
            prevRevenue: +lastRevenue.toFixed(2),
            unitsSold,
            bestseller: best,
            satisfaction: newSat,
            prevSatisfaction: satisfaction,
            missedUnits,
            voices,
            branchIncome,
          },
          recapOpen: true,
        });
      },

      closeRecap: () => set({ recapOpen: false }),
    }),
    {
      name: "retail-tycoon-save",
      version: 11,
      migrate: (raw) => {
        const s = (raw ?? {}) as Record<string, unknown>;
        const rawUpgrades = (s.upgrades ?? {}) as Partial<Upgrades>;
        return {
          started: (s.started as boolean) ?? false,
          mode: (s.mode as GameModeId | null) ?? null,
          firmName: (s.firmName as string) ?? "",
          cash: (s.cash as number) ?? 0,
          day: (s.day as number) ?? 1,
          batches: (s.batches as Record<string, Batch[]>) ?? {},
          stats: (s.stats as Record<string, ProductStat>) ?? {},
          offers: (s.offers as Record<string, Offer>) ?? {},
          upgrades: { ...emptyUpgrades(), ...rawUpgrades },
          lastRevenue: (s.lastRevenue as number) ?? 0,
          lastSpoiledValue: (s.lastSpoiledValue as number) ?? 0,
          satisfaction: (s.satisfaction as number) ?? 80,
          lastMissed: (s.lastMissed as Record<string, number>) ?? {},
          supplierMods: (s.supplierMods as Record<string, number>) ?? {},
          trendProductId: (s.trendProductId as string | null) ?? null,
          seasonEvent: (s.seasonEvent as SeasonEvent | null) ?? null,
          supplierOutage: (s.supplierOutage as Record<string, number>) ?? {},
          history: (s.history as DayRecord[]) ?? [],
          demandedByProduct: (s.demandedByProduct as Record<string, number>) ?? {},
          contracts: (s.contracts as string[]) ?? [],
          pendingOrders: (s.pendingOrders as PendingOrder[]) ?? [],
          prices: (s.prices as Record<string, number>) ?? {},
          branches: (s.branches as number) ?? 0,
          seasonCrisis: (s.seasonCrisis as SeasonCrisis | null) ?? null,
          playMode: (s.playMode as PlayMode | null) ?? null,
          missionId: (s.missionId as string | null) ?? null,
          wonMission: (s.wonMission as boolean) ?? false,
          missionSeasonsCompleted: (s.missionSeasonsCompleted as number) ?? 0,
          specialization: (s.specialization as Specialization | null) ?? null,
          adUntilDay: (s.adUntilDay as number) ?? 0,
          offensiveUntilDay: (s.offensiveUntilDay as number) ?? 0,
          recap: null,
          recapOpen: false,
        };
      },
      partialize: (s) => ({
        started: s.started,
        mode: s.mode,
        firmName: s.firmName,
        cash: s.cash,
        day: s.day,
        batches: s.batches,
        stats: s.stats,
        offers: s.offers,
        upgrades: s.upgrades,
        lastRevenue: s.lastRevenue,
        lastSpoiledValue: s.lastSpoiledValue,
        satisfaction: s.satisfaction,
        lastMissed: s.lastMissed,
        supplierMods: s.supplierMods,
        trendProductId: s.trendProductId,
        seasonEvent: s.seasonEvent,
        supplierOutage: s.supplierOutage,
        history: s.history,
        demandedByProduct: s.demandedByProduct,
        contracts: s.contracts,
        pendingOrders: s.pendingOrders,
        prices: s.prices,
        branches: s.branches,
        seasonCrisis: s.seasonCrisis,
        playMode: s.playMode,
        missionId: s.missionId,
        wonMission: s.wonMission,
        missionSeasonsCompleted: s.missionSeasonsCompleted,
        specialization: s.specialization,
        adUntilDay: s.adUntilDay,
        offensiveUntilDay: s.offensiveUntilDay,
        recap: s.recap,
      }),
    },
  ),
);
