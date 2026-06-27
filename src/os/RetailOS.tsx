import { useEffect, useState } from "react";
import { useOS, type AppId, APP_META } from "./osStore";
import { Window } from "./Window";
import { EventBus, Events } from "../game/EventBus";
import { useEconomy } from "../economy/economyStore";
import { useMail, unreadCount } from "../economy/mailStore";
import { MailApp } from "./apps/MailApp";
import { BrowserApp } from "./apps/BrowserApp";
import { ErpApp } from "./apps/ErpApp";
import { FilialenApp } from "./apps/FilialenApp";
import "./os.css";
import "./dark.css";

// Welcher Inhalt gehört zu welcher App?
const APP_CONTENT: Record<AppId, () => JSX.Element> = {
  mail: MailApp,
  browser: BrowserApp,
  erp: ErpApp,
  filialen: FilialenApp,
};

// Desktop-Icons (Reihenfolge = Anzeige)
const ICONS: AppId[] = ["erp", "filialen", "mail", "browser"];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="os-clock">
      {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

export function RetailOS() {
  const open = useOS((s) => s.open);
  const windows = useOS((s) => s.windows);
  const openApp = useOS((s) => s.openApp);
  const focusApp = useOS((s) => s.focusApp);
  const shutdown = useOS((s) => s.shutdown);

  const dayRunning = useOS((s) => s.dayRunning);
  const resetGame = useEconomy((s) => s.resetGame);
  const firmName = useEconomy((s) => s.firmName);
  const unread = useMail((s) => unreadCount(s.mails));

  // PC verlassen -> Welt in Phaser wieder freigeben.
  const leave = () => {
    shutdown();
    EventBus.emit(Events.CloseComputer);
  };

  // Neues Spiel: zurück zum Startbildschirm (mit Sicherheitsabfrage).
  const newGame = () => {
    if (!window.confirm("Neues Spiel starten? Dein aktueller Fortschritt geht verloren.")) return;
    leave();
    resetGame();
  };

  // ESC verlässt den PC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Bei offenem Recap / laufendem Tag nicht den PC verlassen.
      if (
        e.key === "Escape" &&
        !useEconomy.getState().recapOpen &&
        !useOS.getState().dayRunning
      )
        leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Während der Tag sichtbar abläuft, OS-Oberfläche ausblenden (Welt zeigen).
  // Zustand der Fenster bleibt erhalten und kommt danach unverändert zurück.
  if (!open || dayRunning) return null;

  return (
    <div className="os-root">
      {/* Desktop-Hintergrund mit Icons */}
      <div className="os-desktop">
        {ICONS.map((id) => (
          <button
            key={id}
            className="os-icon"
            onDoubleClick={() => openApp(id)}
            onClick={() => openApp(id)}
          >
            <span className="os-icon-glyph">
              {APP_META[id].title.split(" ")[0]}
              {id === "mail" && unread > 0 && (
                <span className="os-badge">{unread}</span>
              )}
            </span>
            <span className="os-icon-label">
              {APP_META[id].title.replace(/^\S+\s/, "")}
            </span>
          </button>
        ))}
      </div>

      {/* Offene Fenster */}
      {windows.map((w) => {
        const Content = APP_CONTENT[w.id];
        return (
          <Window key={w.id} id={w.id} x={w.x} y={w.y} w={w.w} h={w.h} z={w.z} max={w.max}>
            <Content />
          </Window>
        );
      })}

      {/* Taskbar unten */}
      <div className="os-taskbar">
        <span className="os-brand">
          {firmName ? `${firmName} · ` : ""}RetailOS
        </span>
        <div className="os-task-list">
          {windows.map((w) => (
            <button
              key={w.id}
              className="os-task"
              onClick={() => focusApp(w.id)}
            >
              {APP_META[w.id].title}
            </button>
          ))}
        </div>
        <Clock />
        <button className="os-newgame" onClick={newGame}>
          ⟲ Neues Spiel
        </button>
        <button className="os-leave" onClick={leave}>
          ⏻ PC verlassen
        </button>
      </div>
    </div>
  );
}
