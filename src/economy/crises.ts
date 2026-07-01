// ---------------------------------------------------------------------------
// Krisen-System — einmal pro Saison (70 % Chance) kann eine Krise auftreten:
// Hitzewelle, Preiskampf oder Lieferskandal. Jede hat einen Trigger-Tag, eine
// Dauer und eine Ankündigungs-Mail einen Tag vorher.
// Nutzt mailStore (bewusst getrennt vom economyStore, keine zirkulären
// Importe) für die Ankündigung — kennt sonst keinen Store-Zustand.
// ---------------------------------------------------------------------------

import { CATALOG, SUPPLIERS, type Season } from "./catalog";
import { useMail } from "./mailStore";

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

export const CRISIS_DEMAND_PENALTY = 0.25; // preiskampf: −25 % Nachfrage für betroffene Produkte

export function rollCrisis(firstDayOfSeason: number, season: Season): SeasonCrisis {
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

export function sendCrisisAnnouncementMail(crisis: SeasonCrisis, day: number) {
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
