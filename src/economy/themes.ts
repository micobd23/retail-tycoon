// ---------------------------------------------------------------------------
// Ladengestaltung — kosmetisches Theme mit kleinem Nachfrage-/Zufriedenheits-
// Effekt. Reine Daten + reine Funktionen, keine Store-Abhängigkeit.
// ---------------------------------------------------------------------------

export type StoreTheme = "standard" | "budget" | "premium" | "family";

interface ThemeMeta {
  id: StoreTheme; emoji: string; name: string; tagline: string;
  perks: string[]; tradeoff: string; demandMult: number; satBonus: number; floorTint: number;
}

export const STORE_THEMES: ThemeMeta[] = [
  {
    id: "standard", emoji: "🏪", name: "Standard",
    tagline: "Dein Laden so, wie er ist.",
    perks: ["Keine Umbaukosten", "Ausgewogene Basis"],
    tradeoff: "Kein besonderer Vorteil.",
    demandMult: 1.0, satBonus: 0, floorTint: 0xffffff,
  },
  {
    id: "budget", emoji: "🏷️", name: "Schnäppchen-Markt",
    tagline: "Nackte Regale, volle Einkaufswagen.",
    perks: ["+8 % Kundenstrom", "Funktional & effizient"],
    tradeoff: "−5 Zufriedenheit — kahle Optik schreckt Qualitätskunden ab.",
    demandMult: 1.08, satBonus: -5, floorTint: 0xffe0b2,
  },
  {
    id: "premium", emoji: "🌿", name: "Bio-Boutique",
    tagline: "Wohliges Ambiente, treue Stammkunden.",
    perks: ["+10 Zufriedenheit/Tag", "Kunden zahlen gerne mehr"],
    tradeoff: "−6 % Kundenstrom — nicht jedermanns Geschmack.",
    demandMult: 0.94, satBonus: 10, floorTint: 0xe8f5e9,
  },
  {
    id: "family", emoji: "🛒", name: "Familien-Markt",
    tagline: "Bunt, freundlich, für jeden was dabei.",
    perks: ["+4 % Kundenstrom", "+4 Zufriedenheit/Tag"],
    tradeoff: "Umbaukosten ohne Ausreißer-Bonus.",
    demandMult: 1.04, satBonus: 4, floorTint: 0xe3f2fd,
  },
];

export const THEME_SWITCH_COST = 2000;

export function themeDemandMult(t: StoreTheme | null): number {
  return STORE_THEMES.find((m) => m.id === t)?.demandMult ?? 1.0;
}
export function themeSatBonus(t: StoreTheme | null): number {
  return STORE_THEMES.find((m) => m.id === t)?.satBonus ?? 0;
}
export function themeFloorTint(t: StoreTheme | null): number {
  return STORE_THEMES.find((m) => m.id === t)?.floorTint ?? 0xffffff;
}
