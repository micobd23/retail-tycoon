// ---------------------------------------------------------------------------
// Tägliche Markt-Rotation — alles, was sich zwischen zwei Tagen "im
// Hintergrund" ändert: Angebote altern/entstehen, Saison-/Wellen-/Jahres-
// wechsel (inkl. Mails), Saison-Event-Vorankündigung, Krisen würfeln/
// ankündigen, Lieferantenpreise, Trend-Produkt, Lieferanten-Ausfälle.
// Verkauf/Verderb (economyStore.ts, braucht effectiveSales) und Finanzen
// (finance.ts) sind bewusst getrennt.
// ---------------------------------------------------------------------------

import {
  CATALOG, SUPPLIERS, dayToCalendar, currentSeasonWave, cheapestSupplier,
  type Product, type Season,
} from "./catalog";
import { useMail } from "./mailStore";
import { rollCrisis, sendCrisisAnnouncementMail, type SeasonCrisis } from "./crises";

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

const byId = (id: string): Product => CATALOG.find((p) => p.id === id) as Product;

// Erzeugt ein Angebot für ein zufälliges Produkt (das noch keins hat).
function rollOffer(active: Record<string, Offer>): [string, Offer] | null {
  const frei = CATALOG.filter((p) => !active[p.id]);
  if (!frei.length) return null;
  const p = frei[Math.floor(Math.random() * frei.length)];
  const rabatt = RABATTE[Math.floor(Math.random() * RABATTE.length)];
  const daysLeft = 3 + Math.floor(Math.random() * 4); // 3–6 Tage
  return [p.id, { rabatt, daysLeft }];
}

// Mail-Text für ein neues Lieferanten-Angebot.
export function offerMail(productId: string, o: Offer, day: number) {
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

// --- Start-Angebote: 2 Stück.
export function seedOffers(): Record<string, Offer> {
  const active: Record<string, Offer> = {};
  for (let i = 0; i < 2; i++) {
    const o = rollOffer(active);
    if (o) active[o[0]] = o[1];
  }
  return active;
}

// --- Lieferantenpreise -------------------------------------------------------
// Alle 3 Tage ändert sich der Preis jedes Lieferanten um ±0–15% (in 5%-Schritten).
export function rollSupplierMods(): Record<string, number> {
  const steps = [-0.15, -0.10, -0.05, -0.05, 0, 0, 0.05, 0.05, 0.10, 0.15];
  const mods: Record<string, number> = {};
  for (const s of SUPPLIERS) {
    mods[s.id] = 1 + steps[Math.floor(Math.random() * steps.length)];
  }
  return mods;
}

// --- Trend-Produkt -----------------------------------------------------------
// Jeden Tag ein zufälliges verfügbares Produkt mit +30% Nachfrage.
export function rollTrendProduct(season: Season, seasonDay: number): string {
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
export function makeSeasonEvent(firstDayOfSeason: number, season: Season): SeasonEvent {
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

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

export interface DailyMarketRotation {
  offers: Record<string, Offer>;
  nextCal: ReturnType<typeof dayToCalendar>;
  seasonEvent: SeasonEvent | null;
  seasonCrisis: SeasonCrisis | null;
  supplierMods: Record<string, number>;
  trendProductId: string;
  supplierOutage: Record<string, number>;
}

// Rollt alles, was sich "über Nacht" (von `day` auf `day + 1`) ändert — inkl.
// aller Ankündigungs-Mails. Reine Berechnung + Mail-Versand, keine
// Store-Mutation (der Aufrufer übernimmt das Ergebnis per `set()`).
export function rotateDailyMarket(args: {
  day: number;
  season: Season;
  seasonDay: number;
  offers: Record<string, Offer>;
  seasonEvent: SeasonEvent | null;
  seasonCrisis: SeasonCrisis | null;
  supplierMods: Record<string, number>;
  supplierOutage: Record<string, number>;
}): DailyMarketRotation {
  const { day, season, seasonDay, offers, seasonEvent, seasonCrisis, supplierMods, supplierOutage } = args;

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

  return {
    offers: newOffers,
    nextCal,
    seasonEvent: notifiedEvent,
    seasonCrisis: newSeasonCrisis,
    supplierMods: newSupplierMods,
    trendProductId: newTrend,
    supplierOutage: newOutage,
  };
}
