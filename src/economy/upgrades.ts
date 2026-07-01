// ---------------------------------------------------------------------------
// Lagerplatz & Ausbau-Stufen — zwei getrennte Flächen (Lager/Trockenware,
// Verkaufsfläche/Frischware), Kundenstrom, Mitarbeiter-Lohn, Haltbarkeit.
// Reine Daten + reine Funktionen: alles hängt nur von den übergebenen
// Parametern ab, nicht vom globalen Store — deshalb bewusst ohne Import von
// "./economyStore" (das wäre ein zirkulärer Import).
// ---------------------------------------------------------------------------

import { CATALOG, stockOf, type Batch, type Product } from "./catalog";
import { specCapMult, type Specialization } from "./specializations";

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

export const emptyUpgrades = (): Upgrades => ({
  lager: 0, flaeche: 0, kassen: 0,
  kuehltheke: 0, marketing: 0, personal: 0, lieferwagen: 0, eigenmarke: 0,
});

// Basis-Kapazität (Stufe 0) + Zuwachs je Stufe.
const BASE_CAP = { trocken: 10000, frisch: 2500 };
const CAP_STEP = { trocken: 4000, frisch: 1000 };

// Aktuelle Kapazität beider Flächen aus den Ausbaustufen.
// Vollsortimenter-Spezialisierung gibt +30 % auf beide Flächen — deshalb
// nimmt die Funktion `spec` explizit als Parameter entgegen (statt sich den
// Wert heimlich aus dem globalen Store zu holen).
export function capacityOf(u?: Upgrades, spec?: Specialization | null): { trocken: number; frisch: number } {
  const m = specCapMult(spec ?? null);
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
