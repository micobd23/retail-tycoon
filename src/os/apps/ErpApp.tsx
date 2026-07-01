import { useState } from "react";
import {
  useEconomy, usedCapacity, capacityOf, dailyWage, pendingCapOf, isCrisisActive,
} from "../../economy/economyStore";
import { useGoal } from "../../economy/goalStore";
import { ZieleTab } from "./ZieleTab";
import { euro, dayToCalendar } from "../../economy/catalog";
import { EventBus, Events } from "../../game/EventBus";
import { CapGauge } from "./erp/CapGauge";
import { CrisisBanner } from "./erp/CrisisBanner";
import { EinkaufView } from "./erp/EinkaufView";
import { PreiseView } from "./erp/PreiseView";
import { StatistikView } from "./erp/StatistikView";
import { AusbauView } from "./erp/AusbauView";
import { StrategieView } from "./erp/StrategieView";
import { DesignView } from "./erp/DesignView";
import type { Tab } from "./erp/shared";
import "./erp.css";

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

export function ErpApp() {
  const [tab, setTab] = useState<Tab>("einkauf");
  const branches = useEconomy((s) => s.branches);
  const specialization = useEconomy((s) => s.specialization);

  const cash = useEconomy((s) => s.cash);
  const day = useEconomy((s) => s.day);
  const lastRevenue = useEconomy((s) => s.lastRevenue);
  const lastSpoiledValue = useEconomy((s) => s.lastSpoiledValue);
  const satisfaction = useEconomy((s) => s.satisfaction);
  const batches = useEconomy((s) => s.batches);
  const upgrades = useEconomy((s) => s.upgrades);

  const goals = useGoal((s) => s.goals);
  const goalsDone = goals.filter((g) => g.done).length;
  const seasonCrisis = useEconomy((s) => s.seasonCrisis);

  const cal = dayToCalendar(day);

  const [msg, setMsg] = useState<string | null>(null);

  const pendingOrders = useEconomy((s) => s.pendingOrders);
  const used = usedCapacity(batches);
  const cap = capacityOf(upgrades, specialization);
  const pendCap = pendingCapOf(pendingOrders);

  // „Tag weiter" startet den sichtbaren Tagesablauf in der Welt (OfficeScene);
  // am Ende rechnet App via DayDone ab und der Vollbild-Recap erscheint.
  const handleDay = () => EventBus.emit(Events.StartDay);

  return (
    <div className="erp">
      {/* Kopfzeile mit Kennzahlen */}
      <div className="erp-bar">
        <div className="erp-stat">
          <span className="erp-stat-label">Konto</span>
          <span className="erp-stat-value erp-cash">{euro(cash)}</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">
            {SEASON_EMOJI[cal.season]} {cal.season} · Q{cal.quarter} · Jahr {cal.year}
          </span>
          <span className="erp-stat-value">Tag {cal.seasonDay} / 13</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">Umsatz gestern</span>
          <span className="erp-stat-value">{euro(lastRevenue)}</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">Verderb gestern</span>
          <span className="erp-stat-value erp-loss">
            {lastSpoiledValue > 0 ? "−" + euro(lastSpoiledValue) : "—"}
          </span>
        </div>
        {dailyWage(upgrades) > 0 && (
          <div className="erp-stat">
            <span className="erp-stat-label">Tageslohn</span>
            <span className="erp-stat-value erp-loss">−{euro(dailyWage(upgrades))}/Tag</span>
          </div>
        )}
        <div className="erp-stat">
          <span className="erp-stat-label">Zufriedenheit</span>
          <span
            className="erp-stat-value"
            style={{
              color:
                satisfaction >= 80
                  ? "#2e7d32"
                  : satisfaction >= 55
                    ? "#f9a825"
                    : "#c62828",
            }}
          >
            {satisfaction}%
          </span>
        </div>

        {/* Lagerplatz-Anzeigen */}
        <CapGauge label="Lager (trocken)" used={used.trocken} cap={cap.trocken} pending={pendCap.trocken} />
        <CapGauge
          label="Verkaufsfläche (frisch)"
          used={used.frisch}
          cap={cap.frisch}
          pending={pendCap.frisch}
        />

        {goals.length > 0 && (
          <button
            className="erp-stat erp-ziele-badge"
            onClick={() => setTab("ziele")}
            title="Saisonziele öffnen"
          >
            <span className="erp-stat-label">🎯 Saisonziele</span>
            <span
              className="erp-stat-value"
              style={{ color: goalsDone === goals.length ? "#2e7d32" : "#455a64" }}
            >
              {goalsDone}/{goals.length}
            </span>
          </button>
        )}

        <button className="erp-day-btn" onClick={handleDay}>
          Tag weiter ▶
        </button>
      </div>

      {/* Aktive Krisen-Warnung */}
      {isCrisisActive(seasonCrisis, day) && seasonCrisis && (
        <CrisisBanner crisis={seasonCrisis} day={day} />
      )}

      {/* Reiter */}
      <div className="erp-tabs">
        <button
          className={"erp-tab" + (tab === "einkauf" ? " active" : "")}
          onClick={() => setTab("einkauf")}
        >
          🛒 Einkauf
        </button>
        <button
          className={"erp-tab" + (tab === "preise" ? " active" : "")}
          onClick={() => setTab("preise")}
        >
          💰 Preise
        </button>
        <button
          className={"erp-tab" + (tab === "statistik" ? " active" : "")}
          onClick={() => setTab("statistik")}
        >
          📊 Statistik
        </button>
        <button
          className={"erp-tab" + (tab === "ausbau" ? " active" : "")}
          onClick={() => setTab("ausbau")}
        >
          🏗️ Ausbau
        </button>
        <button
          className={"erp-tab" + (tab === "strategie" ? " active" : "")}
          onClick={() => setTab("strategie")}
          title={branches < 1 ? "Ab der ersten Filiale verfügbar" : "Spezialisierung wählen"}
        >
          🎯 Strategie
          {branches < 1 ? (
            <span className="erp-tab-badge">🔒</span>
          ) : specialization === null ? (
            <span className="erp-tab-badge">!</span>
          ) : null}
        </button>
        <button
          className={"erp-tab" + (tab === "design" ? " active" : "")}
          onClick={() => setTab("design")}
        >
          🎨 Design
        </button>
        <button
          className={"erp-tab" + (tab === "ziele" ? " active" : "")}
          onClick={() => setTab("ziele")}
        >
          🎯 Ziele{goalsDone > 0 && goalsDone < goals.length && (
            <span className="erp-tab-badge">{goalsDone}</span>
          )}
          {goals.length > 0 && goalsDone === goals.length && (
            <span className="erp-tab-badge done">✓</span>
          )}
        </button>
      </div>

      {msg && tab === "einkauf" && <div className="erp-msg">{msg}</div>}

      {tab === "einkauf" && <EinkaufView setMsg={setMsg} />}
      {tab === "preise" && <PreiseView />}
      {tab === "statistik" && <StatistikView />}
      {tab === "ausbau" && <AusbauView />}
      {tab === "strategie" && <StrategieView />}
      {tab === "design" && <DesignView />}
      {tab === "ziele" && <ZieleTab />}
    </div>
  );
}
