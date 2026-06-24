import { useRef, type ReactNode } from "react";
import { useOS, type AppId, APP_META } from "./osStore";

// Ein verschiebbares Programmfenster.
// Ziehen am Titelbalken bewegt das Fenster; X schließt es.
export function Window({
  id,
  x,
  y,
  z,
  max,
  children,
}: {
  id: AppId;
  x: number;
  y: number;
  z: number;
  max: boolean;
  children: ReactNode;
}) {
  const { title, w, h } = APP_META[id];
  const focusApp = useOS((s) => s.focusApp);
  const closeApp = useOS((s) => s.closeApp);
  const moveApp = useOS((s) => s.moveApp);
  const toggleMax = useOS((s) => s.toggleMax);

  // Merkt sich, wo im Titelbalken man angefasst hat (für sauberes Ziehen).
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    focusApp(id);
    if (max) return; // im Vollbild nicht ziehen
    drag.current = { dx: e.clientX - x, dy: e.clientY - y };

    const onMove = (ev: MouseEvent) => {
      if (!drag.current) return;
      // Innerhalb des sichtbaren Bereichs halten.
      const nx = Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - drag.current.dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - drag.current.dy));
      moveApp(id, nx, ny);
    };
    const onUp = () => {
      drag.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Vollbild: füllt den Desktop über der Taskbar; sonst freie Position/Größe.
  const style = max
    ? { left: 0, top: 0, width: "100%", height: "calc(100% - 44px)", zIndex: z }
    : { left: x, top: y, width: w, height: h, zIndex: z };

  return (
    <div
      className={"os-window" + (max ? " maximized" : "")}
      style={style}
      onMouseDown={() => focusApp(id)}
    >
      <div
        className="os-window-header"
        onMouseDown={onHeaderMouseDown}
        onDoubleClick={() => toggleMax(id)}
      >
        <span className="os-window-title">{title}</span>
        <div className="os-window-buttons">
          <button
            className="os-window-btn"
            onClick={() => toggleMax(id)}
            title={max ? "Wiederherstellen" : "Maximieren"}
          >
            <span className={max ? "os-icon-restore" : "os-icon-maximize"} />
          </button>
          <button
            className="os-window-btn os-window-close"
            onClick={() => closeApp(id)}
            title="Schließen"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="os-window-body">{children}</div>
    </div>
  );
}
