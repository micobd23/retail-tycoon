import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CATALOG,
  unitPrice,
  supplierBaseEk,
  cheapestSupplier,
  SUPPLIERS,
  euro,
  dayToCalendar,
  type Product,
  type Season,
} from "./catalog";
import { useMail } from "./mailStore";

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

// Start-Angebote: 2 Stück.
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
  batches: Record<string, Batch[]>; // Chargen je Produkt-ID
  stats: Record<string, ProductStat>; // lebenslange Statistik je Produkt
  offers: Record<string, Offer>; // aktive befristete Angebote je Produkt-ID
  upgrades: Upgrades; // gekaufte Ausbaustufen
  lastRevenue: number; // Umsatz am zuletzt simulierten Tag
  lastSpoiledValue: number; // Verlust durch Verderb am letzten Tag (EK-Wert)
  satisfaction: number; // Kundenzufriedenheit (0–100)
  lastMissed: Record<string, number>; // verpasste Nachfrage je Produkt (Vortag)
  recap: DayRecap | null; // Daten des letzten Tagesabschlusses
  recapOpen: boolean; // wird der Vollbild-Recap gerade angezeigt?

  startGame: (id: GameModeId) => void;
  resetGame: () => void;
  buy: (
    productId: string,
    qty: number,
    supplierId: string,
  ) => { ok: boolean; msg?: string };
  upgrade: (track: UpgradeTrack) => { ok: boolean; msg?: string };
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
  lager: number; // Stufen Lager-Ausbau (Trockenware-Kapazität)
  flaeche: number; // Stufen Verkaufsflächen-Ausbau (Frischware-Kapazität)
  kassen: number; // Stufen Kassen-Ausbau (Kundenstrom = mehr Verkäufe/Tag)
}

const emptyUpgrades = (): Upgrades => ({ lager: 0, flaeche: 0, kassen: 0 });

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

