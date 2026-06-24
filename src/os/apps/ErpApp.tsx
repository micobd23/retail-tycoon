import { useState } from "react";
import {
  useEconomy,
  stockOf,
  usedCapacity,
  capacityOf,
  kundenstrom,
  effectiveSales,
  upgradeCost,
  UPGRADE_META,
  type Upgrades,
  type UpgradeTrack,
} from "../../economy/economyStore";
import {
  CATALOG,
  SUPPLIERS,
  euro,
  unitPrice,
  rabattProzent,
  supplierBaseEk,
  cheapestSupplier,
  dayToCalendar,
  type Category,
  type Product,
} from "../../economy/catalog";
import { EventBus, Events } from "../../game/EventBus";
import "./erp.css";

const DEFAULT_QTY = 100;

// Reihenfolge der Kategorien in der Anzeige.
const CATEGORIES: Category[] = [
  "Getränke",
  "Grundnahrung",
  "Drogerie",
  "Süßwaren",
  "Frische",
  "Saisonales",
];

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

// Filter: "alle" oder eine einzelne Kategorie.
type Filter = "alle" | Category;
const FILTERS: Filter[] = ["alle", ...CATEGORIES];

// Empfohlene Bestellmenge für Frischware (Haltbarkeit × effektive Drehzahl).
// Berücksichtigt den Kundenstrom, damit die Empfehlung bei mehr Kassen mitwächst.
const empfMenge = (p: Product, u: Upgrades) =>
  p.storage === "frisch" && p.shelfLifeDays
    ? effectiveSales(p, u) * p.shelfLifeDays
    : null;

type Tab = "einkauf" | "statistik" | "ausbau";

export function ErpApp() {
  const [tab, setTab] = useState<Tab>("einkauf");

  const cash = useEconomy((s) => s.cash);
  const day = useEconomy((s) => s.day);
  const lastRevenue = useEconomy((s) => s.lastRevenue);
  const lastSpoiledValue = useEconomy((s) => s.lastSpoiledValue);
  const satisfaction = useEconomy((s) => s.satisfaction);
  const batches = useEconomy((s) => s.batches);
  const upgrades = useEconomy((s) => s.upgrades);

  const cal = dayToCalendar(day);

  const [msg, setMsg] = useState<string | null>(null);

  const used = usedCapacity(batches);
  const cap = capacityOf(upgrades);

  // „Tag weiter" startet den sichtbaren Tagesablauf in der Welt (OfficeScene);
  // am Ende rechnet App via DayDone ab und der Vollbild-Recap erscheint.
  const handleDay = () => EventBus.emit(Events.StartDay);

  return (
    <div className="erp">
      {/* Kopfzeile mit Kennzahlen */}
      <div className="erp-bar">
        <div className="erp-stat">
          <span className="erp-stat-label">Konto</span>
          <span className="erp-stat-value erp-cash">{euro(cash)}</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">
            {SEASON_EMOJI[cal.season]} {cal.season} · Q{cal.quarter} · Jahr {cal.year}
          </span>
          <span className="erp-stat-value">Tag {cal.seasonDay} / 13</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">Umsatz gestern</span>
          <span className="erp-stat-value">{euro(lastRevenue)}</span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">Verderb gestern</span>
          <span className="erp-stat-value erp-loss">
            {lastSpoiledValue > 0 ? "−" + euro(lastSpoiledValue) : "—"}
          </span>
        </div>
        <div className="erp-stat">
          <span className="erp-stat-label">Zufriedenheit</span>
          <span
            className="erp-stat-value"
            style={{
              color:
                satisfaction >= 80
                  ? "#2e7d32"
                  : satisfaction >= 55
                    ? "#f9a825"
                    : "#c62828",
            }}
          >
            {satisfaction}%
          </span>
        </div>

        {/* Lagerplatz-Anzeigen */}
        <CapGauge label="Lager (trocken)" used={used.trocken} cap={cap.trocken} />
        <CapGauge
          label="Verkaufsfläche (frisch)"
          used={used.frisch}
          cap={cap.frisch}
        />

        <button className="erp-day-btn" onClick={handleDay}>
          Tag weiter ▶
        </button>
      </div>

      {/* Reiter: Einkauf / Statistik */}
      <div className="erp-tabs">
        <button
          className={"erp-tab" + (tab === "einkauf" ? " active" : "")}
          onClick={() => setTab("einkauf")}
        >
          🛒 Einkauf
        </button>
        <button
          className={"erp-tab" + (tab === "statistik" ? " active" : "")}
          onClick={() => setTab("statistik")}
        >
          📊 Statistik
        </button>
        <button
          className={"erp-tab" + (tab === "ausbau" ? " active" : "")}
          onClick={() => setTab("ausbau")}
        >
          🏗️ Ausbau
        </button>
      </div>

      {msg && tab === "einkauf" && <div className="erp-msg">{msg}</div>}

      {tab === "einkauf" && <EinkaufView setMsg={setMsg} />}
      {tab === "statistik" && <StatistikView />}
      {tab === "ausbau" && <AusbauView />}
    </div>
  );
}

