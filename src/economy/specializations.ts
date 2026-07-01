// ---------------------------------------------------------------------------
// Spezialisierungspfade — strategische Ausrichtung des Ladens (ab Filiale 1).
// Reine Daten + reine Funktionen (nur abhängig vom übergebenen Parameter,
// keine Store-Abhängigkeit).
// ---------------------------------------------------------------------------

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
