import { useRef, type ReactNode, type CSSProperties } from "react";
import { useOS, type AppId, APP_META } from "./osStore";

const MIN_W = 280;
const MIN_H = 180;

// 8 Griffe: 4 Kanten + 4 Ecken. dir = Himmelsrichtung, z.B. "n", "se".
const HANDLES: { dir: string; cursor: string; style: CSSProperties }[] = [
  { dir: "n",  cursor: "ns-resize",   style: { top: 0, left: 12, right: 12, height: 6 } },
  { dir: "ne", cursor: "nesw-resize", style: { top: 0, right: 0, width: 12, height: 12 } },
  { dir: "e",  cursor: "ew-resize",   style: { top: 12, right: 0, bottom: 12, width: 6 } },
  { dir: "se", cursor: "nwse-resize", style: { bottom: 0, right: 0, width: 12, height: 12 } },
  { dir: "s",  cursor: "ns-resize",   style: { bottom: 0, left: 12, right: 12, height: 6 } },
  { dir: "sw", cursor: "nesw-resize", style: { bottom: 0, left: 0, width: 12, height: 12 } },
  { dir: "w",  cursor: "ew-resize",   style: { top: 12, left: 0, bottom: 12, width: 6 } },
  { dir: "nw", cursor: "nwse-resize", style: { top: 0, left: 0, width: 12, height: 12 } },
];

export function Window({
  id,
  x,
  y,
  w,
  h,
  z,
  max,
  children,
}: {
  id: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean;
  children: ReactNode;
}) {
  const { title } = APP_META[id];
  const focusApp = useOS((s) => s.focusApp);
  const closeApp = useOS((s) => s.closeApp);
  const moveApp = useOS((s) => s.moveApp);
  const resizeWindow = useOS((s) => s.resizeWindow);
  const toggleMax = useOS((s) => s.toggleMax);

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    focusApp(id);
    if (max) return;
    drag.current = { dx: e.clientX - x, dy: e.clientY - y };

    const onMove = (ev: MouseEvent) => {
      if (!drag.current) return;
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

  const onResizeMouseDown = (dir: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    focusApp(id);
    if (max) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = w;
    const startH = h;
    const startLeft = x;
    const startTop = y;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nx = startLeft, ny = startTop, nw = startW, nh = startH;

      if (dir.includes("e")) nw = Math.max(MIN_W, startW + dx);
      if (dir.includes("s")) nh = Math.max(MIN_H, startH + dy);
      if (dir.includes("w")) {
        nw = Math.max(MIN_W, startW - dx);
        nx = startLeft + (startW - nw);
      }
      if (dir.includes("n")) {
        nh = Math.max(MIN_H, startH - dy);
        ny = startTop + (startH - nh);
      }

      resizeWindow(id, nx, ny, nw, nh);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const style = max
    ? { left: 0, top: 0, width: "100%", height: "calc(100% - 44px)", zIndex: z }
    : { left: x, top: y, width: w, height: h, zIndex: z };

  return (
    <div
      className={"os-window" + (max ? " maximized" : "")}
      style={style}
      onMouseDown={() => focusApp(id)}
    >
      {/* Resize-Griffe – nur im Normal-Modus sichtbar/aktiv */}
      {!max && HANDLES.map(({ dir, cursor, style: hs }) => (
        <div
          key={dir}
          className="os-resize-handle"
          style={{ ...hs, cursor }}
          onMouseDown={(e) => onResizeMouseDown(dir, e)}
        />
      ))}

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
