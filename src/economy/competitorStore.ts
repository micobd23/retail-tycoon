import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Konkurrenten — 3 Mitbewerber laufen passiv neben dem Spieler.
// Keine direkte Interaktion (kommt später); Marktdruck + Browser-Berichte.
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

// Rückgabe von checkReaction — economyStore sendet die Mail damit
export interface ReactionResult {
  competitor: Competitor;
  newsText: string;
  mailSubject: string;
  mailBody: string;
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

// Reaktions-Texte je Konkurrent (wenn Spieler gut läuft)
const REACTION_TEXT: Record<string, { news: string; subject: string; body: string }> = {
  sparfuchs: {
    news: "Sparfuchs bemerkt euren Erfolg und verschärft die Preispolitik — ein direkter Angriff.",
    subject: "⚔️ Sparfuchs reagiert auf eure Stärke",
    body:
      "Eure starken Umsätze sind nicht unbemerkt geblieben.\n\n" +
      "Sparfuchs hat reagiert: aggressivere Preise, mehr Sonderangebote, höherer Druck auf eure Kundschaft.\n\n" +
      "Behalte die Konkurrenz im Auge — und bleib stark!",
  },
  preisland: {
    news: "Preisland weitet Sortiment aus — als direkte Reaktion auf eure Marktgewinne.",
    subject: "⚔️ Preisland legt nach — inspiriert von euch",
    body:
      "Preisland hat eure Zahlen gesehen und reagiert.\n\n" +
      "Das Sortiment wird ausgeweitet, mehr Kapazität aufgebaut — Preisland will euren Erfolg aufholen.\n\n" +
      "Stetiger Druck, aber du hast den Vorsprung. Nutze ihn!",
  },
  naturpur: {
    news: "NaturPur verstärkt Marketing gezielt bei Bio-Kunden — als Antwort auf eure Erfolge.",
    subject: "⚔️ NaturPur reagiert mit Qualitätsoffensive",
    body:
      "NaturPur hat eure Kundenzufriedenheit registriert und zieht nach.\n\n" +
      "Verstärktes Bio-Marketing, neue Premium-Kooperationen — NaturPur kämpft um die Qualitätskunden.\n\n" +
      "Gerade bei Frischware lohnt es sich, dein Niveau zu halten!",
  },
};

// Stärke-Wachstum je Strategie (deterministisch — kein Zufallsrauschen für Stabilität)
function computeStrength(strategy: Competitor["strategy"], day: number): number {
  switch (strategy) {
    case "expansion": return Math.min(78, day * 3.0);
    case "volume":    return Math.min(68, day * 1.6);
    case "quality":   return Math.min(72, Math.max(0, (day - 8) * 2.8));
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
  lastReactionDay: number; // verhindert zu häufige Reaktionen
  advance: (day: number) => void;
  checkReaction: (revenue: number, satisfaction: number, day: number) => ReactionResult | null;
  marketPressure: () => number; // 0–0.12 Reduktion des Kundenstroms
  playerStrength: (lastRevenue: number) => number; // für Marktanteil-Berechnung
  marketShares: (lastRevenue: number) => MarketShare[];
  resetCompetitors: () => void;
}

export interface MarketShare {
  id: string;
  name: string;
  share: number; // 0–1
  isPlayer: boolean;
}

export const useCompetitor = create<CompetitorState>()(
  persist(
    (set, get) => ({
      competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
      visibleNews: [],
      lastReactionDay: 0,

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

      checkReaction: (revenue: number, satisfaction: number, day: number) => {
        const { competitors, lastReactionDay } = get();
        // Bedingung: guter Spieler, Konkurrenz hat genug Stärke, nicht zu früh nach letzter Reaktion
        const cooldown = day - lastReactionDay >= 10;
        const playerGood = revenue > 800 && satisfaction >= 78;
        const candidates = competitors.filter((c) => c.strength >= 15);
        if (!cooldown || !playerGood || candidates.length === 0) return null;

        // Reaktion: der stärkste Konkurrent reagiert zuerst
        const reactor = [...candidates].sort((a, b) => b.strength - a.strength)[0];
        const texts = REACTION_TEXT[reactor.id];
        if (!texts) return null;

        // Stärke-Boost: +12 über das normale Wachstum (bleibt bis zum nächsten advance überschrieben)
        // Wir speichern einen einmaligen Reaktions-Bonus im news-Feed als Marker
        const reactionNews: CompetitorNews = {
          day,
          text: texts.news,
          competitorId: reactor.id,
        };
        set((s) => ({
          lastReactionDay: day,
          competitors: s.competitors.map((c) =>
            c.id === reactor.id
              ? { ...c, strength: Math.min(100, c.strength + 12) }
              : c,
          ),
          visibleNews: [reactionNews, ...s.visibleNews].slice(0, 30),
        }));

        return {
          competitor: reactor,
          newsText: texts.news,
          mailSubject: texts.subject,
          mailBody: texts.body,
        };
      },

      marketPressure: () => {
        const { competitors } = get();
        const totalStrength = competitors.reduce((sum, c) => sum + c.strength, 0);
        // Max-Gesamtstärke: 78+68+72 = 218; max Druck 12 %
        return (totalStrength / 218) * 0.12;
      },

      playerStrength: (lastRevenue: number) => {
        // ~600 €/Tag = solider Mittelspieler → Stärke 50
        return Math.min(100, Math.max(5, (lastRevenue / 600) * 50));
      },

      marketShares: (lastRevenue: number) => {
        const { competitors } = get();
        const playerStr = Math.min(100, Math.max(5, (lastRevenue / 600) * 50));
        const entries = [
          { id: "player", name: "Du", strength: playerStr, isPlayer: true },
          ...competitors.map((c) => ({ id: c.id, name: c.name, strength: c.strength, isPlayer: false })),
        ];
        const total = entries.reduce((s, e) => s + e.strength, 0) || 1;
        return entries.map((e) => ({
          id: e.id,
          name: e.name,
          share: e.strength / total,
          isPlayer: e.isPlayer,
        }));
      },

      resetCompetitors: () =>
        set({
          competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
          visibleNews: [],
          lastReactionDay: 0,
        }),
    }),
    {
      name: "retail-tycoon-competitors",
      version: 2,
      migrate: () => ({
        competitors: INITIAL_COMPETITORS.map((c) => ({ ...c })),
        visibleNews: [],
        lastReactionDay: 0,
      }),
    },
  ),
);