// Kundenstrom-Multiplikator: jede Kassen-Stufe bringt +15 % Verkäufe/Tag.
export function kundenstrom(u?: Upgrades): number {
  return 1 + (u?.kassen ?? 0) * 0.15;
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

// Nachfrage/Tag eines Produkts (Drehzahl × Kundenstrom × Zufriedenheit × Saison).
// Saison-Specials außerhalb ihrer Saison haben Nachfrage 0.
// `sat` + `season` optional — werden dann aus dem aktuellen Zustand abgeleitet.
export function effectiveSales(p: Product, u?: Upgrades, sat?: number, season?: Season): number {
  const sz = season ?? dayToCalendar(useEconomy.getState().day).season;
  if (p.onlyInSeason && p.onlyInSeason !== sz) return 0;
  const s = sat ?? useEconomy.getState().satisfaction;
  return Math.round(p.salesPerDay * kundenstrom(u) * satisfactionMultiplier(s) * seasonalFactor(p, sz));
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
  const { season } = dayToCalendar(day);
  let revenue = 0;
  let soldTrocken = 0;
  let soldFrisch = 0;
  for (const p of CATALOG) {
    const stock = stockOf(batches, p.id);
    const sell = Math.min(effectiveSales(p, upgrades, satisfaction, season), stock);
    revenue += sell * p.vk;
    if (p.storage === "frisch") soldFrisch += sell;
    else soldTrocken += sell;
  }
  return { revenue: +revenue.toFixed(2), soldTrocken, soldFrisch };
}

// --- Ausbau-Linien (Meta + Kostenkurve) ----------------------------------
export type UpgradeTrack = "lager" | "flaeche" | "kassen";

export const UPGRADE_META: Record<
  UpgradeTrack,
  { name: string; icon: string; desc: string; baseCost: number; growth: number }
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
}): { satisfaction: number; voices: CustomerVoice[] } {
  const { prevSat, demanded, served, missedByProduct, upgrades } = args;
  const serviceRate = demanded > 0 ? served / demanded : 1;

  // Kassen-Komfort: Andrang vs. Kassenzahl (mild gewichtet).
  const kassen = 1 + upgrades.kassen;
  const load = demanded / (kassen * 300);
  const queueOk = load <= 1 ? 1 : Math.max(0, 1 - (load - 1) * 0.6);

  const target = 100 * (0.85 * serviceRate + 0.15 * queueOk);
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

      startGame: (id) => {
        const mode = MODES.find((m) => m.id === id);
        if (!mode) return;
        const offers = seedOffers();
        set({
          started: true,
          mode: id,
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
        });

        // Postfach frisch aufsetzen: Willkommensmail + die Start-Angebote.
        const mail = useMail.getState();
        mail.clearAll();
        mail.receive({
          from: "Zentrale",
          subject: "Willkommen als Einkaufsleiter!",
          body:
            `Herzlich willkommen!\n\nDein Startkapital beträgt ${euro(mode.budget)}. ` +
            `Deine Aufgabe: das Lager klug füllen und Gewinn machen — Marge × Drehzahl.\n\n` +
            `Achte auf Lagerplatz (Lager für Trockenware, Verkaufsfläche für Frischware) ` +
            `und auf die Haltbarkeit der Frischware. Viel Erfolg!`,
          day: 1,
          kind: "info",
        });
        for (const [pid, o] of Object.entries(offers)) offerMail(pid, o, 1);
      },

      resetGame: () => {
        useMail.getState().clearAll();
        set({
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
        });
      },

      buy: (productId, qty, supplierId) => {
        if (qty <= 0) return { ok: false, msg: "Menge muss größer als 0 sein." };
        const p = byId(productId);
        if (!p) return { ok: false, msg: "Produkt unbekannt." };
        const { cash, batches, offers, day, upgrades } = get();
        // Effektiver EK = Lieferantenpreis − ggf. Angebot, dann Mengenrabatt.
        const offerRabatt = offers[productId]?.rabatt ?? 0;
        const effBase = supplierBaseEk(p, supplierId) * (1 - offerRabatt);
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
        const cost = upgradeCost(track, level);
        if (cost > cash) return { ok: false, msg: "Nicht genug Geld für den Ausbau." };
        set({
          cash: +(cash - cost).toFixed(2),
          upgrades: { ...upgrades, [track]: level + 1 },
        });
        return { ok: true };
      },

      advanceDay: () => {
        const { batches, stats, cash, day, offers, upgrades, lastRevenue, satisfaction } = get();
        const { season } = dayToCalendar(day);
        const newBatches: Record<string, Batch[]> = {};
        const newStats: Record<string, ProductStat> = { ...stats };
        let revenue = 0;
        let spoiledValue = 0;
        let unitsSold = 0; // verkaufte Stück gesamt (für den Recap)
        let best: { name: string; qty: number } | null = null; // Tages-Bestseller
        let demandedTotal = 0; // gesamte Nachfrage (auch unbediente)
        const missedByProduct: Record<string, number> = {}; // verpasst je Produkt

        for (const p of CATALOG) {
          let list = (batches[p.id] ?? []).map((b) => ({ ...b }));
          const stat = { ...(newStats[p.id] ?? emptyStat()) };

          // 1) Verkauf nach Nachfrage (Drehzahl × Kundenstrom × Zufriedenheit × Saison), FIFO.
          // Saison-Specials außerhalb ihrer Saison haben Nachfrage 0.
          let soldThis = 0; // an diesem Tag verkaufte Stück dieses Produkts
          const demand = effectiveSales(p, upgrades, satisfaction, season);
          const stock = list.reduce((s, b) => s + b.qty, 0);
          demandedTotal += demand;
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
          if (soldThis > 0 && (!best || soldThis > best.qty))
            best = { name: p.name, qty: soldThis };
          list = list.filter((b) => b.qty > 0);

          // 2) Chargen altern.
          for (const b of list) b.age += 1;

          // 3) Verderb: nur Frischware, deren Alter die Haltbarkeit erreicht.
          if (p.storage === "frisch" && p.shelfLifeDays) {
            const survivors: Batch[] = [];
            for (const b of list) {
              if (b.age >= p.shelfLifeDays) {
                stat.spoiled += b.qty;
                spoiledValue += b.qty * p.ek; // Verlust = bezahlter EK
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

        // Saison-Wechsel: wenn der nächste Tag eine neue Saison beginnt, Mail schicken.
        const nextCal = dayToCalendar(day + 1);
        if (nextCal.season !== season) {
          const SEASON_EMOJI: Record<string, string> = {
            Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
          };
          const specials = CATALOG.filter((p) => p.onlyInSeason === nextCal.season);
          const specialsText = specials.length
            ? `\nNeu verfügbar: ${specials.map((p) => p.name).join(", ")}.`
            : "";
          useMail.getState().receive({
            from: "Zentrale",
            subject: `${SEASON_EMOJI[nextCal.season]} ${nextCal.season} beginnt — Q${nextCal.quarter}`,
            body:
              `Ab morgen (Tag ${day + 1}) beginnt ${nextCal.season}!` +
              `\n\nDas Kaufverhalten deiner Kunden ändert sich — prüfe dein Sortiment und passe deine Bestellmengen an.${specialsText}` +
              `\n\nViel Erfolg im ${nextCal.season}!`,
            day: day + 1,
            kind: "info",
          });
        }

        // Jahreswechsel
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

        // Zufriedenheit + Kundenstimmen aus dem Tag ableiten.
        const missedUnits = Object.values(missedByProduct).reduce((s, n) => s + n, 0);
        const { satisfaction: newSat, voices } = computeSatisfaction({
          prevSat: satisfaction,
          demanded: demandedTotal,
          served: unitsSold,
          missedByProduct,
          upgrades,
        });

        set({
          batches: newBatches,
          stats: newStats,
          offers: newOffers,
          cash: +(cash + revenue).toFixed(2),
          day: day + 1,
          lastRevenue: +revenue.toFixed(2),
          lastSpoiledValue: +spoiledValue.toFixed(2),
          satisfaction: newSat,
          lastMissed: missedByProduct,
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
      version: 4,
      // Fehlende Felder mit Defaults befüllen statt den Stand zu löschen.
      // So überleben bestehende Spielstände jeden Modell-Update.
      migrate: (raw) => {
        const s = (raw ?? {}) as Record<string, unknown>;
        return {
          started: (s.started as boolean) ?? false,
          mode: (s.mode as GameModeId | null) ?? null,
          cash: (s.cash as number) ?? 0,
          day: (s.day as number) ?? 1,
          batches: (s.batches as Record<string, Batch[]>) ?? {},
          stats: (s.stats as Record<string, ProductStat>) ?? {},
          offers: (s.offers as Record<string, Offer>) ?? {},
          upgrades: (s.upgrades as Upgrades) ?? emptyUpgrades(),
          lastRevenue: (s.lastRevenue as number) ?? 0,
          lastSpoiledValue: (s.lastSpoiledValue as number) ?? 0,
          satisfaction: (s.satisfaction as number) ?? 80,
          lastMissed: (s.lastMissed as Record<string, number>) ?? {},
          recap: null,
          recapOpen: false,
        };
      },
      partialize: (s) => ({
        started: s.started,
        mode: s.mode,
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
        recap: s.recap,
      }),
    },
  ),
);
