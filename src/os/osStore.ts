import { create } from "zustand";

// Die drei Programme, die es im RetailOS gibt.
export type AppId = "mail" | "browser" | "erp" | "filialen";

// Statische Eigenschaften je Programm (Titel + Standard-Fenstergröße).
export const APP_META: Record<
  AppId,
  { title: string; w: number; h: number }
> = {
  mail: { title: "📧 Mail", w: 640, h: 420 },
  browser: { title: "🌐 RetailNet Explorer", w: 600, h: 420 },
  erp: { title: "📦 Warenwirtschaft (WaWi)", w: 740, h: 500 },
  filialen: { title: "🏪 Filialen", w: 520, h: 420 },
};

// Ein offenes Fenster: welche App, wo es liegt, und die Stapel-Reihenfolge.
export interface OSWindow {
  id: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  max: boolean; // Vollbild?
}

interface OSState {
  open: boolean; // RetailOS sichtbar (Spieler sitzt am PC)?
  dayRunning: boolean; // läuft gerade der sichtbare Tagesablauf? (OS kurz ausblenden)
  windows: OSWindow[]; // aktuell offene Programmfenster
  topZ: number; // höchster z-Index (für "nach vorne holen")

  setDayRunning: (v: boolean) => void;
  boot: () => void; // PC einschalten
  shutdown: () => void; // PC verlassen (alle Fenster zu)
  openApp: (id: AppId) => void; // Programm öffnen oder nach vorne holen
  closeApp: (id: AppId) => void; // Programm schließen
  focusApp: (id: AppId) => void; // Fenster nach vorne holen
  moveApp: (id: AppId, x: number, y: number) => void; // Fenster verschieben
  resizeWindow: (id: AppId, x: number, y: number, w: number, h: number) => void; // Größe + Position ändern
  toggleMax: (id: AppId) => void; // Vollbild an/aus
}

// Leicht versetzte Startposition, damit Fenster nicht exakt übereinander liegen.
let nextOffset = 0;

export const useOS = create<OSState>((set, get) => ({
  open: false,
  dayRunning: false,
  windows: [],
  topZ: 1,

  setDayRunning: (v) => set({ dayRunning: v }),

  boot: () => set({ open: true }),

  shutdown: () => set({ open: false, windows: [] }),

  openApp: (id) => {
    const { windows, topZ } = get();
    // Schon offen? Dann nur nach vorne holen.
    if (windows.some((w) => w.id === id)) {
      get().focusApp(id);
      return;
    }
    const offset = (nextOffset = (nextOffset + 1) % 6);
    const { w, h } = APP_META[id];
    set({
      topZ: topZ + 1,
      windows: [
        ...windows,
        { id, x: 120 + offset * 32, y: 90 + offset * 28, w, h, z: topZ + 1, max: false },
      ],
    });
  },

  closeApp: (id) =>
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  focusApp: (id) =>
    set((s) => ({
      topZ: s.topZ + 1,
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, z: s.topZ + 1 } : w,
      ),
    })),

  moveApp: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),

  resizeWindow: (id, x, y, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) => (win.id === id ? { ...win, x, y, w, h } : win)),
    })),

  toggleMax: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, max: !w.max } : w,
      ),
    })),
}));
