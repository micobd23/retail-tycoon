import { useState } from "react";
import { useEconomy, MODES, MISSIONS } from "../economy/economyStore";
import { euro } from "../economy/catalog";
import "./startscreen.css";

type Step = "pick-mode" | "pick-detail" | "pick-name";
type PlayMode = "kampagne" | "endlos";

export function StartScreen() {
  const started  = useEconomy((s) => s.started);
  const startGame = useEconomy((s) => s.startGame);

  const [step, setStep]         = useState<Step>("pick-mode");
  const [playMode, setPlayMode] = useState<PlayMode | null>(null);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [diffId, setDiffId]     = useState<string | null>(null);
  const [firmInput, setFirmInput] = useState("Mein Supermarkt");

  if (started) return null;

  function handleModeSelect(m: PlayMode) {
    setPlayMode(m);
    setStep("pick-detail");
  }

  function handleDetailSelect(id: string) {
    if (playMode === "kampagne") setMissionId(id);
    else setDiffId(id);
    setStep("pick-name");
  }

  function handleStart() {
    const name = firmInput.trim() || "Mein Supermarkt";
    if (playMode === "kampagne" && missionId) {
      startGame(null, name, "kampagne", missionId);
    } else if (playMode === "endlos" && diffId) {
      startGame(diffId as Parameters<typeof startGame>[0], name, "endlos");
    }
  }

  return (
    <div className="start-root">
      <div className="start-card">
        <h1 className="start-title">🛒 Retail Tycoon</h1>
        <p className="start-sub">
          Du bist Einkäufer eines Supermarkts. Kaufe klug ein, halte das Lager
          voll und mach Gewinn.
        </p>

        {/* ── Step 1: Kampagne oder Endlos ─────────────────────────── */}
        {step === "pick-mode" && (
          <>
            <p className="start-section-title">Wie möchtest du spielen?</p>
            <div className="mode-grid two-col">
              <button className="mode-tile big" onClick={() => handleModeSelect("kampagne")}>
                <span className="mode-emoji">🏆</span>
                <span className="mode-name">Kampagne</span>
                <span className="mode-desc">
                  4 Missionen mit festen Zielen — vom kleinen Laden bis zum
                  Supermarkt-Imperium.
                </span>
              </button>
              <button className="mode-tile big" onClick={() => handleModeSelect("endlos")}>
                <span className="mode-emoji">♾️</span>
                <span className="mode-name">Endlos</span>
                <span className="mode-desc">
                  Freies Spiel ohne Zeitlimit. Spiel, bis du alles erreicht hast!
                </span>
              </button>
            </div>
          </>
        )}

        {/* ── Step 2a: Mission wählen ───────────────────────────────── */}
        {step === "pick-detail" && playMode === "kampagne" && (
          <>
            <p className="start-section-title">Wähle eine Mission</p>
            <div className="mode-grid two-col">
              {MISSIONS.map((m) => (
                <button
                  key={m.id}
                  className="mode-tile mission-tile"
                  onClick={() => handleDetailSelect(m.id)}
                >
                  <span className="mode-emoji">{m.emoji}</span>
                  <span className="mode-name">{m.title}</span>
                  <span className="mission-flavor">{m.flavor}</span>
                  <span className="mode-desc">{m.desc}</span>
                  <span className="mode-budget">Start: {euro(m.budget)}</span>
                </button>
              ))}
            </div>
            <button className="start-back" onClick={() => setStep("pick-mode")}>← Zurück</button>
          </>
        )}

        {/* ── Step 2b: Schwierigkeit wählen ────────────────────────── */}
        {step === "pick-detail" && playMode === "endlos" && (
          <>
            <p className="start-section-title">Wähle die Schwierigkeit</p>
            <div className="mode-grid">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className="mode-tile"
                  onClick={() => handleDetailSelect(m.id)}
                >
                  <span className="mode-emoji">{m.emoji}</span>
                  <span className="mode-name">{m.name}</span>
                  <span className="mode-budget">{euro(m.budget)}</span>
                  <span className="mode-desc">{m.desc}</span>
                </button>
              ))}
            </div>
            <p className="start-hint">Weniger Startbudget = schwerer.</p>
            <button className="start-back" onClick={() => setStep("pick-mode")}>← Zurück</button>
          </>
        )}

        {/* ── Step 3: Firmenname + Start ────────────────────────────── */}
        {step === "pick-name" && (
          <>
            <p className="start-section-title">Gib deiner Firma einen Namen</p>

            <div className="start-firm-row">
              <label className="start-firm-label" htmlFor="firm-name">Firmenname</label>
              <input
                id="firm-name"
                className="start-firm-input"
                type="text"
                maxLength={32}
                value={firmInput}
                onChange={(e) => setFirmInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleStart();
                }}
                placeholder="Mein Supermarkt"
                autoFocus
              />
            </div>

            {/* Summary */}
            <div className="start-summary">
              {playMode === "kampagne" && missionId && (() => {
                const m = MISSIONS.find((m) => m.id === missionId)!;
                return (
                  <>
                    <span>{m.emoji} <strong>{m.title}</strong></span>
                    <span>·</span>
                    <span>Startbudget: <strong>{euro(m.budget)}</strong></span>
                  </>
                );
              })()}
              {playMode === "endlos" && diffId && (() => {
                const m = MODES.find((m) => m.id === diffId)!;
                return (
                  <>
                    <span>♾️ Endlos</span>
                    <span>·</span>
                    <span>{m.emoji} {m.name}</span>
                    <span>·</span>
                    <span>Startbudget: <strong>{euro(m.budget)}</strong></span>
                  </>
                );
              })()}
            </div>

            <button className="start-btn" onClick={handleStart}>
              Spiel starten ▶
            </button>
            <button className="start-back" onClick={() => setStep("pick-detail")}>← Zurück</button>
          </>
        )}
      </div>
    </div>
  );
}
