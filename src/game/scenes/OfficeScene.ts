import Phaser from "phaser";
import { EventBus, Events } from "../EventBus";
import {
  useEconomy,
  usedCapacity,
  capacityOf,
  projectDay,
  themeFloorTint,
  type StoreTheme,
} from "../../economy/economyStore";
import { useCompetitor } from "../../economy/competitorStore";
import { SceneBuilder, COLORS, TILE, DEPTH, type Shelf } from "./sceneBuilder";

// ---------------------------------------------------------------------------
// OfficeScene — die begehbare Bürowelt (Meilenstein 1).
//
// Welt-Aufbau (Böden, Wände, Möbel, Regale, Sprites) lebt in sceneBuilder.ts —
// diese Datei enthält nur noch Spiellogik: Bewegung/Kollision, Interaktion
// am Schreibtisch, den sichtbaren Tagesablauf (Kunden, Regale leeren) und die
// Anbindung an die Zustand-Stores (Wirtschaft, Konkurrenz).
// ---------------------------------------------------------------------------

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

export class OfficeScene extends Phaser.Scene {
  // Physik-Körper des Spielers (unsichtbar) — trägt Kollision & Bewegung.
  private player!: Phaser.GameObjects.Rectangle;
  // Sichtbare Figur: Pixel-Art-Sprite + weicher Schatten darunter.
  private avatarSprite!: Phaser.GameObjects.Image;
  private avatarShadow!: Phaser.GameObjects.Ellipse;
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

  // Ladengestaltung: Boden der Verkaufsfläche für Farbwechsel per Theme.
  private shopFloorSprite?: Phaser.GameObjects.TileSprite;

  // Konkurrenten-Straße: Stärke-Balken je Konkurrent (id → Rectangle).
  private compStrengthBars: Record<string, Phaser.GameObjects.Rectangle> = {};
  private compUnsub?: () => void;

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

  preload() {
    this.load.spritesheet('rpg', 'assets/roguelikeSheet_transparent.png', {
      frameWidth: 16,
      frameHeight: 16,
      spacing: 1,
    });
  }

  create() {
    const worldW = 30 * TILE; // 1200
    const worldH = 24 * TILE; // 960 — 4 extra Tiles für STRASSE + Konkurrenten-Läden

    this.cameras.main.setBackgroundColor("#cfd8dc");
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.solids = this.physics.add.staticGroup();
    const builder = new SceneBuilder(this, this.solids);

    this.shopFloorSprite = builder.drawFloors();
    this.compStrengthBars = builder.buildStreet();
    builder.drawFloorGrid(worldW, worldH);
    builder.buildWalls();
    const { lagerShelves, shopShelves } = builder.buildFurniture();
    this.lagerShelves = lagerShelves;
    this.shopShelves = shopShelves;
    builder.createSpriteTextures(); // Pixel-Art-Texturen erzeugen
    const avatar = builder.buildAvatar();
    this.avatarSprite = avatar.avatarSprite;
    this.avatarShadow = avatar.avatarShadow;

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
    // Ladengestaltung: Bodenfärbe der Verkaufsfläche sofort anwenden + bei Wechsel updaten.
    this.applyTheme(useEconomy.getState().storeTheme);
    EventBus.on(Events.ThemeChange, this.applyTheme, this);
    // Aufräumen, falls die Szene neu gestartet wird (z.B. Hot-Reload).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.CloseComputer, this.unfreeze, this);
      EventBus.off(Events.StartDay, this.startDay, this);
      EventBus.off(Events.SkipDay, this.skipDay, this);
      EventBus.off(Events.ThemeChange, this.applyTheme, this);
    });

    // Raum-Beschriftungen
    builder.addRoomLabel("BÜRO", 5 * TILE, 1.4 * TILE);
    this.lagerLabel = builder.addRoomLabel("LAGER", 23.5 * TILE, 1.4 * TILE);
    this.shopLabel = builder.addRoomLabel("VERKAUFSFLÄCHE", 15 * TILE, 8.4 * TILE);
    builder.addRoomLabel("FLUR", 13.5 * TILE, 1.4 * TILE);

    // Regale an den aktuellen Bestand koppeln + bei Änderungen aktualisieren.
    this.refreshStockVisual();
    this.stockUnsub = useEconomy.subscribe((s) =>
      this.refreshStockVisual(s.batches),
    );
    // Konkurrenten-Stärke live aktualisieren.
    this.refreshCompetitorStrength(useCompetitor.getState().competitors);
    this.compUnsub = useCompetitor.subscribe((s) =>
      this.refreshCompetitorStrength(s.competitors),
    );
    const cleanup = () => {
      this.alive = false;
      this.stockUnsub?.();
      this.stockUnsub = undefined;
      this.compUnsub?.();
      this.compUnsub = undefined;
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
    const st = useEconomy.getState();
    const cap = capacityOf(st.upgrades, st.specialization);
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
    this.dayCap = capacityOf(st.upgrades, st.specialization);
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
    if (!this.avatarSprite) return;
    this.avatarSprite.setPosition(this.player.x, this.player.y);
    this.avatarShadow.setPosition(this.player.x, this.player.y + 14);
    // Nach links laufen -> Sprite spiegeln.
    if (left) this.avatarSprite.setScale(-2, 2);
    else if (right) this.avatarSprite.setScale(2, 2);
  }

  // Konkurrenten-Stärke-Balken live aktualisieren.
  private refreshCompetitorStrength(competitors: { id: string; strength: number }[]) {
    if (!this.alive) return;
    const barMaxW = 6.5 * TILE;
    for (const c of competitors) {
      const bar = this.compStrengthBars[c.id];
      if (!bar || !bar.scene) continue;
      const ratio = Math.min(1, c.strength / 100);
      bar.setSize(barMaxW * ratio, 8);
      const color = c.strength < 30 ? 0x66bb6a : c.strength < 60 ? 0xffa726 : 0xef5350;
      bar.setFillStyle(color);
    }
  }

  // Ladengestaltung: Bodenfärbe der Verkaufsfläche per Theme-Tint.
  private applyTheme(theme: StoreTheme) {
    if (!this.shopFloorSprite || !this.shopFloorSprite.scene) return;
    this.shopFloorSprite.setTint(themeFloorTint(theme));
  }
}
