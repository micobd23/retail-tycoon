import { useEffect, useRef, useState } from "react";
import { EventBus, Events } from "../game/EventBus";
import { useEconomy, projectDay, isCrisisActive } from "../economy/economyStore";
import { euro } from "../economy/catalog";
import "./dayhud.css";

// Muss zur Dauer in OfficeScene passen (DAY_DURATION_MS).
const DAY_MS = 18000;

// Eingeblendet, während der Tag sichtbar abläuft: Tagesuhr/Fortschritt,
// hochzählender Umsatz und ein „Überspringen"-Knopf.
const CRISIS_ICONS: Record<string, string> = {
  hitzewelle: "☀️", preiskampf: "⚔️", lieferskandal: "🚨",
};

export function DayHUD() {
  const day = useEconomy((s) => s.day);
  const seasonCrisis = useEconomy((s) => s.seasonCrisis);
  const crisisActive = isCrisisActive(seasonCrisis, day);
  // Ziel-Umsatz einmalig beim Start schätzen (zählt von 0 dorthin hoch).
  const target = useRef(projectDay().revenue);
  const start = useRef(performance.now());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start.current) / DAY_MS);
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const revenue = target.current * progress;

  return (
    <div className="dayhud">
      <div className="dayhud-row">
        <span className="dayhud-day">
          🛒 Tag {day} läuft …
          {crisisActive && seasonCrisis && (
            <span className="dayhud-crisis" title={`Krise: ${seasonCrisis.type}`}>
              {CRISIS_ICONS[seasonCrisis.type]}
            </span>
          )}
        </span>
        <span className="dayhud-rev">{euro(revenue)}</span>
        <button
          className="dayhud-skip"
          onClick={() => EventBus.emit(Events.SkipDay)}
        >
          ⏩ Überspringen
        </button>
      </div>
      <div className="dayhud-bar">
        <div className="dayhud-fill" style={{ width: progress * 100 + "%" }} />
      </div>
    </div>
  );
}
