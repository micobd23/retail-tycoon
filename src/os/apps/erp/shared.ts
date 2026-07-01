// ---------------------------------------------------------------------------
// Gemeinsame Konstanten/Helfer für alle ERP-Reiter (Einkauf, Preise,
// Statistik, Ausbau, Strategie, Design, Ziele).
// ---------------------------------------------------------------------------

import { effectiveSales, effectiveShelfLife, type Upgrades } from "../../../economy/economyStore";
import type { Category, Product } from "../../../economy/catalog";

export const DEFAULT_QTY = 100;

// Reihenfolge der Kategorien in der Anzeige.
export const CATEGORIES: Category[] = [
  "Getränke",
  "Grundnahrung",
  "Drogerie",
  "Süßwaren",
  "Frische",
  "Saisonales",
];

export const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

// Filter: "alle" oder eine einzelne Kategorie.
export type Filter = "alle" | Category;
export const FILTERS: Filter[] = ["alle", ...CATEGORIES];

// Empfohlene Bestellmenge für Frischware: effektive Drehzahl × effektive Haltbarkeit (inkl. Kühltheke).
export const empfMenge = (p: Product, u: Upgrades) =>
  p.storage === "frisch" && p.shelfLifeDays
    ? effectiveSales(p, u) * effectiveShelfLife(p, u)
    : null;

export type Tab = "einkauf" | "preise" | "statistik" | "ausbau" | "strategie" | "design" | "ziele";
