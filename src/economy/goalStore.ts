import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMail } from "./mailStore";
import { euro, dayToCalendar, type Season, type DayRecord } from "./catalog";

// ---------------------------------------------------------------------------
// Saisonziele — 3 optionale Bonus-Ziele pro Saison.
// Abschluss = Kapital-Bonus + Mail-Benachrichtigung.
// goalStore ist bewusst getrennt von economyStore (kein zirkulärer Import).
// economyStore ruft hier Methoden auf und wendet die zurückgegebenen Boni an.
// ---------------------------------------------------------------------------

export type GoalKind =
  | "revenue_day"       // X € an einem Tag
  | "revenue_season"    // X € Gesamtumsatz diese Saison
  | "satisfaction_end"  // Zufriedenheit ≥ X% am Saisonende
  | "no_spoilage_run"   // X Tage hintereinander ohne Verderb
  | "units_fresh"       // X Frischware-Stück diese Saison
  | "fill_rate_day";    // ≥ 95% Fill Rate an einem Tag

export interface Goal {
  id: string;
  kind: GoalKind;
  label: string;
  target: number;
  progress: number;
  done: boolean;
  reward: number; // EUR-Bonus bei Abschluss
}

export interface SeasonResult {
  season: Season;
  year: number;
  goalsCompleted: number;
  goalsTotal: number;
  seasonRevenue: number;
}

export interface YearEndData {
  year: number;
  totalRevenue: number;
  avgSatisfaction: number;
  goalsCompleted: number;
  goalsTotal: number;
  rating: "S" | "A" | "B" | "C" | "D";
  seasonResults: SeasonResult[];
  totalCashBonus: number;
}

export const GOAL_ICONS: Record<GoalKind, string> = {
  revenue_day: "💰",
  revenue_season: "📈",
  satisfaction_end: "🙂",
  no_spoilage_run: "✨",
  units_fresh: "🥗",
  fill_rate_day: "📦",
};

// Welche 3 Ziel-Typen es pro Saison gibt (thematisch passend).
const SEASON_KINDS: Record<Season, GoalKind[]> = {
  Frühling: ["revenue_day", "units_fresh", "no_spoilage_run"],
  Sommer:   ["revenue_day", "fill_rate_day", "revenue_season"],
  Herbst:   ["revenue_season", "no_spoilage_run", "satisfaction_end"],
  Winter:   ["revenue_day", "fill_rate_day", "satisfaction_end"],
};

const REWARDS: Record<GoalKind, number> = {
  revenue_day:      400,
  revenue_season:   600,
  satisfaction_end: 500,
  no_spoilage_run:  350,
  units_fresh:      350,
  fill_rate_day:    450,
};

function makeGoal(kind: GoalKind, season: Season, year: number): Goal {
  const y = Math.max(1, year);
  const scale = Math.pow(1.25, y - 1);

  let target: number;
  let label: string;

  switch (kind) {
    case "revenue_day": {
      const t = Math.round((350 * scale) / 50) * 50;
      target = t;
      label = `${euro(t)} Tagesumsatz`;
      break;
    }
    case "revenue_season": {
      const t = Math.round((2500 * scale) / 100) * 100;
      target = t;
      label = `${euro(t)} Saisonumsatz`;
      break;
    }
    case "no_spoilage_run": {
      const t = Math.min(6, 2 + y);
      target = t;
      label = `${t} Tage ohne Verderb`;
      break;
    }
    case "units_fresh": {
      const t = Math.round((100 * scale) / 10) * 10;
      target = t;
      label = `${t} Frischware-Stück`;
      break;
    }
    case "fill_rate_day":
      target = 0.95;
      label = "95%+ Fill Rate an einem Tag";
      break;
    case "satisfaction_end": {
      const t = Math.min(88, 76 + y * 2);
      target = t;
      label = `Saisonende ≥${t}% Zufriedenheit`;
      break;
    }
  }

  return {
    id: `${season}-${y}-${kind}`,
    kind,
    label,
    target,
    progress: 0,
    done: false,
    reward: REWARDS[kind],
  };
}

