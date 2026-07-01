import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATALOG,
  unitPrice,
  supplierBaseEk,
  currentSeasonWave,
  SUPPLIERS,
  euro,
  dayToCalendar,
  stockOf,
  type Product,
  type Season,
  type DayRecord,
  type Batch,
} from "./catalog";
import { useMail } from "./mailStore";
import { useGoal } from "./goalStore";
import { useCompetitor } from "./competitorStore";
import { EventBus, Events } from "../game/EventBus";
import { MODES, MISSIONS, type GameModeId, type PlayMode, type MissionDef } from "./missions";
import {
  SPECIALIZATIONS, SPEC_SWITCH_COST, specDemandMult, specPriceExp, specCapMult, specSatBonus,
  type Specialization,
} from "./specializations";
import {
  STORE_THEMES, THEME_SWITCH_COST, themeDemandMult, themeSatBonus, themeFloorTint,
  type StoreTheme,
} from "./themes";
import {
  isCrisisActive, CRISIS_DEMAND_PENALTY,
  type SeasonCrisis, type CrisisType,
} from "./crises";
import {
  emptyUpgrades, capacityOf, kundenstrom, dailyWage, effectiveShelfLife, upgradeCost,
  usedCapacity, UPGRADE_META, type StorageArea, type Upgrades, type UpgradeTrack,
} from "./upgrades";
import {
  seedOffers, offerMail, rollSupplierMods, rollTrendProduct, makeSeasonEvent, rotateDailyMarket,
  type Offer, type SeasonEvent,
} from "./dayRotation";
import { creditLimit, CREDIT_INTEREST_RATE, branchCost, settleDayFinance } from "./finance";

// Re-exportiert, damit bestehende Importe aus "./economyStore" unverändert bleiben.
export {
  MODES, MISSIONS, SPECIALIZATIONS, SPEC_SWITCH_COST, specDemandMult, specPriceExp,
  specCapMult, specSatBonus, STORE_THEMES, THEME_SWITCH_COST, themeDemandMult, themeSatBonus,
  themeFloorTint, isCrisisActive, stockOf,
  capacityOf, kundenstrom, dailyWage, effectiveShelfLife, upgradeCost, usedCapacity, UPGRADE_META,
  creditLimit, CREDIT_INTEREST_RATE, branchCost,
};
export type {
  GameModeId, PlayMode, MissionDef, Specialization, StoreTheme, SeasonCrisis, CrisisType,
  Batch, StorageArea, Upgrades, UpgradeTrack, Offer, SeasonEvent,
};

// --- Daten-Strukturen -----------------------------------------------------

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
  // Kreditlinie
  creditUsed: number;
  // Ladengestaltung
  storeTheme: StoreTheme;

  startGame: (id: GameModeId | null, name?: string, playMode?: PlayMode, missionId?: string) => void;
  setFirmName: (name: string) => void;
  resetGame: () => void;
  closeWin: () => void;
  setSpecialization: (spec: Specialization) => { ok: boolean; msg?: string };
  launchAdCampaign: () => { ok: boolean; msg?: string };
  launchPriceOffensive: () => { ok: boolean; msg?: string };
  takeCredit: (amount: number) => { ok: boolean; msg?: string };
  repayCredit: (amount: number) => { ok: boolean; msg?: string };
  setStoreTheme: (theme: StoreTheme) => { ok: boolean; msg?: string };
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

// Der komplette "leere" Spielzustand (vor dem Start bzw. nach einem Reset).
// Einzige Quelle für Initial-State/startGame/resetGame — neue State-Felder
// müssen nur noch hier ergänzt werden, statt an mehreren Stellen synchron
// gehalten zu werden.
type FreshState = Omit<
  EconomyState,
  | "startGame" | "setFirmName" | "resetGame" | "closeWin" | "setSpecialization"
  | "launchAdCampaign" | "launchPriceOffensive" | "takeCredit" | "repayCredit"
  | "setStoreTheme" | "buy" | "upgrade" | "signContract" | "cancelContract"
  | "setPrice" | "openBranch" | "advanceDay" | "closeRecap"
>;

