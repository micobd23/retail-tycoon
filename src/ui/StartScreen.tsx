import { useState } from "react";
import { useEconomy, MODES } from "../economy/economyStore";
import { euro } from "../economy/catalog";
import "./startscreen.css";

// Startbildschirm: Spieler gibt Firmennamen ein und wählt einen Modus.
export function StartScreen() {
  const started = useEconomy((s) => s.started);
  const startGame = useEconomy((s) => s.startGame);
  const [firmInput, setFirmInput] = useState("Mein Supermarkt");

  if (started) return null;

  return (
    <div className="start-root">
      <div className="start-card">
        <h1 className="start-title">🛒 Retail Tycoon</h1>
        <p className="start-sub">
          Du bist Einkäufer eines Supermarkts. Kaufe klug ein, halte das Lager
          voll und mach Gewinn.
        </p>

        <div className="start-firm-row">
          <label className="start-firm-label" htmlFor="firm-name">
            Firmenname
          </label>
          <input
            id="firm-name"
            className="start-firm-input"
            type="text"
            maxLength={32}
            value={firmInput}
            onChange={(e) => setFirmInput(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Mein Supermarkt"
          />
        </div>

        <p className="start-sub" style={{ marginTop: 0, marginBottom: 24 }}>
          Wähle deinen Schwierigkeitsgrad:
        </p>

        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              className="mode-tile"
              onClick={() => startGame(m.id, firmInput)}
            >
              <span className="mode-emoji">{m.emoji}</span>
              <span className="mode-name">{m.name}</span>
              <span className="mode-budget">{euro(m.budget)}</span>
              <span className="mode-desc">{m.desc}</span>
            </button>
          ))}
        </div>

        <p className="start-hint">
          Tipp: Weniger Startbudget = schwerer. Du kannst nie Schulden machen —
          schlimmstenfalls wächst du langsamer.
        </p>
      </div>
    </div>
  );
}
