import Phaser from "phaser";

// Kleine Brücke zwischen Phaser (Spielwelt) und React (UI-Overlay).
// Phaser sendet Ereignisse, React hört zu — und umgekehrt.
export const EventBus = new Phaser.Events.EventEmitter();

// Ereignis-Namen an einer Stelle, damit wir uns nicht vertippen.
export const Events = {
  // Phaser -> React: Spieler steht an einem Interaktionspunkt (oder nicht mehr)
  InteractionChanged: "interaction-changed",
  // Phaser -> React: Spieler hat am Schreibtisch [E] gedrückt -> PC hochfahren
  OpenComputer: "open-computer",
  // React -> Phaser: Spieler hat den PC verlassen -> Welt wieder freigeben
  CloseComputer: "close-computer",
  // React -> Phaser: „Tag weiter" gedrückt -> sichtbaren Tagesablauf starten
  StartDay: "start-day",
  // React -> Phaser: Tag überspringen -> Ablauf sofort beenden
  SkipDay: "skip-day",
  // Phaser -> React: sichtbarer Tagesablauf fertig -> jetzt abrechnen + Recap
  DayDone: "day-done",
  // React -> Phaser: Ladengestaltung geändert -> Bodenfärbe anpassen
  ThemeChange: "theme-change",
} as const;

// Form der Daten, die mit InteractionChanged mitgeschickt werden.
export type InteractionInfo = {
  // null = gerade nichts in Reichweite
  prompt: string | null;
};