function computeRating(goalPct: number, avgSat: number): "S" | "A" | "B" | "C" | "D" {
  if (goalPct >= 0.9 && avgSat >= 85) return "S";
  if (goalPct >= 0.75 || (goalPct >= 0.5 && avgSat >= 80)) return "A";
  if (goalPct >= 0.5) return "B";
  if (goalPct >= 0.25 || avgSat >= 70) return "C";
  return "D";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface GoalState {
  goals: Goal[];
  currentSeason: Season | null;
  currentYear: number;
  seasonRevenue: number;       // kumulierter Umsatz dieser Saison
  unitsFreshSeason: number;    // kumulierte Frischware-Stück dieser Saison
  noSpoilageStreak: number;    // aufeinanderfolgende Tage ohne Verderb
  seasonResults: SeasonResult[];
  yearEndOpen: boolean;
  yearEndData: YearEndData | null;
  totalCashBonus: number; // Gesamt-Boni im bisherigen Spielverlauf

  // Wird zu Saisonbeginn aufgerufen — erzeugt die 3 Ziele für die neue Saison.
  generateGoals: (season: Season, year: number) => void;
  // Einmal pro Tag aus economyStore.advanceDay aufgerufen. Gibt Bonus zurück.
  updateProgress: (p: {
    day: number;
    revenue: number;
    spoiledValue: number;
    unitsFresh: number;
    unitsSold: number;
    demandedTotal: number;
  }) => number;
  // Am Saisonende: Zufriedenheits-Ziel prüfen, Saison in Historie speichern. Gibt Bonus zurück.
  finalizeSeasonGoals: (satisfaction: number, day: number) => number;
  // Jahresabschluss-Screen auslösen.
  triggerYearEnd: (history: DayRecord[]) => void;
  closeYearEnd: () => void;
  reset: () => void;
}

export const useGoal = create<GoalState>()(
  persist(
    (set, get) => ({
      goals: [],
      currentSeason: null,
      currentYear: 1,
      seasonRevenue: 0,
      unitsFreshSeason: 0,
      noSpoilageStreak: 0,
      seasonResults: [],
      yearEndOpen: false,
      yearEndData: null,
      totalCashBonus: 0,

      generateGoals: (season, year) => {
        set({
          goals: SEASON_KINDS[season].map((k) => makeGoal(k, season, year)),
          currentSeason: season,
          currentYear: year,
          seasonRevenue: 0,
          unitsFreshSeason: 0,
          noSpoilageStreak: 0,
        });
      },

      updateProgress: (p) => {
        const { goals, seasonRevenue, noSpoilageStreak, unitsFreshSeason, totalCashBonus } = get();
        if (!goals.length) return 0;

        const newSeasonRevenue = seasonRevenue + p.revenue;
        const newStreak = p.spoiledValue > 0 ? 0 : noSpoilageStreak + 1;
        const newUnitsFresh = unitsFreshSeason + p.unitsFresh;
        const fillRate = p.demandedTotal > 0 ? p.unitsSold / p.demandedTotal : 1;

        let cashBonus = 0;
        const newGoals = goals.map((g) => {
          if (g.done || g.kind === "satisfaction_end") return g;

          let progress = g.progress;
          let done = false;

          switch (g.kind) {
            case "revenue_day":
              progress = Math.max(g.progress, p.revenue);
              done = p.revenue >= g.target;
              break;
            case "revenue_season":
              progress = newSeasonRevenue;
              done = newSeasonRevenue >= g.target;
              break;
            case "no_spoilage_run":
              progress = newStreak;
              done = newStreak >= g.target;
              break;
            case "units_fresh":
              progress = newUnitsFresh;
              done = newUnitsFresh >= g.target;
              break;
            case "fill_rate_day":
              progress = Math.max(g.progress, fillRate);
              done = fillRate >= g.target;
              break;
          }

          if (done) {
            cashBonus += g.reward;
            const open = goals.filter((x) => !x.done && x.kind !== "satisfaction_end").length - 1;
            useMail.getState().receive({
              from: "Zentrale",
              subject: `🎯 Ziel erreicht: ${g.label}`,
              body:
                `Glückwunsch! Du hast das Saisonziel erfüllt:\n\n„${g.label}"\n\n` +
                `Bonus: ${euro(g.reward)} wurden deinem Konto gutgeschrieben.\n\n` +
                (open > 0 ? `Noch ${open} Ziel${open > 1 ? "e" : ""} offen — weiter so!` : "Alle tagesaktuellen Ziele erfüllt!"),
              day: p.day,
              kind: "info",
            });
          }

          return { ...g, progress, done };
        });

        set({
          goals: newGoals,
          seasonRevenue: newSeasonRevenue,
          noSpoilageStreak: newStreak,
          unitsFreshSeason: newUnitsFresh,
          totalCashBonus: totalCashBonus + cashBonus,
        });
        return cashBonus;
      },

      finalizeSeasonGoals: (satisfaction, day) => {
        const { goals, currentSeason, currentYear, seasonRevenue, seasonResults, totalCashBonus } = get();
        if (!currentSeason) return 0;

        let cashBonus = 0;
        const finalGoals = goals.map((g) => {
          if (g.kind !== "satisfaction_end" || g.done) return g;
          const done = satisfaction >= g.target;
          if (done) {
            cashBonus += g.reward;
            useMail.getState().receive({
              from: "Zentrale",
              subject: `🎯 Saisonziel erreicht: ${g.label}`,
              body:
                `Du beendest die Saison mit ${satisfaction}% Zufriedenheit!\n\n` +
                `Ziel erfüllt: „${g.label}"\n\n` +
                `Bonus: ${euro(g.reward)} wurden deinem Konto gutgeschrieben.`,
              day,
              kind: "info",
            });
          }
          return { ...g, done, progress: satisfaction };
        });

        const completed = finalGoals.filter((g) => g.done).length;
        const result: SeasonResult = {
          season: currentSeason,
          year: currentYear,
          goalsCompleted: completed,
          goalsTotal: finalGoals.length,
          seasonRevenue,
        };

        set({
          goals: finalGoals,
          seasonResults: [...seasonResults, result],
          totalCashBonus: totalCashBonus + cashBonus,
        });
        return cashBonus;
      },

      triggerYearEnd: (history) => {
        const { seasonResults, totalCashBonus } = get();

        const totalRevenue = history.reduce((s, r) => s + r.revenue, 0);
        const avgSatisfaction =
          history.length > 0
            ? Math.round(history.reduce((s, r) => s + r.satisfaction, 0) / history.length)
            : 0;

        const goalsCompleted = seasonResults.reduce((s, r) => s + r.goalsCompleted, 0);
        const goalsTotal = seasonResults.reduce((s, r) => s + r.goalsTotal, 0);
        const goalPct = goalsTotal > 0 ? goalsCompleted / goalsTotal : 0;

        const year =
          history.length > 0
            ? dayToCalendar(history[history.length - 1].day).year
            : 1;

        set({
          yearEndOpen: true,
          yearEndData: {
            year,
            totalRevenue,
            avgSatisfaction,
            goalsCompleted,
            goalsTotal,
            rating: computeRating(goalPct, avgSatisfaction),
            seasonResults: [...seasonResults],
            totalCashBonus,
          },
        });
      },

      closeYearEnd: () =>
        set({ yearEndOpen: false, yearEndData: null, seasonResults: [] }),

      reset: () =>
        set({
          goals: [],
          currentSeason: null,
          currentYear: 1,
          seasonRevenue: 0,
          unitsFreshSeason: 0,
          noSpoilageStreak: 0,
          seasonResults: [],
          yearEndOpen: false,
          yearEndData: null,
          totalCashBonus: 0,
        }),
    }),
    { name: "retail-tycoon-goals", version: 1 },
  ),
);
