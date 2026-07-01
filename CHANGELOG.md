# Changelog

Kurze Doku wichtiger Entscheidungen und Refactoring-Schritte. Feature-Historie steht in den Git-Commits, hier geht es um das *Warum*.

## Phase 1 – Codebase-Review & Refactoring (2026-07-01)

**Befund:** `economyStore.ts` (1.800 Zeilen), `ErpApp.tsx` (1.511 Zeilen) und `OfficeScene.ts`
(884 Zeilen) sind über Zeit zu "Gott-Dateien" gewachsen, die jeweils viele unabhängige
Zuständigkeiten in einer Datei bündeln. `advanceDay()` allein war eine 370-Zeilen-Funktion.
Zusätzlich wiederholte sich der komplette State-Objekt-Block 3× (Initial-State, `startGame`,
`resetGame`) — eine häufige Fehlerquelle beim Hinzufügen neuer State-Felder.

**Entscheidung:** Ein Zustand-Store bleibt bestehen (keine Aufspaltung in mehrere Stores),
da die Spielmechaniken stark miteinander verzahnt sind (Zufriedenheit → Nachfrage → Umsatz →
Kredit-Zinsen usw.). Stattdessen wird nur die *Datei* in fachliche Module aufgeteilt
(Missionen, Spezialisierungen, Ladendesigns, Krisen, Ausbau-Stufen) und `advanceDay` in
benannte Einzelschritte zerlegt. Reihenfolge: economyStore → ErpApp → OfficeScene.

- **Schritt 1:** Duplizierten State-Block (Initial-State/`startGame`/`resetGame`) durch eine
  einzige `freshState()`-Fabrik ersetzt — neue Felder müssen jetzt nur noch an einer Stelle
  ergänzt werden.
- **Schritt 2:** 4 fachliche Module aus `economyStore.ts` ausgelagert: `missions.ts`,
  `specializations.ts`, `themes.ts`, `crises.ts`. Re-Export über `economyStore.ts`, damit
  keine andere Datei ihre Importe ändern musste.
- **Schritt 3:** `upgrades.ts` (Lagerkapazität, Kundenstrom, Mitarbeiterlohn, Haltbarkeit,
  Ausbau-Kostenkurve) ausgelagert. Dabei einen Smell behoben: `capacityOf()` las die
  Spezialisierung bisher heimlich aus dem globalen Store — jetzt expliziter Parameter
  (alle 6 Aufrufstellen angepasst). `Batch`/`stockOf` nach `catalog.ts` verschoben (gleiche
  Begründung wie beim früheren `DayRecord`-Umzug: kein zirkulärer Import).
- **Schritt 4:** `advanceDay()` (370 Zeilen) in benannte Schritte zerlegt: `dayRotation.ts`
  (`rotateDailyMarket()` — Angebote, Saison-/Wellen-/Jahreswechsel-Mails, Krisen, Lieferanten-
  preise/-ausfälle, Trend-Produkt) und `finance.ts` (`settleDayFinance()` — Tageslohn,
  Filial-Passiveinkommen, Kredit-Zinsen). Der Verkaufs-/Verderb-Durchlauf (`runSalesAndSpoilage`)
  bleibt bewusst als lokale Funktion in `economyStore.ts`, da `effectiveSales()` weiterhin am
  globalen Store hängt (`useEconomy.getState()`) — ein Auslagern hätte einen zirkulären Import
  erzeugt. `advanceDay` selbst: 370 → ~185 Zeilen. `economyStore.ts` gesamt: 1.800 → 1.140 Zeilen.
  Verifiziert: `tsc` grün, isolierte Berechnungstests (`settleDayFinance`, `rotateDailyMarket`)
  sowie 3 echte Spieltage im Browser (Lieferverzögerung, Verkauf, Verderb, Zufriedenheit,
  verpasste Nachfrage) ohne Konsolenfehler.
- **Schritt 5:** `ErpApp.tsx` (1.513 Zeilen, 8 unabhängige Tab-Ansichten in einer Datei) in
  `src/os/apps/erp/` aufgeteilt: `shared.ts`, `CapGauge.tsx`, `CrisisBanner.tsx`,
  `EinkaufView.tsx`, `PreiseView.tsx`, `StatistikView.tsx`, `AusbauView.tsx`,
  `BankSection.tsx`, `StrategieView.tsx`, `DesignView.tsx`. `ErpApp.tsx` selbst ist jetzt nur
  noch die Tab-Umschalter-Hülle (1.513 → 204 Zeilen). Reines Verschieben ohne Logik-Änderung
  (einzige Ausnahme: doppelten `CATALOG`/`ALL_CATALOG`-Import in `PreiseView.tsx` auf eine
  Quelle konsolidiert — beides war exakt dasselbe Array). Verifiziert: `tsc` grün, alle 8
  Reiter + alle 4 Statistik-Unterreiter + Bank-Sektion im Browser durchgeklickt, Kauf + Tag
  weiter funktional getestet (Kontostand/Tag korrekt), keine Konsolenfehler.
