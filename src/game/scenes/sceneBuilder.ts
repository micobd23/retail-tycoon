import Phaser from "phaser";

// ---------------------------------------------------------------------------
// SceneBuilder — reines Welt-Aufbauen für OfficeScene: Böden, Wände, Möbel,
// Regale, Spieler-Sprite-Texturen, Straße mit Konkurrenten-Fassaden.
// Enthält keine Spiellogik (Tagesablauf, Bewegung, Store-Anbindung) — das
// bleibt in OfficeScene.ts. Trennung macht einen künftigen Umstieg auf echte
// Sprite-Assets einfacher: nur hier tauscht man das "Zeichnen" aus.
// ---------------------------------------------------------------------------

// Farbpalette (modern-flat) — pro Material ein Grundton + hellere/dunklere
// Varianten für Kanten und Schatten, das gibt der flachen Optik Tiefe.
export const COLORS = {
  wall: 0x37474f, // Wände: dunkles Blaugrau
  wallTop: 0x546e7a, // Wand-Oberkante (Highlight)
  wallSide: 0x263238, // Wand-Seitenkante (Schatten, wirkt wie sichtbare Dicke)
  floorOffice: 0xeceff1, // Büro: hell
  floorStorage: 0xfff3e0, // Lager: warmes Beige
  floorShop: 0xe8f5e9, // Verkauf: helles Grün
  floorHall: 0xf5f5f5, // Flur: grau-weiß
  grid: 0x000000, // Boden-Raster (mit niedriger Deckkraft)
  desk: 0x8d6e63, // Schreibtisch: Holz
  deskTop: 0xa1887f, // Tischplatte-Highlight
  pc: 0x263238, // Monitor: fast schwarz
  pcScreen: 0x4fc3f7, // Bildschirm: hellblau
  shelf: 0xa1887f, // Regal: Holz warm
  shelfEdge: 0x6d4c41, // Regal-Kante dunkel
  shelfTop: 0xd7ccc8, // Regal-Oberkante (Highlight, wirkt wie ein Deckel)
  counter: 0x607d8b, // Kasse: blaugrau
  counterTop: 0x78909c, // Kassen-Highlight
  counterSide: 0x455a64, // Kassen-Seitenkante (Schatten)
  goodsDry: 0xffb74d, // Trockenware im Lager: warmes Amber
  goodsFresh: 0x66bb6a, // Frischware in der Verkaufsfläche: Grün
  // Spielfigur
  skin: 0xffcc9c,
  skinEdge: 0xe0a878,
  hair: 0x5d4037,
  shirt: 0x1e88e5,
  shirtEdge: 0x1565c0,
  legs: 0x37474f,
  shadow: 0x000000, // weiche Schatten (mit niedriger Deckkraft)
} as const;

// Ein Regal, dessen Füllstand sich nach dem Bestand richtet.
// `vertical`: Lager-Regale füllen von unten, Verkaufsregale von links.
export type Shelf = {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  fill: Phaser.GameObjects.Rectangle;
};

// Ein Rechteck-Hindernis (Wand/Möbel) mit Kollision.
type Solid = { x: number; y: number; w: number; h: number; color: number };

// Basis-Raster (auch von OfficeScene für Positionierung/Bewegung genutzt).
export const TILE = 40;

// Tiefen-Ebenen (z-Reihenfolge), damit die Figur immer oben läuft.
export const DEPTH = { floor: 0, grid: 1, shadow: 2, furniture: 3, avatar: 20 } as const;

export class SceneBuilder {
  constructor(
    private scene: Phaser.Scene,
    private solids: Phaser.Physics.Arcade.StaticGroup,
  ) {}

