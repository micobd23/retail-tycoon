import Phaser from "phaser";
import { EventBus, Events } from "../EventBus";
import {
  useEconomy,
  usedCapacity,
  capacityOf,
  projectDay,
} from "../../economy/economyStore";

// ---------------------------------------------------------------------------
// OfficeScene — die begehbare Bürowelt (Meilenstein 1).
//
// Die Welt ist aus Formen gebaut, jetzt aber „aufpoliert": weiche Schatten,
// Raster-Boden, eine echte kleine Spielfigur, Möbel mit Kanten/Details.
//
// WICHTIG für späteren Kenney-Umbau: Jedes sichtbare Element entsteht in einer
// klar abgegrenzten Hilfsfunktion (addShelf, buildAvatar, buildFurniture …).
// Beim Umstieg auf Sprites tauscht man dort nur das „Zeichnen" aus — die
// Spiellogik (Kollision, Interaktion, Füllstände) bleibt komplett gleich.
// ---------------------------------------------------------------------------

// Farbpalette (modern-flat) — pro Material ein Grundton + hellere/dunklere
// Varianten für Kanten und Schatten, das gibt der flachen Optik Tiefe.
const COLORS = {
  wall: 0x37474f, // Wände: dunkles Blaugrau
  wallTop: 0x546e7a, // Wand-Oberkante (Highlight)
  floorOffice: 0xeceff1, // Büro: hell
  floorStorage: 0xfff3e0, // Lager: warmes Beige
  floorShop: 0xe8f5e9, // Verkauf: helles Grün
  floorHall: 0xf5f5f5, // Flur: grau-weiß
  grid: 0x000000, // Boden-Raster (mit niedriger Deckkraft)
  desk: 0x8d6e63, // Schreibtisch: Holz
  deskTop: 0xa1887f, // Tischplatte-Highlight
  pc: 0x263238, // Monitor: fast schwarz
  pcScreen: 0x4fc3f7, // Bildschirm: hellblau
  shelf: 0x90a4ae, // Regal: grau
  shelfEdge: 0x607d8b, // Regal-Kante
  counter: 0x607d8b, // Kasse: blaugrau
  counterTop: 0x78909c, // Kassen-Highlight
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
type Shelf = {
  x: number;
  y: number;
  w: number;
  h: number;
  vertical: boolean;
  fill: Phaser.GameObjects.Rectangle;
};

// Größen
const TILE = 40; // Basis-Raster
const SPEED = 220;

// Sichtbarer Tagesablauf: Dauer + Kunden-Spawn-Takt + Lauftempo (leicht änderbar).
const DAY_DURATION_MS = 18000; // ~18 Sek. pro Tag
const CUSTOMER_SPAWN_MS = 1100; // alle ~1,1 Sek. kommt ein Kunde
const CUSTOMER_SPEED = 120; // px/Sek. (Spieler läuft 220) — gemütliches Tempo
const MAX_CUSTOMERS = 12; // mehr werden nicht gleichzeitig erzeugt
const CUSTOMER_COLORS = [0xef5350, 0xab47bc, 0x5c6bc0, 0x26a69a, 0xffa726, 0xec407a];

// Freie Lauf-Bahnen der Verkaufsfläche (in Tiles), damit Kunden NICHT durch
// Regale laufen: senkrechte Gänge zwischen/neben den Regalblöcken + waagerechte
// Bänder zwischen den Regalreihen. Bewegung immer nur entlang einer Achse.
const AISLES_X = [2.5, 10, 18, 26]; // senkrechte Gänge (kein Regal an diesem x)
const SHOP_BANDS_Y = [11.2, 13.6]; // waagerechte Gänge zwischen den Regalreihen
const TOP_LANE_Y = 8.5; // Bahn oben (zwischen Wand und erster Regalreihe)
const TILL_LANE_Y = 16.5; // Bahn vor den Kassen
const ENTRANCE_X = 13.5; // Eingang (Durchgang aus dem Flur)
const ENTRANCE_Y = 7.6;

// Tiefen-Ebenen (z-Reihenfolge), damit die Figur immer oben läuft.
const DEPTH = { floor: 0, grid: 1, shadow: 2, furniture: 3, avatar: 20 } as const;

// Ein Rechteck-Hindernis (Wand/Möbel) mit Kollision.
type Solid = { x: number; y: number; w: number; h: number; color: number };

export class OfficeScene extends Phaser.Scene {
  // Physik-Körper des Spielers (unsichtbar) — trägt Kollision & Bewegung.
  private player!: Phaser.GameObjects.Rectangle;
  // Sichtbare Figur, die dem Körper folgt (Schatten, Beine, Shirt, Kopf …).
  private avatar!: Phaser.GameObjects.Container;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private solids!: Phaser.Physics.Arcade.StaticGroup;

  // Zone am Schreibtisch, in der "[E] PC öffnen" erscheint.
  private deskZone!: Phaser.GameObjects.Zone;
  private nearDesk = false;

  // true, solange der PC offen ist -> Spieler bewegt sich nicht.
  private frozen = false;

  // Regale mit Füllstand + Abo auf den Wirtschafts-Store.
  private lagerShelves: Shelf[] = [];
  private shopShelves: Shelf[] = [];
  private lagerLabel?: Phaser.GameObjects.Text;
  private shopLabel?: Phaser.GameObjects.Text;
  private stockUnsub?: () => void;
  // Lebt diese Szene noch? Schützt das Store-Abo davor, nach dem Zerstören
  // (z.B. React StrictMode-Doppelmount / HMR) auf tote Objekte zuzugreifen.
  private alive = true;

  // --- Sichtbarer Tagesablauf -------------------------------------------
  private dayActive = false; // läuft der Tag gerade ab?
  private dayStart = 0; // Zeitstempel (this.time.now) beim Start
  private daySpawnTimer?: Phaser.Time.TimerEvent; // erzeugt Kunden im Takt
  private customers: Phaser.GameObjects.Container[] = []; // laufende Kunden
  // Belegung der Flächen zu Tagesbeginn/-ende (für das Live-Leeren der Regale).
  private dayStartUsed = { trocken: 0, frisch: 0 };
  private dayEndUsed = { trocken: 0, frisch: 0 };
  private dayCap = { trocken: 1, frisch: 1 };

  constructor() {
    super("OfficeScene");
  }

  create() {
    const worldW = 30 * TILE; // 1200
    const worldH = 20 * TILE; // 800

    this.cameras.main.setBackgroundColor("#cfd8dc");
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.drawFloors();
    this.drawFloorGrid(worldW, worldH);
    this.solids = this.physics.add.staticGroup();
    this.buildWalls();
    this.buildFurniture();
    this.buildAvatar();

    // --- Spieler-Physik (unsichtbarer Körper) ---
    this.player = this.add.rectangle(4 * TILE, 5.5 * TILE, 22, 24, COLORS.shirt);
    this.player.setVisible(false);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);

    this.physics.add.collider(this.player, this.solids);

    // --- Kamera folgt dem Spieler ---
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // --- Steuerung ---
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >;

    // --- Interaktionszone am Schreibtisch ---
    // (Position passt zum Schreibtisch in buildFurniture)
    this.deskZone = this.add.zone(4.5 * TILE, 3.4 * TILE, 3 * TILE, 3 * TILE);
    this.physics.add.existing(this.deskZone);
    (this.deskZone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // [E] am Schreibtisch -> RetailOS hochfahren und Welt einfrieren.
    this.input.keyboard!.on("keydown-E", () => {
      // Während der Tag abläuft, ist der Schreibtisch gesperrt.
      if (this.nearDesk && !this.frozen && !this.dayActive) {
        this.frozen = true;
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0);
        EventBus.emit(Events.OpenComputer);
      }
    });

    // React meldet zurück, dass der PC verlassen wurde -> Welt freigeben.
    EventBus.on(Events.CloseComputer, this.unfreeze, this);
    // „Tag weiter" -> sichtbaren Tagesablauf starten / überspringen.
    EventBus.on(Events.StartDay, this.startDay, this);
    EventBus.on(Events.SkipDay, this.skipDay, this);
    // Aufräumen, falls die Szene neu gestartet wird (z.B. Hot-Reload).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.CloseComputer, this.unfreeze, this);
      EventBus.off(Events.StartDay, this.startDay, this);
      EventBus.off(Events.SkipDay, this.skipDay, this);
    });

    // Raum-Beschriftungen
    this.addRoomLabel("BÜRO", 5 * TILE, 1.4 * TILE);
    this.lagerLabel = this.addRoomLabel("LAGER", 23.5 * TILE, 1.4 * TILE);
    this.shopLabel = this.addRoomLabel("VERKAUFSFLÄCHE", 15 * TILE, 8.4 * TILE);
    this.addRoomLabel("FLUR", 13.5 * TILE, 1.4 * TILE);

    // Regale an den aktuellen Bestand koppeln + bei Änderungen aktualisieren.
    this.refreshStockVisual();
    this.stockUnsub = useEconomy.subscribe((s) =>
      this.refreshStockVisual(s.batches),
    );
    const cleanup = () => {
      this.alive = false;
      this.stockUnsub?.();
      this.stockUnsub = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private unfreeze() {
    this.frozen = false;
  }

  // Füllstand der Regale aus dem Wirtschafts-Store ableiten.
  private refreshStockVisual(
    batches = useEconomy.getState().batches,
  ) {
    if (!this.alive) return; // tote Szene ignorieren
    const used = usedCapacity(batches);
    const cap = capacityOf(useEconomy.getState().upgrades);
    const dryRatio = Math.min(1, used.trocken / cap.trocken);
    const freshRatio = Math.min(1, used.frisch / cap.frisch);

    for (const sh of this.lagerShelves) this.setShelfFill(sh, dryRatio);
    for (const sh of this.shopShelves) this.setShelfFill(sh, freshRatio);

    if (this.lagerLabel)
      this.lagerLabel.setText(`LAGER · ${Math.round(dryRatio * 100)} %`);
    if (this.shopLabel)
      this.shopLabel.setText(`VERKAUFSFLÄCHE · ${Math.round(freshRatio * 100)} %`);
  }

  // Größe/Position der Füll-Fläche eines Regals an das Verhältnis anpassen.
  private setShelfFill(sh: Shelf, ratio: number) {
    if (!sh.fill || !sh.fill.scene) return; // zerstörtes Objekt überspringen
    if (ratio <= 0) {
      sh.fill.setVisible(false);
      return;
    }
    sh.fill.setVisible(true);
    // Etwas Innenrand, damit der graue Regalrahmen sichtbar bleibt.
    const pad = 3;
    if (sh.vertical) {
      // Lager: von unten nach oben füllen.
      const fullH = sh.h * TILE - pad * 2;
      const h = fullH * ratio;
      sh.fill.setSize(sh.w * TILE - pad * 2, h);
      sh.fill.setPosition(sh.x * TILE + pad, (sh.y + sh.h) * TILE - pad - h);
    } else {
      // Verkauf: von links nach rechts füllen.
      const fullW = sh.w * TILE - pad * 2;
      const w = fullW * ratio;
      sh.fill.setSize(w, sh.h * TILE - pad * 2);
      sh.fill.setPosition(sh.x * TILE + pad, sh.y * TILE + pad);
    }
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    // PC offen? Dann keine Bewegung/Interaktion verarbeiten.
    if (this.frozen) {
      this.syncAvatar();
      return;
    }

    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;

    if (left) body.setVelocityX(-SPEED);
    else if (right) body.setVelocityX(SPEED);
    if (up) body.setVelocityY(-SPEED);
    else if (down) body.setVelocityY(SPEED);

    // Diagonale nicht schneller machen
    body.velocity.normalize().scale(SPEED);

    // Sichtbare Figur dem Körper folgen lassen + Blickrichtung spiegeln.
    this.syncAvatar(left, right);

    // Läuft der Tag? Dann Fortschritt fortschreiben und Schreibtisch ruhen lassen.
    if (this.dayActive) {
      this.tickDay();
      return;
    }

    // Prüfen, ob der Spieler nahe am Schreibtisch steht
    const overlapping = Phaser.Geom.Rectangle.Overlaps(
      this.deskZone.getBounds(),
      this.player.getBounds(),
    );
    if (overlapping !== this.nearDesk) {
      this.nearDesk = overlapping;
      EventBus.emit(Events.InteractionChanged, {
        prompt: overlapping ? "[E] PC öffnen" : null,
      });
    }
  }

  // --- Sichtbarer Tagesablauf -------------------------------------------

  // „Tag weiter" gedrückt: Welt freigeben, Kunden strömen lassen, Regale leeren.
  private startDay() {
    if (this.dayActive || !this.alive) return;
    this.dayActive = true;
    this.frozen = false;
    this.nearDesk = false;
    EventBus.emit(Events.InteractionChanged, { prompt: null });

    // Tag vorab berechnen -> Start-/Endbelegung der Flächen für das Leeren.
    const proj = projectDay();
    const st = useEconomy.getState();
    const used = usedCapacity(st.batches);
    this.dayCap = capacityOf(st.upgrades);
    this.dayStartUsed = { ...used };
    this.dayEndUsed = {
      trocken: Math.max(0, used.trocken - proj.soldTrocken),
      frisch: Math.max(0, used.frisch - proj.soldFrisch),
    };

    this.dayStart = this.time.now;
    this.spawnCustomer();
    this.daySpawnTimer = this.time.addEvent({
      delay: CUSTOMER_SPAWN_MS,
      loop: true,
      callback: () => this.spawnCustomer(),
    });
  }

  // Tag überspringen -> sofort beenden.
  private skipDay() {
    if (this.dayActive) this.finishDay();
  }

  // Jeden Frame während des Tages: Regale anteilig leeren.
  private tickDay() {
    const t = Phaser.Math.Clamp(
      (this.time.now - this.dayStart) / DAY_DURATION_MS,
      0,
      1,
    );
    const dry = Phaser.Math.Linear(this.dayStartUsed.trocken, this.dayEndUsed.trocken, t);
    const fresh = Phaser.Math.Linear(this.dayStartUsed.frisch, this.dayEndUsed.frisch, t);
    const dryRatio = Math.min(1, dry / this.dayCap.trocken);
    const freshRatio = Math.min(1, fresh / this.dayCap.frisch);
    for (const sh of this.lagerShelves) this.setShelfFill(sh, dryRatio);
    for (const sh of this.shopShelves) this.setShelfFill(sh, freshRatio);
    if (this.lagerLabel)
      this.lagerLabel.setText(`LAGER · ${Math.round(dryRatio * 100)} %`);
    if (this.shopLabel)
      this.shopLabel.setText(`VERKAUFSFLÄCHE · ${Math.round(freshRatio * 100)} %`);

    if (t >= 1) this.finishDay();
  }

  // Tag beenden: Kunden + Timer weg, Welt wieder einfrieren, React abrechnen lassen.
  private finishDay() {
    if (!this.dayActive) return;
    this.dayActive = false;
    this.frozen = true;
    this.daySpawnTimer?.remove();
    this.daySpawnTimer = undefined;
    for (const c of this.customers) c.destroy();
    this.customers = [];
    // React rechnet jetzt ab (advanceDay) -> Recap; die Regale aktualisiert
    // gleich das Store-Abo auf den echten Endbestand.
    EventBus.emit(Events.DayDone);
  }

  // Ein Kunde: betritt die Fläche, geht (NUR durch die Gänge) zu einem Regal,
  // dann zur Kasse und wieder hinaus. Bewegt sich immer nur entlang einer Achse,
  // damit er nie diagonal durch ein Regal läuft.
  private spawnCustomer() {
    if (!this.dayActive || !this.alive) return;
    if (this.customers.length >= MAX_CUSTOMERS) return;

    const color = Phaser.Utils.Array.GetRandom(CUSTOMER_COLORS);
    const body = this.add.ellipse(0, 0, 18, 18, color);
    body.setStrokeStyle(2, 0x37474f);
    const head = this.add.circle(0, -9, 6, 0xffcc9c);
    const cust = this.add
      .container(ENTRANCE_X * TILE, ENTRANCE_Y * TILE, [body, head])
      .setDepth(DEPTH.avatar - 1);
    this.customers.push(cust);

    // Zufällige Gänge/Bänder wählen.
    const a1 = Phaser.Utils.Array.GetRandom(AISLES_X);
    const a3 = Phaser.Utils.Array.GetRandom(AISLES_X);
    const band = Phaser.Utils.Array.GetRandom(SHOP_BANDS_Y);
    const tillX = Phaser.Math.Between(4, 7);

    // Wegpunkte (in Tiles) — je zwei aufeinanderfolgende teilen x ODER y.
    const path: Array<[number, number]> = [
      [ENTRANCE_X, TOP_LANE_Y], // in die obere Bahn
      [a1, TOP_LANE_Y], // an einen senkrechten Gang
      [a1, band], // hinunter zum Regal-Band  -> Stopp (einkaufen)
      [a1, TILL_LANE_Y], // weiter zur Kassen-Bahn
      [tillX, TILL_LANE_Y], // zur Kasse        -> Stopp (bezahlen)
      [a3, TILL_LANE_Y], // zurück zu einem Gang
      [a3, TOP_LANE_Y], // hinauf in die obere Bahn
      [ENTRANCE_X, TOP_LANE_Y], // zurück zum Eingang
      [ENTRANCE_X, ENTRANCE_Y], // hinaus
    ];
    const stops = new Set([2, 4]); // nach diesen Wegpunkten kurz verweilen

    // Tweens bauen: Dauer = Strecke / Tempo (gleichmäßiges Gehen).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweens: any[] = [];
    let prevX = ENTRANCE_X * TILE;
    let prevY = ENTRANCE_Y * TILE;
    path.forEach(([tx, ty], i) => {
      const x = tx * TILE;
      const y = ty * TILE;
      const dist = Phaser.Math.Distance.Between(prevX, prevY, x, y);
      tweens.push({
        x,
        y,
        duration: Math.max(120, (dist / CUSTOMER_SPEED) * 1000),
        ease: "Linear",
      });
      if (stops.has(i)) tweens.push({ x, y, duration: 500 }); // verweilen
      prevX = x;
      prevY = y;
    });

    this.tweens.chain({
      targets: cust,
      tweens,
      onComplete: () => {
        cust.destroy();
        this.customers = this.customers.filter((c) => c !== cust);
      },
    });
  }

  // Sichtbare Figur an die Position des Physik-Körpers setzen.
  private syncAvatar(left = false, right = false) {
    if (!this.avatar) return;
    this.avatar.setPosition(this.player.x, this.player.y);
    // Nach links laufen -> Figur leicht spiegeln (kleiner Lebendigkeits-Effekt).
    if (left) this.avatar.setScale(-1, 1);
    else if (right) this.avatar.setScale(1, 1);
  }

  // --- Hilfsfunktionen ---------------------------------------------------

  private drawFloors() {
    // Böden als große farbige Rechtecke (kein Hindernis).
    const floor = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
    ) =>
      this.add
        .rectangle(x * TILE, y * TILE, w * TILE, h * TILE, color)
        .setOrigin(0)
        .setDepth(DEPTH.floor);

    floor(1, 1, 8, 6, COLORS.floorOffice); // Büro (oben links, jetzt kleiner)
    floor(18, 1, 11, 6, COLORS.floorStorage); // Lager (oben rechts)
    floor(9, 1, 9, 6, COLORS.floorHall); // Flur (Mitte, oberes Band)
    floor(1, 7, 28, 12, COLORS.floorShop); // Verkauf (unten, jetzt viel größer)
  }

  // Dezentes Fliesen-Raster über den ganzen Boden — gibt Größe & Tiefe.
  private drawFloorGrid(worldW: number, worldH: number) {
    const g = this.add.graphics().setDepth(DEPTH.grid);
    g.lineStyle(1, COLORS.grid, 0.05);
    for (let x = TILE; x < worldW; x += TILE) {
      g.lineBetween(x, TILE, x, worldH - TILE);
    }
    for (let y = TILE; y < worldH; y += TILE) {
      g.lineBetween(TILE, y, worldW - TILE, y);
    }
  }

  private buildWalls() {
    // Außenwände + Trennwände mit Türöffnungen (Lücken).
    const walls: Solid[] = [
      // Außenrahmen
      { x: 1, y: 1, w: 28, h: 0.5, color: COLORS.wall }, // oben
      { x: 1, y: 18.5, w: 28, h: 0.5, color: COLORS.wall }, // unten
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
      this.add
        .rectangle(
          s.x * TILE,
          s.y * TILE,
          s.w * TILE,
          Math.min(6, s.h * TILE),
          COLORS.wallTop,
        )
        .setOrigin(0)
        .setDepth(DEPTH.furniture);
      void rect;
    });
  }

  private buildFurniture() {
    // --- Büro: Schreibtisch + PC + Sofa + Pflanze ---
    this.addShadow(3, 2.5, 3, 1.2);
    this.addSolid({ x: 3, y: 2.5, w: 3, h: 1.2, color: COLORS.desk }); // Schreibtisch
    // Hellere Tischplatten-Kante (oben)
    this.add
      .rectangle(3 * TILE, 2.5 * TILE, 3 * TILE, 0.35 * TILE, COLORS.deskTop)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    // Monitor auf dem Schreibtisch (Standfuß + Gehäuse + Bildschirm)
    this.add
      .rectangle(4.55 * TILE, 3.25 * TILE, 0.18 * TILE, 0.2 * TILE, COLORS.pc)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.furniture);
    this.add
      .rectangle(4.2 * TILE, 2.62 * TILE, 0.8 * TILE, 0.62 * TILE, COLORS.pc)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.add
      .rectangle(4.29 * TILE, 2.71 * TILE, 0.62 * TILE, 0.42 * TILE, COLORS.pcScreen)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);

    // Sofa mit zwei Kissen
    this.addShadow(6, 5, 2, 0.9);
    this.addSolid({ x: 6, y: 5, w: 2, h: 0.9, color: 0x90a4ae }); // Sofa-Korpus
    this.add
      .rectangle(6.1 * TILE, 5.12 * TILE, 0.85 * TILE, 0.66 * TILE, 0xb0bec5)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.add
      .rectangle(7.05 * TILE, 5.12 * TILE, 0.85 * TILE, 0.66 * TILE, 0xb0bec5)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);

    // Pflanze: Topf + runde Blätter
    this.addShadow(1.4, 5, 0.9, 0.9);
    this.addSolid({ x: 1.4, y: 5.45, w: 0.9, h: 0.45, color: 0x8d6e63 }); // Topf
    this.add
      .circle(1.85 * TILE, 5.35 * TILE, 0.42 * TILE, 0x66bb6a)
      .setDepth(DEPTH.furniture);
    this.add
      .circle(1.65 * TILE, 5.15 * TILE, 0.26 * TILE, 0x81c784)
      .setDepth(DEPTH.furniture);
    this.add
      .circle(2.05 * TILE, 5.18 * TILE, 0.24 * TILE, 0x81c784)
      .setDepth(DEPTH.furniture);

    // --- Lager: senkrechte Regalreihen (zeigen Trockenware-Füllstand) ---
    this.lagerShelves = [
      this.addShelf(19, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(21.5, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(24, 2, 0.8, 4, true, COLORS.goodsDry),
      this.addShelf(26.5, 2, 0.8, 4, true, COLORS.goodsDry),
    ];

    // --- Verkaufsfläche: Kassen + waagerechte Regalreihen (Frischware) ---
    this.addCounter(3, 17.5, 2, 0.8); // Kasse 1
    this.addCounter(6, 17.5, 2, 0.8); // Kasse 2
    this.shopShelves = [
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
  }

  // Die sichtbare Spielfigur als Container aus einfachen Formen.
  // (Beim Kenney-Umbau: hier statt der Formen ein Sprite + Animationen setzen.)
  private buildAvatar() {
    const parts: Phaser.GameObjects.GameObject[] = [];
    // weicher Schatten unter den Füßen
    parts.push(this.add.ellipse(0, 16, 30, 11, COLORS.shadow, 0.14));
    // Beine
    parts.push(this.add.rectangle(-5, 10, 7, 12, COLORS.legs));
    parts.push(this.add.rectangle(5, 10, 7, 12, COLORS.legs));
    // Körper / Shirt
    const shirt = this.add.rectangle(0, 2, 24, 22, COLORS.shirt);
    shirt.setStrokeStyle(2, COLORS.shirtEdge);
    parts.push(shirt);
    // Kopf
    const head = this.add.circle(0, -14, 11, COLORS.skin);
    head.setStrokeStyle(1.5, COLORS.skinEdge);
    parts.push(head);
    // Haare (Halbkreis oben auf dem Kopf)
    const hair = this.add.arc(0, -14, 11, 180, 360, false, COLORS.hair);
    parts.push(hair);
    // Augen
    parts.push(this.add.circle(-4, -13, 1.6, 0x37474f));
    parts.push(this.add.circle(4, -13, 1.6, 0x37474f));

    this.avatar = this.add
      .container(4 * TILE, 5.5 * TILE, parts)
      .setDepth(DEPTH.avatar);
  }

  // Eine Kasse: Korpus + heller Streifen + kleines Register-Display.
  private addCounter(x: number, y: number, w: number, h: number) {
    this.addShadow(x, y, w, h);
    this.addSolid({ x, y, w, h, color: COLORS.counter });
    this.add
      .rectangle(x * TILE, y * TILE, w * TILE, 0.22 * TILE, COLORS.counterTop)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    // kleines „Display" der Kasse
    this.add
      .rectangle((x + 0.25) * TILE, (y + 0.28) * TILE, 0.5 * TILE, 0.32 * TILE, 0x263238)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.add
      .rectangle((x + 0.32) * TILE, (y + 0.34) * TILE, 0.36 * TILE, 0.2 * TILE, 0x80cbc4)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
  }

  // Ein Regal = Schatten + grauer Korpus (Kollision) + Kante + Fachböden
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
    this.addSolid({ x, y, w, h, color: COLORS.shelf });

    // farbige Füll-Fläche (wird in setShelfFill bewegt/skaliert)
    const fill = this.add
      .rectangle(x * TILE, y * TILE, 1, 1, goodsColor)
      .setOrigin(0)
      .setDepth(DEPTH.furniture)
      .setVisible(false);

    // Rahmen + Fachböden als dünne Linien darüber (rein dekorativ).
    const g = this.add.graphics().setDepth(DEPTH.furniture + 1);
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
    this.add
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

  private addSolid(s: Solid) {
    const rect = this.add
      .rectangle(s.x * TILE, s.y * TILE, s.w * TILE, s.h * TILE, s.color)
      .setOrigin(0)
      .setDepth(DEPTH.furniture);
    this.solids.add(rect);
    return rect;
  }

  private addRoomLabel(text: string, x: number, y: number) {
    return this.add
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
