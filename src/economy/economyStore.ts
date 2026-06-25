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

// --- Start-Angebote: 2 Stück.
function seedOffers(): Record<string, Offer> {
  const active: Record<string, Offer> = {};
  for (let i = 0; i < 2; i++) {
    const o = rollOffer(active);
    if (o) active[o[0]] = o[1];
  }
  return active;
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
  // Name des Supermarkts — wird auf dem Startscreen gesetzt.
  firmName: string;

  startGame: (id: GameModeId, name?: string) => void;
  setFirmName: (name: string) => void;
  resetGame: () => void;
  buy: (productId: string, qty: number, supplierId: string) => { ok: boolean; msg?: string };
  upgrade: (track: UpgradeTrack) => { ok: boolean; msg?: string };
  signContract: (supplierId: string) => { ok: boolean; msg?: string };
  cancelContract: (supplierId: string) => void;
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
export function capacityOf(u?: Upgrades): { trocken: number; frisch: number } {
  return {
    trocken: BASE_CAP.trocken + (u?.lager ?? 0) * CAP_STEP.trocken,
    frisch: BASE_CAP.frisch + (u?.flaeche ?? 0) * CAP_STEP.frisch,
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

  return Math.round(
    p.salesPerDay * kundenstrom(u) * satisfactionMultiplier(s) * sf * trendFactor * eventFactor,
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
  const { batches, upgrades, day, satisfaction } = useEconomy.getState();
  const { season, seasonDay } = dayToCalendar(day);
  let revenue = 0;
  let soldTrocken = 0;
  let soldFrisch = 0;
  for (const p of CATALOG) {
    const stock = stockOf(batches, p.id);
    const sell = Math.min(effectiveSales(p, upgrades, satisfaction, season, seasonDay), stock);
    revenue += sell * p.vk;
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
      firmName: "",

      startGame: (id, name) => {
        const mode = MODES.find((m) => m.id === id);
        if (!mode) return;
        const firm = name?.trim() || "Mein Supermarkt";
        const offers = seedOffers();
        set({
          started: true,
          mode: id,
          firmName: firm,
          cash: mode.budget,
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
            `Herzlich willkommen bei ${firm}!\n\nDein Startkapital beträgt ${euro(mode.budget)}. ` +
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
        });
      },

      buy: (productId, qty, supplierId) => {
        if (qty <= 0) return { ok: false, msg: "Menge muss größer als 0 sein." };
        const p = byId(productId);
        if (!p) return { ok: false, msg: "Produkt unbekannt." };
        const { cash, batches, offers, day, upgrades, supplierMods, supplierOutage, contracts } = get();
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

        // Lagerplatz prüfen: passt die Menge noch in die jeweilige Fläche?
        const used = usedCapacity(batches);
        const cap = capacityOf(upgrades);
        const area: StorageArea = p.storage === "frisch" ? "frisch" : "trocken";
        const frei = cap[area] - used[area];
        if (qty > frei) {
          const ort = area === "frisch" ? "in der Verkaufsfläche" : "im Lager";
          return {
            ok: false,
            msg: `Kein Platz mehr ${ort} — nur noch ${frei} Stück frei.`,
          };
        }

        const list = batches[productId] ? [...batches[productId]] : [];
        list.push({ qty, age: 0 }); // neue Charge, frisch eingekauft
        set({
          cash: +(cash - total).toFixed(2),
          batches: { ...batches, [productId]: list },
        });

        // Bestellbestätigung / Rechnung ins Postfach (bereits bezahlt).
        const lief = SUPPLIERS.find((s) => s.id === supplierId) ?? SUPPLIERS[0];
        useMail.getState().receive({
          from: lief.name,
          subject: `Rechnung: ${qty}× ${p.name} — ${euro(total)}`,
          body:
            `Bestellbestätigung\n\n` +
            `Artikel: ${p.name}\nMenge: ${qty} Stück\n` +
            `Stückpreis: ${euro(unitPrice(effBase, qty))}\n` +
            `Gesamtbetrag: ${euro(total)}\n\n` +
            `Betrag wurde direkt vom Konto beglichen. Die Ware ist eingetroffen ` +
            `und ${area === "frisch" ? "in der Verkaufsfläche" : "im Lager"} eingelagert.\n\n` +
            `Vielen Dank für Ihren Einkauf!\n${lief.name}`,
          day,
          kind: "rechnung",
        });
        return { ok: true };
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

      advanceDay: () => {
        const { batches, stats, cash, day, offers, upgrades, lastRevenue, satisfaction,
          supplierMods, seasonEvent, supplierOutage, history, demandedByProduct } = get();
        const { season, seasonDay } = dayToCalendar(day);

        // Konkurrenten für diesen Tag ticken lassen (Stärke + Nachrichten).
        useCompetitor.getState().advance(day);
        // Marktdruck: Konkurrenten reduzieren die effektive Nachfrage leicht (max. 12 %).
        const competitorPressure = useCompetitor.getState().marketPressure();
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
            revenue += take * p.vk;
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
            const shelf = effectiveShelfLife(p, upgrades);
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

        // --- Neue Lieferantenpreise (alle 3 Tage) ----------------------------
        const newSupplierMods = (day + 1) % 3 === 1 ? rollSupplierMods() : supplierMods;

        // --- Trend-Produkt für morgen rollen ---------------------------------
        const newTrend = rollTrendProduct(nextCal.season, nextCal.seasonDay);

        // --- Lieferanten-Ausfall ---------------------------------------------
        const newOutage = maybeSupplierOutage(supplierOutage, day + 1) ?? {};

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
        const cashAfterSales = +(cash + revenue + goalDailyBonus).toFixed(2);
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
          personalBonus: (upgrades.personal ?? 0) * 3,
        });

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

        set({
          batches: newBatches,
          stats: newStats,
          offers: newOffers,
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
          recap: {
            day, // der Tag, der gerade abgeschlossen wurde
            revenue: +revenue.toFixed(2),
            spoiledValue: +spoiledValue.toFixed(2),
            prevRevenue: +lastRevenue.toFixed(2),
            unitsSold,
            bestseller: best,
            satisfaction: newSat,
            prevSatisfaction: satisfaction,
            missedUnits,
            voices,
          },
          recapOpen: true,
        });
      },

      closeRecap: () => set({ recapOpen: false }),
    }),
    {
      name: "retail-tycoon-save",
      version: 8,
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
        recap: s.recap,
      }),
    },
  ),
);