function freshState(): FreshState {
  return {
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
    creditUsed: 0,
    storeTheme: "standard" as StoreTheme,
  };
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

  const themeMult = themeDemandMult(state.storeTheme);
  return Math.round(
    p.salesPerDay * kundenstrom(u) * satisfactionMultiplier(s) * sf * trendFactor * eventFactor * priceFactor * preiskampfFactor * specMult * adMult * offMult * themeMult,
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

// Ergebnis eines Verkaufs-/Verderb-Durchlaufs für alle Produkte (ein Tag).
interface SalesResult {
  batches: Record<string, Batch[]>;
  stats: Record<string, ProductStat>;
  demandedByProduct: Record<string, number>;
  revenue: number;
  spoiledValue: number;
  unitsSold: number;
  unitsFresh: number;
  bestseller: { name: string; qty: number } | null;
  demandedTotal: number;
  missedByProduct: Record<string, number>;
}

// Verkauft pro Produkt nach Nachfrage (FIFO über die Chargen) und lässt
// Frischware verderben, deren Haltbarkeit erreicht ist. Bewusst nicht in ein
// eigenes Modul ausgelagert: `effectiveSales` hängt am globalen Store
// (useEconomy.getState()), ein Auslagern würde einen zirkulären Import
// erzeugen (siehe Hinweis bei `capacityOf`/`upgrades.ts`).
function runSalesAndSpoilage(args: {
  batches: Record<string, Batch[]>;
  stats: Record<string, ProductStat>;
  demandedByProduct: Record<string, number>;
  upgrades: Upgrades;
  satisfaction: number;
  season: Season;
  seasonDay: number;
  seasonCrisis: SeasonCrisis | null;
  day: number;
  prices: Record<string, number>;
  sellMult: number;
  competitorPressure: number;
}): SalesResult {
  const {
    batches, stats, demandedByProduct, upgrades, satisfaction, season, seasonDay,
    seasonCrisis, day, prices, sellMult, competitorPressure,
  } = args;

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

  return {
    batches: newBatches,
    stats: newStats,
    demandedByProduct: newDemandedByProduct,
    revenue,
    spoiledValue,
    unitsSold,
    unitsFresh,
    bestseller: best,
    demandedTotal,
    missedByProduct,
  };
}

export const useEconomy = create<EconomyState>()(
  persist(
    (set, get) => ({
      ...freshState(),

      startGame: (id, name, playMode = "endlos", missionId) => {
        const missionDef = missionId ? MISSIONS.find((m) => m.id === missionId) : null;
        const budget = missionDef
          ? missionDef.budget
          : (MODES.find((m) => m.id === id)?.budget ?? 10000);
        const firm = name?.trim() || "Mein Supermarkt";
        const offers = seedOffers();
        set({
          ...freshState(),
          started: true,
          mode: id,
          firmName: firm,
          cash: budget,
          offers,
          supplierMods: rollSupplierMods(),
          trendProductId: rollTrendProduct("Frühling", 1),
          seasonEvent: makeSeasonEvent(1, "Frühling"),
          playMode: playMode ?? "endlos",
          missionId: missionId ?? null,
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
        set(freshState());
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
        const { cash, batches, offers, day, upgrades, supplierMods, supplierOutage, contracts, pendingOrders, specialization } = get();
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
        const cap = capacityOf(upgrades, specialization);
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

        const {
          batches: newBatches, stats: newStats, demandedByProduct: newDemandedByProduct,
          revenue, spoiledValue, unitsSold, unitsFresh, bestseller: best, demandedTotal, missedByProduct,
        } = runSalesAndSpoilage({
          batches, stats, demandedByProduct, upgrades, satisfaction, season, seasonDay,
          seasonCrisis, day, prices, sellMult, competitorPressure,
        });

        // Angebote, Saison-/Wellen-/Jahreswechsel (+ Mails), Krisen, Lieferanten-
        // preise, Trend-Produkt und -Ausfälle für morgen auswürfeln.
        const {
          offers: newOffers, nextCal, seasonEvent: notifiedEvent, seasonCrisis: newSeasonCrisis,
          supplierMods: newSupplierMods, trendProductId: newTrend, supplierOutage: newOutage,
        } = rotateDailyMarket({
          day, season, seasonDay, offers, seasonEvent, seasonCrisis, supplierMods, supplierOutage,
        });

        // --- Ziel-Fortschritt für heute aktualisieren --------------------
        const goalDailyBonus = useGoal.getState().updateProgress({
          day,
          revenue: +revenue.toFixed(2),
          spoiledValue: +spoiledValue.toFixed(2),
          unitsFresh,
          unitsSold,
          demandedTotal,
        });

        // Tageslohn, Filial-Passiveinkommen und Kredit-Zinsen verrechnen.
        const { branchIncome, cashAfter } = settleDayFinance({
          cash, revenue, goalDailyBonus, branches, lastRevenue,
          creditUsed: get().creditUsed, upgrades, nextDay: day + 1,
        });

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
          personalBonus: (upgrades.personal ?? 0) * 3 + specSatBonus(specialization) + themeSatBonus(get().storeTheme),
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

      takeCredit: (amount: number) => {
        const { cash, branches, creditUsed } = get();
        const limit = creditLimit(branches);
        const available = limit - creditUsed;
        if (amount <= 0) return { ok: false, msg: "Ungültiger Betrag." };
        if (amount > available) return { ok: false, msg: `Nur noch ${euro(available)} verfügbar (Limit: ${euro(limit)}).` };
        set({ creditUsed: +(creditUsed + amount).toFixed(2), cash: +(cash + amount).toFixed(2) });
        return { ok: true };
      },

      repayCredit: (amount: number) => {
        const { cash, creditUsed } = get();
        if (amount <= 0) return { ok: false, msg: "Ungültiger Betrag." };
        if (amount > creditUsed) return { ok: false, msg: `Du schuldest nur ${euro(creditUsed)}.` };
        if (amount > cash) return { ok: false, msg: `Nicht genug Geld (${euro(cash)} verfügbar).` };
        set({ creditUsed: +(creditUsed - amount).toFixed(2), cash: +(cash - amount).toFixed(2) });
        return { ok: true };
      },

      setStoreTheme: (theme: StoreTheme) => {
        const { cash, storeTheme } = get();
        if (theme === storeTheme) return { ok: false, msg: "Dieses Design ist bereits aktiv." };
        if (theme !== "standard" && cash < THEME_SWITCH_COST)
          return { ok: false, msg: `Umbau kostet ${euro(THEME_SWITCH_COST)} — nicht genug Geld.` };
        const cost = theme === "standard" ? 0 : THEME_SWITCH_COST;
        set({ storeTheme: theme, cash: +(cash - cost).toFixed(2) });
        EventBus.emit(Events.ThemeChange, theme);
        return { ok: true };
      },
    }),
    {
      name: "retail-tycoon-save",
      version: 12,
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
          creditUsed: (s.creditUsed as number) ?? 0,
          storeTheme: (s.storeTheme as StoreTheme) ?? "standard",
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
        creditUsed: s.creditUsed,
        storeTheme: s.storeTheme,
        recap: s.recap,
      }),
    },
  ),
);
