import { useEffect } from "react";
import { useEconomy } from "../economy/economyStore";
import { euro, dayToCalendar } from "../economy/catalog";
import "./recap.css";

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

// Vollbild-Tagesabschluss: erscheint nach „Tag weiter" und fasst den Tag
// zusammen. Soll sich wie ein kleiner „Zahltag-Moment" anfühlen.
// (Zufriedenheit + Kundenstimmen folgen in einem späteren Schritt — die
//  Slots dafür sind hier schon vorbereitet.)
export function DayRecap() {
  const recap = useEconomy((s) => s.recap);
  const cash = useEconomy((s) => s.cash);
  const closeRecap = useEconomy((s) => s.closeRecap);

  // Enter/Esc/Leertaste schließen den Recap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        closeRecap();
      }
    };
    // capture: true -> wir fangen Esc vor dem „PC verlassen"-Handler ab.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeRecap]);

  if (!recap) return null;

  const cal = dayToCalendar(recap.day);
  const gewinn = +(recap.revenue - recap.spoiledValue).toFixed(2);
  const delta = +(recap.revenue - recap.prevRevenue).toFixed(2);
  const sat = recap.satisfaction;
  const satDelta = sat - recap.prevSatisfaction;
  const satColor = sat >= 80 ? "#2e7d32" : sat >= 55 ? "#f9a825" : "#c62828";

  const isWin = gewinn > 0;
  const resultLabel = isWin
    ? recap.spoiledValue === 0 && delta >= 0
      ? "Guter Tag — kein Verderb, Kasse stimmt"
      : "Profitable Tag"
    : gewinn === 0
    ? "Nullrunde — kein Gewinn, kein Verlust"
    : "Verlust-Tag — Ausgaben übersteigen Einnahmen";

  return (
    <div className={`recap-overlay ${isWin ? "recap-overlay--win" : "recap-overlay--loss"}`} onClick={closeRecap}>
      <div className={`recap-card ${isWin ? "recap-card--win" : "recap-card--loss"}`} onClick={(e) => e.stopPropagation()}>
        <div className="recap-head">
          <span className="recap-kicker">
            {SEASON_EMOJI[cal.season]} {cal.season} · Q{cal.quarter} · Tag {cal.seasonDay}/13 · Jahr {cal.year}
          </span>
          <h1 className="recap-title">Tag {recap.day} abgeschlossen</h1>
          <p className="recap-result-label">{resultLabel}</p>
        </div>

        {/* Große Kennzahlen-Kacheln */}
        <div className="recap-grid">
          <Tile
            label="Umsatz"
            value={euro(recap.revenue)}
            tone="cash"
            delta={delta}
          />
          <Tile
            label="Verderb"
            value={recap.spoiledValue > 0 ? "−" + euro(recap.spoiledValue) : "—"}
            tone={recap.spoiledValue > 0 ? "loss" : "muted"}
          />
          <Tile
            label="Tagesgewinn"
            value={euro(gewinn)}
            tone={gewinn >= 0 ? "cash" : "loss"}
          />
          <Tile label="Kontostand" value={euro(cash)} tone="neutral" />
        </div>

        {/* Highlights des Tages */}
        <div className="recap-rows">
          <div className="recap-row">
            <span className="recap-row-label">🏆 Bestseller</span>
            <span className="recap-row-value">
              {recap.bestseller
                ? `${recap.bestseller.name} · ${recap.bestseller.qty} Stk.`
                : "—"}
            </span>
          </div>
          <div className="recap-row">
            <span className="recap-row-label">📦 Verkaufte Stück</span>
            <span className="recap-row-value">{recap.unitsSold}</span>
          </div>
          {recap.branchIncome > 0 && (
            <div className="recap-row">
              <span className="recap-row-label">🏪 Filial-Passiveinkommen</span>
              <span className="recap-row-value" style={{ color: "#2e7d32" }}>+{euro(recap.branchIncome)}</span>
            </div>
          )}
        </div>

        {/* Kundenzufriedenheit */}
        <div className="recap-sat">
          <div className="recap-sat-head">
            <span className="recap-sat-label">🙂 Kundenzufriedenheit</span>
            <span className="recap-sat-pct" style={{ color: satColor }}>
              {sat}%
              {satDelta !== 0 && (
                <small className={satDelta > 0 ? "up" : "down"}>
                  {satDelta > 0 ? " ▲" : " ▼"}
                  {Math.abs(satDelta)}
                </small>
              )}
            </span>
          </div>
          <div className="recap-sat-bar">
            <div
              className="recap-sat-fill"
              style={{ width: sat + "%", background: satColor }}
            />
          </div>
          {recap.missedUnits > 0 && (
            <p className="recap-sat-missed">
              ⚠️ {recap.missedUnits} verpasste Verkäufe — leere Regale kosten
              dich Umsatz und Zufriedenheit.
            </p>
          )}
        </div>

        {/* Kundenstimmen */}
        <div className="recap-voices">
          {recap.voices.map((v, i) => (
            <div key={i} className={"recap-voice " + (v.good ? "good" : "bad")}>
              <span className="recap-voice-icon">{v.good ? "🙂" : "😕"}</span>
              <span>{v.text}</span>
            </div>
          ))}
        </div>

        <button className="recap-btn" onClick={closeRecap}>
          Weiter ▶
        </button>
        <p className="recap-hint">Enter · Leertaste · Esc</p>
      </div>
    </div>
  );
}

// Eine große Kennzahlen-Kachel mit optionalem ↑/↓-Vergleich zum Vortag.
function Tile({
  label,
  value,
  tone,
  delta,
}: {
  label: string;
  value: string;
  tone: "cash" | "loss" | "neutral" | "muted";
  delta?: number;
}) {
  return (
    <div className="recap-tile">
      <span className="recap-tile-label">{label}</span>
      <span className={"recap-tile-value " + tone}>{value}</span>
      {delta !== undefined && delta !== 0 && (
        <span className={"recap-tile-delta " + (delta > 0 ? "up" : "down")}>
          {delta > 0 ? "▲" : "▼"} {euro(Math.abs(delta))} ggü. Vortag
        </span>
      )}
      {delta === 0 && (
        <span className="recap-tile-delta flat">unverändert ggü. Vortag</span>
      )}
    </div>
  );
}
