// ---------------------------------------------------------------------------
// Tagesabschluss-Finanzen — Tageslohn, Filial-Passiveinkommen, Kredit-Zinsen.
// Kreditlinie/-kosten sind eng verwandt und liegen deshalb ebenfalls hier.
// ---------------------------------------------------------------------------

import { euro } from "./catalog";
import { useMail } from "./mailStore";
import { dailyWage, type Upgrades } from "./upgrades";

// --- Kreditlinie -----------------------------------------------------------
export function creditLimit(branches: number): number {
  return 5000 + branches * 3000;
}
export const CREDIT_INTEREST_RATE = 0.003; // 0,3 %/Tag auf geborgten Betrag

// Kosten für die n-te Filiale (exponentiell steigend, auf 100 € gerundet).
export function branchCost(n: number): number {
  return Math.round((40000 * Math.pow(1.8, n)) / 100) * 100;
}

export interface DayFinanceResult {
  wage: number;
  branchIncome: number;
  creditInterest: number;
  cashAfter: number;
}

// Verrechnet Tageslohn, Filial-Passiveinkommen und Kredit-Zinsen mit dem
// Tagesumsatz; warnt per Mail, wenn das Konto danach kritisch niedrig ist.
export function settleDayFinance(args: {
  cash: number;
  revenue: number;
  goalDailyBonus: number;
  branches: number;
  lastRevenue: number;
  creditUsed: number;
  upgrades: Upgrades;
  nextDay: number;
}): DayFinanceResult {
  const { cash, revenue, goalDailyBonus, branches, lastRevenue, creditUsed, upgrades, nextDay } = args;

  const wage = dailyWage(upgrades);
  // Passiveinkommen aus Filialen: 12 % des gestrigen Tagesumsatzes pro Filiale.
  const branchIncome = +(branches * 0.12 * lastRevenue).toFixed(2);
  // Kredit-Zinsen: 0,3 %/Tag auf geborgten Betrag.
  const creditInterest = +(creditUsed * CREDIT_INTEREST_RATE).toFixed(2);
  const cashAfterSales = +(cash + revenue + goalDailyBonus + branchIncome).toFixed(2);
  const cashAfter = +(cashAfterSales - wage - creditInterest).toFixed(2);

  if (wage > 0 && cashAfter < 500) {
    useMail.getState().receive({
      from: "Buchhaltung",
      subject: "⚠️ Kontostand kritisch nach Lohnzahlung",
      body:
        `Heute wurden ${euro(wage)} Tageslohn für ${upgrades.personal} Mitarbeiter abgezogen.\n\n` +
        `Dein Kontostand beträgt jetzt nur noch ${euro(cashAfter)}.\n\n` +
        `Sorge für ausreichend Einnahmen — oder erwäge, Personal zu reduzieren.`,
      day: nextDay,
      kind: "info",
    });
  }

  return { wage, branchIncome, creditInterest, cashAfter };
}
