import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { startGame } from "./game/PhaserGame";
import { EventBus, Events, type InteractionInfo } from "./game/EventBus";
import { RetailOS } from "./os/RetailOS";
import { DayHUD } from "./os/DayHUD";
import { DayRecap } from "./os/DayRecap";
import { YearEnd } from "./os/YearEnd";
import { useOS } from "./os/osStore";
import { useEconomy } from "./economy/economyStore";
import { useGoal } from "./economy/goalStore";
import { StartScreen } from "./ui/StartScreen";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const dayRunning = useOS((s) => s.dayRunning);
  const recapOpen = useEconomy((s) => s.recapOpen);
  const yearEndOpen = useGoal((s) => s.yearEndOpen);

  // Phaser nur einmal starten (auch bei React StrictMode-Doppel-Mount).
  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = startGame(containerRef.current);

    const onInteraction = (info: InteractionInfo) => setPrompt(info.prompt);
    EventBus.on(Events.InteractionChanged, onInteraction);

    // Schreibtisch-[E] -> RetailOS hochfahren
    const onOpenComputer = () => useOS.getState().boot();
    EventBus.on(Events.OpenComputer, onOpenComputer);

    // „Tag weiter": OS kurz ausblenden, Welt zeigen (Phaser startet den Ablauf).
    const onStartDay = () => useOS.getState().setDayRunning(true);
    EventBus.on(Events.StartDay, onStartDay);

    // Tag fertig: jetzt real abrechnen (-> Recap), OS wieder einblendbar machen.
    const onDayDone = () => {
      useEconomy.getState().advanceDay();
      useOS.getState().setDayRunning(false);
    };
    EventBus.on(Events.DayDone, onDayDone);

    return () => {
      EventBus.off(Events.InteractionChanged, onInteraction);
      EventBus.off(Events.OpenComputer, onOpenComputer);
      EventBus.off(Events.StartDay, onStartDay);
      EventBus.off(Events.DayDone, onDayDone);
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="game-root">
      {/* Phaser rendert hier hinein */}
      <div ref={containerRef} className="game-canvas" />

      {/* React-Overlay: liegt über dem Spiel */}
      <div className="ui-overlay">
        <div className="hud-title">🛒 Retail Tycoon — Büro</div>
        <div className="hud-help">Bewegen: WASD oder Pfeiltasten</div>

        {prompt && <div className="interaction-hint">{prompt}</div>}
      </div>

      {/* RetailOS-Overlay (nur sichtbar, wenn der Spieler am PC sitzt) */}
      <RetailOS />

      {/* Tag-HUD während des sichtbaren Tagesablaufs */}
      {dayRunning && <DayHUD />}

      {/* Vollbild-Tagesabschluss (über allem) */}
      {recapOpen && <DayRecap />}

      {/* Jahresabschluss (erscheint nach dem Recap des letzten Tages) */}
      {!recapOpen && yearEndOpen && <YearEnd />}

      {/* Startbildschirm (nur sichtbar, bis ein Modus gewählt wurde) */}
      <StartScreen />
    </div>
  );
}
