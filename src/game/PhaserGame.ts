import Phaser from "phaser";
import { OfficeScene } from "./scenes/OfficeScene";

// Erstellt die Phaser-Spielinstanz und hängt sie in das übergebene DOM-Element.
export function startGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#cfd8dc",
    pixelArt: true, // kein Anti-Aliasing für Pixel-Art-Tiles
    scale: {
      mode: Phaser.Scale.RESIZE, // füllt den Container, passt sich an
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 }, // Top-Down: keine Schwerkraft
        debug: false,
      },
    },
    scene: [OfficeScene],
  });

  // Dev-Hilfe: Spielinstanz im Browser erreichbar machen (nur Entwicklung).
  if (import.meta.env.DEV) {
    (window as unknown as { __game?: Phaser.Game }).__game = game;
  }

  return game;
}