- **Schritt 6 (letzter Schritt, `OfficeScene.ts`):** Rendering von Spiellogik getrennt.
  Neues `src/game/scenes/sceneBuilder.ts` (`SceneBuilder`-Klasse) übernimmt den kompletten
  Welt-Aufbau (Böden, Wände, Möbel, Regale, Sprite-Texturen, Straße mit Konkurrenten-Fassaden) —
  reines Zeichnen, nimmt `scene`+`solids` entgegen und gibt erzeugte Objekte zurück (Regale,
  Avatar, Stärke-Balken), statt sie selbst in Instanzfelder zu schreiben. `OfficeScene.ts`
  bleibt für Spiellogik zuständig: Bewegung/Kollision, PC-Interaktion, sichtbarer Tagesablauf
  (Kunden-Spawns, Regale live leeren), Store-Anbindung (Lagerfüllstand, Konkurrenz-Stärke,
  Ladengestaltung). `OfficeScene.ts`: 884 → 458 Zeilen, `sceneBuilder.ts`: 458 Zeilen neu.
  Beim Umbau einen doppelten `buildStreet()`-Aufruf entdeckt und vor dem Testen korrigiert
  (hätte Konkurrenten-Straße + Stärke-Balken doppelt gezeichnet). Verifiziert: `tsc` grün,
  komplette Welt im Screenshot geprüft (Büro/Regale/Kassen/Avatar korrekt), voller Tagesablauf
  im Browser durchgespielt (Kunden laufen sichtbar durch die Gänge, HUD, Regale leeren sich,
  Tageswechsel 1→2 mit korrektem Kontostand/Zufriedenheit), keine Konsolenfehler.

**Ergebnis Phase 1:** Aus 3 Dateien mit zusammen ~4.200 Zeilen (economyStore 1.800,
ErpApp 1.511, OfficeScene 884) wurden ~15 fokussierte Module. Kernkennzahlen:
economyStore.ts 1.800→1.140, ErpApp.tsx 1.513→204, OfficeScene.ts 884→458 Zeilen.
`advanceDay()` 370→~185 Zeilen. Keine Verhaltensänderung außer dem `capacityOf()`-Fix
(Spezialisierung jetzt expliziter Parameter statt heimlichem Store-Zugriff) und der
`ALL_CATALOG`/`CATALOG`-Konsolidierung in PreiseView. Phase 2 (2D→3D) kann beginnen.

## Phase 2 – 2D→3D-Umstieg (2026-07-01)

**Entscheidung Perspektive/Technik:** Kein Engine-Wechsel. Die Welt bleibt in Phaser
(2D), Kamera bleibt Top-Down. Grund: die Welt ist bewusst Kulisse (Kernspiel = ERP-
Einkaufssimulation), ein echter 3D-Engine-Wechsel (three.js/Babylon) hätte das größte
Risiko bei kleinstem Nutzen für den eigentlichen Spielkern.

**Verworfen — „echtes" isometrisches Diamant-Raster:** Ein Prototyp (`iso.ts` +
`OfficeSceneIsoPOC.ts`, isometrische Projektion + Klötzchen-Zeichnung) hat gezeigt,
dass der Look funktioniert, aber: Kollision, Kamera, Regal-Füllbalken UND
Kunden-Bewegung hängen im Bestandscode alle an denselben Bildschirm-Koordinaten wie
die Physik — ein echtes Diamant-Raster hätte all das mit umbauen müssen (inkl.
WASD-Steuerung neu abbilden, damit sie sich nicht schräg anfühlt). Nach Abwägung
(Michael, 2026-07-01) zu riskant für den Nutzen; Prototyp-Dateien wieder gelöscht.

**Asset-Recherche:** Kenney.nl hat kein fertiges isometrisches Regal/Theke-Paket.
Das testweise heruntergeladene „Isometric Blocks"-Paket stellte sich als
Minecraft-artiges Voxel-Klötzchen-Set heraus (Gras/Stein/Erz-Blöcke, kein
Laden-Möbel) und wurde verworfen. Auch itch.io-Kandidaten (z.B. Eclair-Assets-Pakete)
sind 3D-Modelle (GLB), keine fertigen 2D-Sprites. Entscheidung: Möbel weiter selbst
zeichnen, keine Asset-Abhängigkeit.

- **Schritt 1 „3D-Klötzchen-Optik":** `sceneBuilder.ts` bekommt einen wiederverwendbaren
  `addSideStrip()`-Helfer (dunkler Streifen an der rechten Kante) plus neue Farbtöne
  (`shelfTop`, `wallSide`, `counterSide`). Angewendet auf Wände (zusätzlich zum
  bestehenden hellen Oberkanten-Streifen), Regale (neu: Oberkanten-Highlight +
  Seitenkante, vorher hatten Regale gar keinen Bevel), Kasse und Schreibtisch.
  Grundriss, Bewegung, Kollision, Kamera, Kunden-Pfade: **unverändert** — reine
  Zeichen-Ebene, keine Positions-/Logik-Änderung. Verifiziert: `tsc` grün, Bau- und
  Verkaufsraum im Browser bei 3-facher Zoomstufe geprüft (Regale/Kasse zeigen
  sichtbare Ober-/Seitenkante), keine Konsolenfehler.
- **Schritt 2 (Rest der Welt):** Seitenkante auch für Büro-Sofa, Pflanzentopf und die
  3 Konkurrenten-Fassaden auf der Straße ergänzt (gleicher `addSideStrip()`-Helfer
  bzw. eine zur Fassaden-Koordinate passende Variante). Sofa/Topf-Effekt ist bei der
  kleinen Möbelgröße nur dezent sichtbar (dunkler Farbton liegt nah am Korpus-Braun),
  bei den Fassaden deutlich sichtbarer. Blätter der Pflanze (Kreise) bewusst
  ausgelassen — der Rechteck-Bevel passt nicht auf runde Formen. Verifiziert: `tsc`
  grün, Büro-Ecke + Konkurrenten-Straße bei 2,5–5-facher Zoomstufe geprüft, keine
  Konsolenfehler.