// --- Lagerplatz-Anzeige (kleiner Balken) ---------------------------------
function CapGauge({
  label,
  used,
  cap,
}: {
  label: string;
  used: number;
  cap: number;
}) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const voll = pct >= 90;
  return (
    <div className="erp-cap">
      <span className="erp-stat-label">{label}</span>
      <div className="erp-cap-bar">
        <div
          className={"erp-cap-fill" + (voll ? " full" : "")}
          style={{ width: pct + "%" }}
        />
      </div>
      <span className="erp-cap-text">
        {used.toLocaleString("de-DE")} / {cap.toLocaleString("de-DE")}
      </span>
    </div>
  );
}

// --- Einkauf-Ansicht ------------------------------------------------------
function EinkaufView({ setMsg }: { setMsg: (m: string) => void }) {
  const cash = useEconomy((s) => s.cash);
  const day = useEconomy((s) => s.day);
  const batches = useEconomy((s) => s.batches);
  const offers = useEconomy((s) => s.offers);
  const upgrades = useEconomy((s) => s.upgrades);
  const lastMissed = useEconomy((s) => s.lastMissed);
  const buy = useEconomy((s) => s.buy);
  const { season } = dayToCalendar(day);

  const [filter, setFilter] = useState<Filter>("alle");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [supplier, setSupplier] = useState<Record<string, string>>({});

  const getQty = (id: string) => qty[id] ?? DEFAULT_QTY;
  const getSupplier = (p: Product) => supplier[p.id] ?? cheapestSupplier(p);

  // Freier Platz je Fläche -> Kauf blockieren, wenn die Menge nicht reinpasst.
  const used = usedCapacity(batches);
  const cap = capacityOf(upgrades);
  const freiFuer = (p: Product) =>
    p.storage === "frisch" ? cap.frisch - used.frisch : cap.trocken - used.trocken;

  const handleBuy = (p: Product) => {
    const menge = getQty(p.id);
    const res = buy(p.id, menge, getSupplier(p));
    setMsg(res.ok ? `✅ ${menge}× ${p.name} eingekauft.` : `⚠️ ${res.msg}`);
  };

  // Welche Kategorien werden gezeigt? Bei "alle" alle (mit Überschriften),
  // sonst nur die gewählte (ohne Überschrift).
  const shownCats = filter === "alle" ? CATEGORIES : [filter];

  return (
    <div className="erp-einkauf">
      {/* Kategorie-Filter als Chips (bleiben über der scrollenden Tabelle) */}
      <div className="erp-chips">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={"erp-chip" + (filter === f ? " active" : "")}
            onClick={() => setFilter(f)}
          >
            {f === "alle" ? "Alle" : f === "Saisonales" ? `${SEASON_EMOJI[season]} Saisonales` : f}
          </button>
        ))}
      </div>

      <div className="erp-table-wrap">
      <table className="erp-grid">
        <thead>
          <tr>
            <th className="l">Produkt</th>
            <th className="l">Lieferant</th>
            <th>EK/Stk</th>
            <th>VK</th>
            <th>Marge</th>
            <th>Bestand</th>
            <th>Menge</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shownCats.map((cat) => {
            // Saison-Specials außerhalb ihrer Saison ausblenden
            const items = CATALOG.filter(
              (p) => p.category === cat && (!p.onlyInSeason || p.onlyInSeason === season),
            );
            return [
              // Überschrift nur in der "Alle"-Ansicht.
              filter === "alle" ? (
                <tr key={"cat-" + cat} className="erp-cat-row">
                  <td className="l" colSpan={8}>
                    {cat}
                  </td>
                </tr>
              ) : null,
              ...items.map((p) => {
                const menge = getQty(p.id);
                const sup = getSupplier(p);
                const offer = offers[p.id];
                const offerRabatt = offer?.rabatt ?? 0;
                const effBase = supplierBaseEk(p, sup) * (1 - offerRabatt);
                const stueck = unitPrice(effBase, menge);
                const mengenRabatt = rabattProzent(menge);
                const gesamt = +(stueck * menge).toFixed(2);
                const marge = +(p.vk - stueck).toFixed(2);
                const frei = freiFuer(p);
                const tooExpensive = gesamt > cash;
                const tooFull = menge > frei;
                const disabled = tooExpensive || tooFull || menge <= 0;
                const title = tooExpensive
                  ? "Nicht genug Geld"
                  : tooFull
                    ? `Kein Platz — nur ${frei} frei`
                    : `Gesamt ${euro(gesamt)}`;
                return (
                  <tr key={p.id}>
                    <td className="l">
                      <span className="erp-name">{p.name}</span>
                      <span
                        className={
                          "erp-badge " +
                          (p.storage === "frisch" ? "frisch" : "trocken")
                        }
                      >
                        {p.storage === "frisch"
                          ? `frisch · ${p.shelfLifeDays} T`
                          : "trocken"}
                      </span>
                      {p.onlyInSeason && (
                        <span className="erp-saison">
                          {SEASON_EMOJI[p.onlyInSeason]} {p.onlyInSeason}-Special
                        </span>
                      )}
                      {empfMenge(p, upgrades) && (
                        <span className="erp-empf">
                          empf. {empfMenge(p, upgrades)}
                        </span>
                      )}
                      {offer && (
                        <span className="erp-offer">
                          ★ −{Math.round(offer.rabatt * 100)}% · {offer.daysLeft}T
                        </span>
                      )}
                      {lastMissed[p.id] > 0 && (
                        <span
                          className="erp-missed"
                          title="Gestern war die Ware aus — diese Nachfrage ging verloren."
                        >
                          −{lastMissed[p.id]} verpasst
                        </span>
                      )}
                    </td>
                    <td className="l">
                      <select
                        className="erp-supplier"
                        value={sup}
                        onChange={(e) =>
                          setSupplier((s) => ({ ...s, [p.id]: e.target.value }))
                        }
                      >
                        {SUPPLIERS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ·{" "}
                            {euro(supplierBaseEk(p, s.id) * (1 - offerRabatt))}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {euro(stueck)}
                      {mengenRabatt > 0 && (
                        <span className="erp-rabatt"> −{mengenRabatt}%</span>
                      )}
                    </td>
                    <td>{euro(p.vk)}</td>
                    <td className={marge >= 0 ? "erp-marge" : "erp-loss"}>
                      {euro(marge)}
                    </td>
                    <td className="erp-stock">{stockOf(batches, p.id)}</td>
                    <td>
                      <input
                        className="erp-qty"
                        type="number"
                        min={0}
                        step={10}
                        value={menge}
                        onChange={(e) =>
                          setQty((q) => ({
                            ...q,
                            [p.id]: Math.max(0, Number(e.target.value)),
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="erp-buy"
                        disabled={disabled}
                        title={title}
                        onClick={() => handleBuy(p)}
                      >
                        {euro(gesamt)}
                      </button>
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// --- Statistik-Ansicht ----------------------------------------------------
function StatistikView() {
  const stats = useEconomy((s) => s.stats);

  // Daten je Produkt aufbereiten, nach Umsatz sortiert (Bestseller oben).
  const rows = CATALOG.map((p) => {
    const st = stats[p.id] ?? { sold: 0, revenue: 0, spoiled: 0, ageSum: 0 };
    const avg = st.sold > 0 ? st.ageSum / st.sold : 0;
    return { p, ...st, avg, spoiledValue: st.spoiled * p.ek };
  }).sort((a, b) => b.revenue - a.revenue);

  const gesamtUmsatz = rows.reduce((s, r) => s + r.revenue, 0);
  const gesamtVerderb = rows.reduce((s, r) => s + r.spoiledValue, 0);
  const bestsellerId = rows.find((r) => r.sold > 0)?.p.id;
  const etwasVerkauft = rows.some((r) => r.sold > 0);

  return (
    <div className="erp-table-wrap">
      <div className="erp-stat-summary">
        <div>
          <span className="erp-stat-label">Gesamtumsatz</span>
          <span className="erp-stat-value erp-cash">{euro(gesamtUmsatz)}</span>
        </div>
        <div>
          <span className="erp-stat-label">Verderb gesamt</span>
          <span className="erp-stat-value erp-loss">
            {gesamtVerderb > 0 ? "−" + euro(gesamtVerderb) : "—"}
          </span>
        </div>
      </div>

      <table className="erp-grid">
        <thead>
          <tr>
            <th className="l">Produkt</th>
            <th>Verkauft</th>
            <th>Umsatz</th>
            <th>Ø Lagerdauer</th>
            <th>Verderb</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id}>
              <td className="l">
                <span className="erp-name">{r.p.name}</span>
                {r.p.id === bestsellerId && (
                  <span className="erp-bestseller">🏆 Bestseller</span>
                )}
                {etwasVerkauft && r.sold === 0 && (
                  <span className="erp-ladenhueter">Ladenhüter</span>
                )}
              </td>
              <td className="erp-stock">{r.sold}</td>
              <td className="erp-marge">{euro(r.revenue)}</td>
              <td>{r.sold > 0 ? r.avg.toFixed(1) + " T" : "—"}</td>
              <td className={r.spoiled > 0 ? "erp-loss" : ""}>
                {r.spoiled > 0 ? `${r.spoiled} (−${euro(r.spoiledValue)})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="erp-foot">
        Ø Lagerdauer = wie lange die verkaufte Ware im Schnitt im Bestand lag.
        „Ladenhüter" sind Produkte, von denen sich noch nichts verkauft hat —
        nur als Info, sie kosten dich nichts.
      </p>
    </div>
  );
}

// --- Ausbau-Ansicht -------------------------------------------------------
const TRACKS: UpgradeTrack[] = ["lager", "flaeche", "kassen"];

function AusbauView() {
  const cash = useEconomy((s) => s.cash);
  const upgrades = useEconomy((s) => s.upgrades);
  const doUpgrade = useEconomy((s) => s.upgrade);
  const [msg, setMsg] = useState<string | null>(null);

  const cap = capacityOf(upgrades);
  const strom = kundenstrom(upgrades);

  // Aktueller Effekt-Text je Linie für die nächste Stufe.
  const effektJetzt = (track: UpgradeTrack): string => {
    if (track === "lager") return `${cap.trocken.toLocaleString("de-DE")} Plätze`;
    if (track === "flaeche") return `${cap.frisch.toLocaleString("de-DE")} Plätze`;
    return `Kundenstrom ×${strom.toFixed(2)}`;
  };

  const handle = (track: UpgradeTrack) => {
    const res = doUpgrade(track);
    setMsg(
      res.ok
        ? `✅ ${UPGRADE_META[track].name} — Stufe ${upgrades[track] + 1} erreicht.`
        : `⚠️ ${res.msg}`,
    );
  };

  return (
    <div className="erp-table-wrap">
      <div className="erp-ausbau-intro">
        Investiere deinen Gewinn in den Betrieb. Jede Stufe kostet mehr als die
        vorige — überlege, was dein Wachstum gerade am meisten bremst.
      </div>
      {msg && <div className="erp-msg">{msg}</div>}

      <div className="erp-ausbau-grid">
        {TRACKS.map((track) => {
          const meta = UPGRADE_META[track];
          const level = upgrades[track];
          const cost = upgradeCost(track, level);
          const tooExpensive = cost > cash;
          return (
            <div key={track} className="erp-ausbau-card">
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">{meta.icon}</span>
                <div>
                  <div className="erp-ausbau-name">{meta.name}</div>
                  <div className="erp-ausbau-level">Stufe {level}</div>
                </div>
              </div>
              <div className="erp-ausbau-desc">{meta.desc}</div>
              <div className="erp-ausbau-effect">
                Aktuell: <strong>{effektJetzt(track)}</strong>
              </div>
              <button
                className="erp-buy erp-ausbau-buy"
                disabled={tooExpensive}
                title={tooExpensive ? "Nicht genug Geld" : `Kosten ${euro(cost)}`}
                onClick={() => handle(track)}
              >
                Ausbauen · {euro(cost)}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