  // Kenney-RPG-Tiles als Boden: Frame 9 = warme Holzdielen (Büro),
  // Frame 122 = heller Naturstein (Lager / Flur / Verkauf).
  // Gibt den Verkaufsflächen-Boden zurück (Tint-fähig für Ladengestaltung).
  drawFloors(): Phaser.GameObjects.TileSprite {
    const S = TILE / 16; // Skalierung: 16-px-Tile → 40-px-TILE = 2.5
    const tileFloor = (x: number, y: number, w: number, h: number, frame: number) => {
      const ts = this.scene.add
        .tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, 'rpg', frame)
        .setOrigin(0)
        .setDepth(DEPTH.floor);
      ts.setTileScale(S, S);
      return ts;
    };

    tileFloor(1,  1,  8,  6,   9); // Büro: Frame 9
    tileFloor(18, 1, 11,  6, 122); // Lager: heller Stein
    tileFloor(9,  1,  9,  6, 122); // Flur: heller Stein
    return tileFloor(1,  7, 28, 12, 122); // Verkauf (Tint-fähig für Ladengestaltung)
  }

  // Dezentes Fliesen-Raster über den ganzen Boden — gibt Größe & Tiefe.
  drawFloorGrid(worldW: number, worldH: number) {
    const g = this.scene.add.graphics().setDepth(DEPTH.grid);
    g.lineStyle(1, COLORS.grid, 0.05);
    for (let x = TILE; x < worldW; x += TILE) {
      g.lineBetween(x, TILE, x, worldH - TILE);
    }
    for (let y = TILE; y < worldH; y += TILE) {
      g.lineBetween(TILE, y, worldW - TILE, y);
    }
  }

  buildWalls() {
    // Außenwände + Trennwände mit Türöffnungen (Lücken).
    const walls: Solid[] = [
      // Außenrahmen
      { x: 1, y: 1, w: 28, h: 0.5, color: COLORS.wall }, // oben
      // Südwand mit Türlücke x=13..16 (Ausgang zur Straße)
      { x: 1,  y: 18.5, w: 12, h: 0.5, color: COLORS.wall }, // unten links
      { x: 16, y: 18.5, w: 13, h: 0.5, color: COLORS.wall }, // unten rechts
      { x: 1, y: 1, w: 0.5, h: 18, color: COLORS.wall }, // links
      { x: 28.5, y: 1, w: 0.5, h: 18, color: COLORS.wall }, // rechts

      // Trennwand Büro|Flur (mit Türlücke bei y=4..6)
      { x: 8.5, y: 1, w: 0.5, h: 3, color: COLORS.wall },
      { x: 8.5, y: 6, w: 0.5, h: 1, color: COLORS.wall },
      // Trennwand Flur|Lager (mit Türlücke bei y=4..6)
      { x: 17.5, y: 1, w: 0.5, h: 3, color: COLORS.wall },
      { x: 17.5, y: 6, w: 0.5, h: 1, color: COLORS.wall },

      // Trennwand oben|Verkauf (waagerecht bei y=7), Türlücke im Flur
      { x: 1, y: 7, w: 8, h: 0.5, color: COLORS.wall }, // unter Büro
      { x: 18, y: 7, w: 11, h: 0.5, color: COLORS.wall }, // unter Lager
      // (zwischen x=9..18 bleibt der Flur offen -> Durchgang zum Verkauf)
    ];
    walls.forEach((s) => {
      const rect = this.addSolid(s);
      // Schmaler heller Streifen an der Oberkante = Lichtkante, wirkt 3D.
      this.scene.add
        .rectangle(
          s.x * TILE,
          s.y * TILE,
          s.w * TILE,
          Math.min(6, s.h * TILE),
          COLORS.wallTop,
        )
        .setOrigin(0)
        .setDepth(DEPTH.furniture);
      // Dunkle Seitenkante = zweite Schattenseite, macht aus der Wand einen
      // "Klötzchen"-Block statt einer flachen Linie.
      this.addSideStrip(s.x, s.y, s.w, s.h, COLORS.wallSide, 4);
      void rect;
    });
  }

  // Baut Büro-Möbel + Lager-/Verkaufsregale. Gibt die Regale zurück, damit
  // OfficeScene ihren Füllstand an den Store koppeln kann.
  buildFurniture(): { lagerShelves: Shelf[]; shopShelves: Shelf[] } {
    // --- Büro: Schreibtisch + PC + Sofa + Pflanze ---
    this.addShadow(3, 2.5, 3, 1.2);
    this.addSolid({ x: 3, y: 2.5, w: 3, h: 1.2, color: COLORS.desk }).setVisible(false);
    const deskTs = this.scene.add
      .tileSprite(3 * TILE, 2.5 * TILE, 3 * TILE, 1.2 * TILE, 'rpg', 353)
      .setOrigin(0).setDepth(DEPTH.furniture);
    deskTs.setTileScale(TILE / 16, (1.2 * TILE) / 16);
    // Hellere Tischplatten-Kante (oben)
    this.scene.add
      .rectangle(3 * TILE, 2.5 * TILE, 3 * TILE, 0.35 * TILE, COLORS.deskTop)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.addSideStrip(3, 2.5, 3, 1.2, COLORS.shelfEdge, 4);
    // Monitor auf dem Schreibtisch (Standfuß + Gehäuse + Bildschirm)
    this.scene.add
      .rectangle(4.55 * TILE, 3.25 * TILE, 0.18 * TILE, 0.2 * TILE, COLORS.pc)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .rectangle(4.2 * TILE, 2.62 * TILE, 0.8 * TILE, 0.62 * TILE, COLORS.pc)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .rectangle(4.29 * TILE, 2.71 * TILE, 0.62 * TILE, 0.42 * TILE, COLORS.pcScreen)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);

    // Sofa mit zwei Kissen
    this.addShadow(6, 5, 2, 0.9);
    this.addSolid({ x: 6, y: 5, w: 2, h: 0.9, color: 0x5d4037 }); // Sofa-Korpus dunkelbraun
    this.scene.add
      .rectangle(6.1 * TILE, 5.12 * TILE, 0.85 * TILE, 0.66 * TILE, 0x8d6e63)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .rectangle(7.05 * TILE, 5.12 * TILE, 0.85 * TILE, 0.66 * TILE, 0x8d6e63)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.addSideStrip(6, 5, 2, 0.9, 0x3e2723, 4); // Sofa-Seitenkante (dunkler als Korpus)

    // Pflanze: Topf + runde Blätter
    this.addShadow(1.4, 5, 0.9, 0.9);
    this.addSolid({ x: 1.4, y: 5.45, w: 0.9, h: 0.45, color: 0x8d6e63 }); // Topf
    this.addSideStrip(1.4, 5.45, 0.9, 0.45, 0x5d4037, 3); // Topf-Seitenkante
    this.scene.add
      .circle(1.85 * TILE, 5.35 * TILE, 0.42 * TILE, 0x66bb6a)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .circle(1.65 * TILE, 5.15 * TILE, 0.26 * TILE, 0x81c784)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .circle(2.05 * TILE, 5.18 * TILE, 0.24 * TILE, 0x81c784)
      .setDepth(DEPTH.furniture);

    // --- Lager: senkrechte Regalreihen (zeigen Trockenware-Füllstand) ---
    const lagerShelves = [
      this.addShelf(19, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(21.5, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(24, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(26.5, 2, 0.8, 4, true, COLORS.goodsDry),
    ];

    // --- Verkaufsfläche: Kassen + waagerechte Regalreihen (Frischware) ---
    this.addCounter(3, 17.5, 2, 0.8); // Kasse 1
    this.addCounter(6, 17.5, 2, 0.8); // Kasse 2
    const shopShelves = [
      this.addShelf(4, 9.5, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(4, 12, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(4, 14.5, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(12, 9.5, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(12, 12, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(12, 14.5, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(20, 9.5, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(20, 12, 4, 0.8, false, COLORS.goodsFresh),
      this.addShelf(20, 14.5, 4, 0.8, false, COLORS.goodsFresh),
    ];

    return { lagerShelves, shopShelves };
  }

  // Pixel-Art-Texturen für Spieler + Kunden einmalig erzeugen.
  createSpriteTextures() {
    if (this.scene.textures.exists('spr-player')) return; // HMR-Guard

    // Pixel-Art-Karte: 12 × 20 px (bei Skala 2 → 24 × 40 px auf dem Bildschirm)
    // H=Haare, S=Haut, E=Auge, B=Shirt, b=Shirt-Schatten, G=Hose, g=Schuh
    const GRID = [
      '00HHHHHHHH00',
      '0HHHHHHHHHH0',
      '0HSSSSSSSSSH', // führt zu 11 Zeichen — Korrektur unten
      '0HESSHSSESH0',
      '0HSSSSSSSSSH',
      '00BBBBBBBBB0',
      '0bBBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      'bBBBBBBBBBBb',
      '0bBBBBBBBBb0',
      '00BBBBBBBBB0',
      '0GGGG00GGGG0',
      '0GGGG00GGGG0',
      '0GGGG00GGGG0',
      '0GGGG00GGGG0',
      '0GGGG00GGGG0',
      '0gGGGggGGGg0',
      '0gggg00gggg0',
    ];
    const PC: Record<string, string> = {
      H: '#3e2723', S: '#ffcc9c', E: '#263238',
      B: '#1e88e5', b: '#1565c0',
      G: '#455a64', g: '#1a1f23',
    };
    const W = 12, H = 20;
    const ct = this.scene.textures.createCanvas('spr-player', W, H)!;
    const ctx = ct.getContext() as CanvasRenderingContext2D;
    GRID.forEach((row, y) => {
      for (let x = 0; x < Math.min(row.length, W); x++) {
        const c = row[x];
        if (c === '0') continue;
        ctx.fillStyle = PC[c] ?? '#ff00ff';
        ctx.fillRect(x, y, 1, 1);
      }
    });
    ct.refresh();
  }

  // Spielfigur als Pixel-Art-Sprite (ersetzt den alten Formen-Container).
  buildAvatar(): { avatarSprite: Phaser.GameObjects.Image; avatarShadow: Phaser.GameObjects.Ellipse } {
    const avatarShadow = this.scene.add
      .ellipse(4 * TILE, 5.5 * TILE + 14, 28, 10, 0x000000, 0.13)
      .setDepth(DEPTH.shadow);

    const avatarSprite = this.scene.add
      .image(4 * TILE, 5.5 * TILE, 'spr-player')
      .setScale(2)
      .setOrigin(0.5, 0.85) // Füße unten zentriert
      .setDepth(DEPTH.avatar);

    return { avatarSprite, avatarShadow };
  }

  // STRASSE: Asphalt-Boden + Gehweg + 3 Konkurrenten-Fassaden.
  // Gibt die Stärke-Balken zurück (id → Rectangle), damit OfficeScene sie
  // live an den Konkurrenz-Store koppeln kann.
  buildStreet(): Record<string, Phaser.GameObjects.Rectangle> {
    const streetY = 19; // Straße beginnt bei Tile 19
    const compStrengthBars: Record<string, Phaser.GameObjects.Rectangle> = {};

    // Asphalt-Boden (dunkelgrau)
    this.scene.add.rectangle(15 * TILE, (streetY + 2.5) * TILE, 28 * TILE, 5 * TILE, 0x546e7a)
      .setDepth(DEPTH.floor);
    // Gehweg (hellgrau) — ein schmaler Streifen direkt hinter dem Laden
    this.scene.add.rectangle(15 * TILE, (streetY + 0.6) * TILE, 28 * TILE, 1.2 * TILE, 0xb0bec5)
      .setDepth(DEPTH.floor);
    // Bürgersteig-Markierung (weiße Linie)
    this.scene.add.rectangle(15 * TILE, (streetY + 1.2) * TILE, 28 * TILE, 4, 0xffffff)
      .setDepth(DEPTH.grid).setAlpha(0.5);

    // Straßen-Label
    this.scene.add.text(15 * TILE, (streetY + 0.25) * TILE, 'STRASSE', {
      fontSize: '13px', color: '#78909c', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(DEPTH.furniture);

    // 3 Konkurrenten-Läden
    const stores = [
      { id: "sparfuchs",  name: "Sparfuchs",  type: "Discounter 🏷️", x: 4,    color: 0xef5350 },
      { id: "preisland",  name: "Preisland",  type: "Volumen 📦",     x: 12.5, color: 0xffa726 },
      { id: "naturpur",   name: "NaturPur",   type: "Bio 🌿",         x: 21,   color: 0x66bb6a },
    ];

    for (const s of stores) {
      const cx = s.x * TILE;
      const cy = (streetY + 1.5) * TILE;
      const bw = 7 * TILE;
      const bh = 2.5 * TILE;

      // Gebäude-Fassade
      this.scene.add.rectangle(cx + bw / 2, cy + bh / 2, bw, bh, 0xeceff1)
        .setOrigin(0).setDepth(DEPTH.furniture - 1);
      // Seitenkante rechts = leichter Gebäude-Tiefe-Effekt (rein dekorativ)
      this.scene.add.rectangle(cx + bw / 2 + bw - 5, cy + bh / 2, 5, bh, 0xcfd8dc)
        .setOrigin(0).setDepth(DEPTH.furniture);
      // Farbiger Akzentstreifen oben (Markenfarbe)
      this.scene.add.rectangle(cx + bw / 2, cy + 0.35 * TILE / 2, bw, 0.35 * TILE, s.color)
        .setOrigin(0).setDepth(DEPTH.furniture);
      // Fenster-Rechteck
      this.scene.add.rectangle(cx + bw / 2, cy + 1 * TILE, bw - TILE, 1.2 * TILE, 0xb3e5fc)
        .setOrigin(0).setDepth(DEPTH.furniture);

      // Name + Typ
      this.scene.add.text(cx + bw / 2, cy + 0.35 * TILE / 2, s.name, {
        fontSize: '12px', color: '#fff', fontStyle: 'bold',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH.avatar);
      this.scene.add.text(cx + bw / 2, cy + 2.1 * TILE, s.type, {
        fontSize: '10px', color: '#546e7a',
      }).setOrigin(0.5, 0).setDepth(DEPTH.furniture);

      // Stärke-Balken (Hintergrund + farbiger Füllstand)
      this.scene.add.rectangle(cx + bw / 2, cy + 2.6 * TILE, bw - TILE * 0.5, 8, 0xd0d0d0)
        .setOrigin(0).setDepth(DEPTH.furniture);
      const bar = this.scene.add.rectangle(cx + (bw - TILE * 0.5) / 2 * 0, cy + 2.6 * TILE, 0, 8, s.color)
        .setOrigin(0).setDepth(DEPTH.furniture);
      // Korrektur: left-align bei x + 0.25*TILE
      bar.setX(cx + 0.25 * TILE);
      compStrengthBars[s.id] = bar;

      // Stärke-Label
      this.scene.add.text(cx + 0.25 * TILE, cy + 2.75 * TILE, '', {
        fontSize: '9px', color: '#546e7a',
      }).setName(`comp-label-${s.id}`).setDepth(DEPTH.avatar);
    }

    return compStrengthBars;
  }

  // Eine Kasse: Korpus + Kenney-Sprite + heller Streifen + kleines Register-Display.
  private addCounter(x: number, y: number, w: number, h: number) {
    this.addShadow(x, y, w, h);
    this.addSolid({ x, y, w, h, color: COLORS.counter }).setVisible(false);
    const cTs = this.scene.add
      .tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, 'rpg', 353)
      .setOrigin(0).setDepth(DEPTH.furniture);
    cTs.setTileScale(TILE / 16, (h * TILE) / 16);
    this.scene.add
      .rectangle(x * TILE, y * TILE, w * TILE, 0.22 * TILE, COLORS.counterTop)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.addSideStrip(x, y, w, h, COLORS.counterSide, 4);
    // kleines „Display" der Kasse
    this.scene.add
      .rectangle((x + 0.25) * TILE, (y + 0.28) * TILE, 0.5 * TILE, 0.32 * TILE, 0x263238)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.scene.add
      .rectangle((x + 0.32) * TILE, (y + 0.34) * TILE, 0.36 * TILE, 0.2 * TILE, 0x80cbc4)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
  }

  // Ein Regal = Schatten + grauer Korpus (Kollision) + Kenney-Sprite + Kante + Fachböden
  // + farbige Füll-Fläche (zeigt den Bestand).
  private addShelf(
    x: number,
    y: number,
    w: number,
    h: number,
    vertical: boolean,
    goodsColor: number,
  ): Shelf {
    this.addShadow(x, y, w, h);
    this.addSolid({ x, y, w, h, color: COLORS.shelf }).setVisible(false);

    // Kenney-Sprite als Regal-Optik (über Solid, unter der Füll-Fläche)
    const ts = this.scene.add
      .tileSprite(x * TILE, y * TILE, w * TILE, h * TILE, 'rpg', 73)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    ts.setTileScale(
      vertical ? (w * TILE) / 16 : TILE / 16,
      vertical ? TILE / 16 : (h * TILE) / 16,
    );

    // Heller Oberkanten-Streifen + dunkle Seitenkante = "Klötzchen"-Look,
    // wie bei Schreibtisch/Kasse (rein dekorativ, Füllstand bleibt unberührt).
    this.scene.add
      .rectangle(x * TILE, y * TILE, w * TILE, Math.min(4, h * TILE), COLORS.shelfTop)
      .setOrigin(0)
      .setDepth(DEPTH.furniture + 1);
    this.addSideStrip(x, y, w, h, COLORS.shelfEdge, 4);

    // farbige Füll-Fläche (wird in setShelfFill bewegt/skaliert)
    const fill = this.scene.add
      .rectangle(x * TILE, y * TILE, 1, 1, goodsColor)
      .setOrigin(0)
      .setDepth(DEPTH.furniture)
      .setVisible(false);

    // Rahmen + Fachböden als dünne Linien darüber (rein dekorativ).
    const g = this.scene.add.graphics().setDepth(DEPTH.furniture + 1);
    g.lineStyle(2, COLORS.shelfEdge, 1);
    g.strokeRect(x * TILE, y * TILE, w * TILE, h * TILE);
    if (vertical) {
      for (let i = 1; i < h; i++) {
        g.lineBetween(x * TILE, (y + i) * TILE, (x + w) * TILE, (y + i) * TILE);
      }
    } else {
      const segs = Math.round(w);
      for (let i = 1; i < segs; i++) {
        g.lineBetween((x + i) * TILE, y * TILE, (x + i) * TILE, (y + h) * TILE);
      }
    }

    return { x, y, w, h, vertical, fill };
  }

  // Weicher Schatten leicht versetzt unter ein Möbelstück.
  private addShadow(x: number, y: number, w: number, h: number) {
    this.scene.add
      .rectangle(
        x * TILE + 3,
        y * TILE + 4,
        w * TILE,
        h * TILE,
        COLORS.shadow,
        0.1,
      )
      .setOrigin(0)
      .setDepth(DEPTH.shadow);
  }

  // Dunkler Streifen an der rechten Kante — rein dekorativ, macht aus einem
  // flachen Rechteck einen "Klötzchen"-Look (sichtbare Seitenfläche), ohne
  // dass sich Position/Größe/Kollision des eigentlichen Objekts ändert.
  private addSideStrip(x: number, y: number, w: number, h: number, color: number, depth = 5) {
    this.scene.add
      .rectangle((x + w) * TILE - depth, y * TILE, depth, h * TILE, color)
      .setOrigin(0)
      .setDepth(DEPTH.furniture + 1);
  }

  private addSolid(s: Solid) {
    const rect = this.scene.add
      .rectangle(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE, s.color)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.solids.add(rect);
    return rect;
  }

  addRoomLabel(text: string, x: number, y: number) {
    return this.scene.add
      .text(x, y, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#455a64",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.avatar);
  }
}
