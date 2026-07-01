// ---------------------------------------------------------------------------
// Spielmodi & Missionen — Kampagne (feste Ziele) vs. Endlos (freies Spiel).
// Reine Daten/Typen, keine Store-Abhängigkeit.
// ---------------------------------------------------------------------------

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

export type PlayMode = "kampagne" | "endlos";

export type WinConditionDef =
  | { type: "year_revenue"; year: number; target: number }
  | { type: "branches"; count: number }
  | { type: "survive_seasons"; count: number; minSat: number }
  | { type: "empire"; branches: number; yearRevenue: number };

export interface MissionDef {
  id: string;
  emoji: string;
  title: string;
  flavor: string;
  desc: string;
  budget: number;
  winCondition: WinConditionDef;
}

export const MISSIONS: MissionDef[] = [
  {
    id: "mission1",
    emoji: "🌱",
    title: "Der erste Laden",
    flavor: "Du hast einen kleinen Supermarkt geerbt. Beweise, dass du das Zeug zum Händler hast.",
    desc: "50.000 € Gesamtumsatz im ersten Jahr erreichen.",
    budget: 10000,
    winCondition: { type: "year_revenue", year: 1, target: 50000 },
  },
  {
    id: "mission2",
    emoji: "🏬",
    title: "Die Expansion",
    flavor: "Dein Stammladen läuft — jetzt baust du die Kette aus.",
    desc: "3 Filialen eröffnen.",
    budget: 8000,
    winCondition: { type: "branches", count: 3 },
  },
  {
    id: "mission3",
    emoji: "⚡",
    title: "Krisenfest",
    flavor: "Der Markt ist turbulent. Zeig, dass dein Laden auch schwere Zeiten übersteht.",
    desc: "3 Saisonen mit ≥ 75 % Kundenzufriedenheit am Ende überstehen.",
    budget: 5000,
    winCondition: { type: "survive_seasons", count: 3, minSat: 75 },
  },
  {
    id: "mission4",
    emoji: "👑",
    title: "Das Imperium",
    flavor: "Du bist bereit für die große Liga. Baue ein wahres Supermarkt-Imperium.",
    desc: "10 Filialen UND 500.000 € Gesamtumsatz.",
    budget: 15000,
    winCondition: { type: "empire", branches: 10, yearRevenue: 500000 },
  },
];
