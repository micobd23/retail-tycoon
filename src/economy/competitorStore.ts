import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Konkurrenten — 3 Mitbewerber laufen passiv neben dem Spieler.
// Keine direkte Interaktion (kommt später); nur Marktdruck + Browser-Berichte.
// ---------------------------------------------------------------------------

export interface CompetitorNews {
  day: number;
  text: string;
  competitorId: string;
}

export interface Competitor {
  id: string;
  name: string;
  type: "discounter" | "bio";
  strategy: "expansion" | "volume" | "quality";
  strength: number; // 0–100
}

// Vorgeschriebene Nachrichten je Konkurrent (erscheinen ab diesem Tag)
const SCRIPTED_NEWS: CompetitorNews[] = [
  // Sparfuchs — Expansion
  { day: 2,  competitorId: "sparfuchs", text: "Sparfuchs startet aggressiv mit Niedrigstpreisen und ersten Sonderangeboten." },
  { day: 6,  competitorId: "sparfuchs", text: "Sparfuchs erweitert das Getränke-Sortiment auf über 80 Artikel." },
  { day: 11, competitorId: "sparfuchs", text: "Sparfuchs eröffnet eine zweite Kühltheke — Frischware rückt in den Fokus." },
  { day: 20, competitorId: "sparfuchs", text: "Sparfuchs kündigt Expansion in den Nachbarstadtteil an." },
  { day: 32, competitorId: "sparfuchs", text: "Sparfuchs Filiale II eröffnet. Der Wettbewerb verschärft sich spürbar." },

  // Preisland — Volume
  { day: 3,  competitorId: "preisland", text: "Preisland setzt auf eine Trockenwaren-Offensive mit breitem Sortiment." },
  { day: 9,  competitorId: "preisland", text: "Preisland erhöht Lagerkapazität — stabile Verfügbarkeit als Strategie." },
  { day: 17, competitorId: "preisland", text: "Preisland verzeichnet kontinuierliches Kundenwachstum ohne große Sprünge." },
  { day: 26, competitorId: "preisland", text: "Preisland weitet das Sortiment auf Frischware und Eigenmarken aus." },
  { day: 40, competitorId: "preisland", text: "Preisland meldet stabiles Umsatzwachstum — Beständigkeit zahlt sich aus." },

  // NaturPur — Quality
  { day: 4,  competitorId: "naturpur", text: "NaturPur eröffnet mit kleinem Bio-Sortiment — zunächst sehr überschaubar." },
  { day: 13, competitorId: "naturpur", text: "NaturPur gewinnt erste treue Stammkunden durch klare Qualitätsstrategie." },
  { day: 22, competitorId: "naturpur", text: "NaturPur führt Premium-Produktlinie mit regionalen Anbietern ein." },
  { day: 30, competitorId: "naturpur", text: "NaturPur erhält Auszeichnung für nachhaltige Handelspraktiken." },
  { day: 38, competitorId: "naturpur", text: "NaturPur: Kundenzufriedenheit übersteigt den Branchendurchschnitt deutlich." },
];

// Stärke-Wachstum je Strategie (deterministisch — kein Zufallsrauschen für Stabilität)
function computeStrength(strategy: Competitor["strategy"], day: number): number {
  switch (strategy) {
    case "expansion": return Math.min(78, day * 3.0);             // schnell, Plateau ~Tag 26
    case "volume":    return Math.min(68, day * 1.6);             // linear, langsam, hört nie auf
    case "quality":   return Math.min(72, Math.max(0, (day - 8) * 2.8)); // langsamer Start, dann zieht an
  }
}

const INITIAL_COMPETITORS: Competitor[] = [
  { id: "sparfuchs", name: "Sparfuchs",  type: "discounter", strategy: "expansion", strength: 0 },
  { id: "preisland", name: "Preisland",  type: "discounter", strategy: "volume",    strength: 0 },
  { id: "naturpur",  name: "NaturPur",   type: "bio",        strategy: "quality",   strength: 0 },
];

interface CompetitorState {
  competitors: Competitor[];
  visibleNews: CompetitorNews[];
  advance: (day: number) => void;
  marketPressure: () => number; // 0–0.12 Reduktion des Kundenstroms
  resetCompetitors: () => void;
}

export const useCompetitor = create<CompetitorState>()(
  persist(
    (set, get) => ({
      competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
      visibleNews: [],

      advance: (day: number) => {
        set((s) => {
          const competitors = s.competitors.map((c) => ({
            ...c,
            strength: computeStrength(c.strategy, day),
          }));
          const newNews = SCRIPTED_NEWS.filter(
            (n) =>
              n.day === day &&
              !s.visibleNews.find(
                (v) => v.day === n.day && v.competitorId === n.competitorId,
              ),
          );
          const visibleNews = [...newNews, ...s.visibleNews].slice(0, 30);
          return { competitors, visibleNews };
        });
      },

      marketPressure: () => {
        const { competitors } = get();
        const totalStrength = competitors.reduce((sum, c) => sum + c.strength, 0);
        // Max-Gesamtstärke: 78+68+72 = 218; max Druck 12 %
        return (totalStrength / 218) * 0.12;
      },

      resetCompetitors: () =>
        set({
          competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
          visibleNews: [],
        }),
    }),
    {
      name: "retail-tycoon-competitors",
      version: 1,
      migrate: () => ({
        competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
        visibleNews: [],
      }),
    },
  ),
);
