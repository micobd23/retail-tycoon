import { useState } from "react";
import {
  useEconomy,
  stockOf,
  usedCapacity,
  capacityOf,
  kundenstrom,
  effectiveSales,
  upgradeCost,
  dailyWage,
  effectiveShelfLife,
  UPGRADE_META,
  pendingCapOf,
  isCrisisActive,
  SPECIALIZATIONS,
  SPEC_SWITCH_COST,
  STORE_THEMES,
  THEME_SWITCH_COST,
  creditLimit,
  CREDIT_INTEREST_RATE,
  type PendingOrder,
  type Upgrades,
  type UpgradeTrack,
  type SeasonCrisis,
  type Specialization,
  type StoreTheme,
} from "../../economy/economyStore";
import { CATALOG as ALL_CATALOG } from "../../economy/catalog";
import { useGoal } from "../../economy/goalStore";
import { ZieleTab } from "./ZieleTab";
import {
  CATALOG,
  SUPPLIERS,
  euro,
  unitPrice,
  rabattProzent,
  supplierBaseEk,
  cheapestSupplier,
  dayToCalendar,
  currentSeasonWave,
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

// Empfohlene Bestellmenge für Frischware: effektive Drehzahl × effektive Haltbarkeit (inkl. Kühltheke).
const empfMenge = (p: Product, u: Upgrades) =>
  p.storage === "frisch" && p.shelfLifeDays
    ? effectiveSales(p, u) * effectiveShelfLife(p, u)
    : null;

type Tab = "einkauf" | "preise" | "statistik" | "ausbau" | "strategie" | "design" | "ziele";

export function ErpApp() {
  const [tab, setTab] = useState<Tab>("einkauf");
  const branches = useEconomy((s) => s.branches);
  const specialization = useEconomy((s) => s.specialization);

  const cash = useEconomy((s) => s.cash);
  const day = useEconomy((s) => s.day);
  const lastRevenue = useEconomy((s) => s.lastRevenue);
  const lastSpoiledValue = useEconomy((s) => s.lastSpoiledValue);
  const satisfaction = useEconomy((s) => s.satisfaction);
  const batches = useEconomy((s) => s.batches);
  const upgrades = useEconomy((s) => s.upgrades);

  const goals = useGoal((s) => s.goals);
  const goalsDone = goals.filter((g) => g.done).length;
  const seasonCrisis = useEconomy((s) => s.seasonCrisis);

  const cal = dayToCalendar(day);

  const [msg, setMsg] = useState<string | null>(null);

  const pendingOrders = useEconomy((s) => s.pendingOrders);
  const used = usedCapacity(batches);
  const cap = capacityOf(upgrades);
  const pendCap = pendingCapOf(pendingOrders);

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
        {dailyWage(upgrades) > 0 && (
          <div className="erp-stat">
            <span className="erp-stat-label">Tageslohn</span>
            <span className="erp-stat-value erp-loss">−{euro(dailyWage(upgrades))}/Tag</span>
          </div>
        )}
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
        <CapGauge label="Lager (trocken)" used={used.trocken} cap={cap.trocken} pending={pendCap.trocken} />
        <CapGauge
          label="Verkaufsfläche (frisch)"
          used={used.frisch}
          cap={cap.frisch}
          pending={pendCap.frisch}
        />

        {goals.length > 0 && (
          <button
            className="erp-stat erp-ziele-badge"
            onClick={() => setTab("ziele")}
            title="Saisonziele öffnen"
          >
            <span className="erp-stat-label">🎯 Saisonziele</span>
            <span
              className="erp-stat-value"
              style={{ color: goalsDone === goals.length ? "#2e7d32" : "#455a64" }}
            >
              {goalsDone}/{goals.length}
            </span>
          </button>
        )}

        <button className="erp-day-btn" onClick={handleDay}>
          Tag weiter ▶
        </button>
      </div>

      {/* Aktive Krisen-Warnung */}
      {isCrisisActive(seasonCrisis, day) && seasonCrisis && (
        <CrisisBanner crisis={seasonCrisis} day={day} />
      )}

      {/* Reiter */}
      <div className="erp-tabs">
        <button
          className={"erp-tab" + (tab === "einkauf" ? " active" : "")}
          onClick={() => setTab("einkauf")}
        >
          🛒 Einkauf
        </button>
        <button
          className={"erp-tab" + (tab === "preise" ? " active" : "")}
          onClick={() => setTab("preise")}
        >
          💰 Preise
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
        <button
          className={"erp-tab" + (tab === "strategie" ? " active" : "")}
          onClick={() => setTab("strategie")}
          title={branches < 1 ? "Ab der ersten Filiale verfügbar" : "Spezialisierung wählen"}
        >
          🎯 Strategie
          {branches < 1 ? (
            <span className="erp-tab-badge">🔒</span>
          ) : specialization === null ? (
            <span className="erp-tab-badge">!</span>
          ) : null}
        </button>
        <button
          className={"erp-tab" + (tab === "design" ? " active" : "")}
          onClick={() => setTab("design")}
        >
          🎨 Design
        </button>
        <button
          className={"erp-tab" + (tab === "ziele" ? " active" : "")}
          onClick={() => setTab("ziele")}
        >
          🎯 Ziele{goalsDone > 0 && goalsDone < goals.length && (
            <span className="erp-tab-badge">{goalsDone}</span>
          )}
          {goals.length > 0 && goalsDone === goals.length && (
            <span className="erp-tab-badge done">✓</span>
          )}
        </button>
      </div>

      {msg && tab === "einkauf" && <div className="erp-msg">{msg}</div>}

      {tab === "einkauf" && <EinkaufView setMsg={setMsg} />}
      {tab === "preise" && <PreiseView />}
      {tab === "statistik" && <StatistikView />}
      {tab === "ausbau" && <AusbauView />}
      {tab === "strategie" && <StrategieView />}
      {tab === "design" && <DesignView />}
      {tab === "ziele" && <ZieleTab />}
    </div>
  );
}

// --- Lagerplatz-Anzeige (kleiner Balken) ---------------------------------
function CapGauge({
  label,
  used,
  cap,
  pending = 0,
}: {
  label: string;
  used: number;
  cap: number;
  pending?: number;
}) {
  const total = used + pending;
  const pct = Math.min(100, Math.round((total / cap) * 100));
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
        {used.toLocaleString("de-DE")}
        {pending > 0 && <span className="erp-cap-pending">+{pending.toLocaleString("de-DE")}▶</span>}
        {" / "}{cap.toLocaleString("de-DE")}
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
  const supplierMods = useEconomy((s) => s.supplierMods);
  const trendProductId = useEconomy((s) => s.trendProductId);
  const supplierOutage = useEconomy((s) => s.supplierOutage);
  const contracts = useEconomy((s) => s.contracts);
  const pendingOrders = useEconomy((s) => s.pendingOrders);
  const buy = useEconomy((s) => s.buy);
  const prices = useEconomy((s) => s.prices);
  const { season, seasonDay } = dayToCalendar(day);
  const wave = currentSeasonWave(seasonDay);

  // Verfügbare Lieferanten (Großmarkt nur wenn Lieferwagen freigeschaltet).
  const availableSuppliers = SUPPLIERS.filter(
    (s) => !s.requiresUpgrade || (upgrades as unknown as Record<string, number>)[s.requiresUpgrade] >= 1,
  );

  const [filter, setFilter] = useState<Filter>("alle");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [supplier, setSupplier] = useState<Record<string, string>>({});

  const getQty = (id: string) => qty[id] ?? DEFAULT_QTY;
  const getSupplier = (p: Product) =>
    supplier[p.id] ?? cheapestSupplier(p, availableSuppliers.map((s) => s.id));

  // Freier Platz je Fläche — inkl. bereits reservierter Kapazität für unterwegs befindliche Bestellungen.
  const used = usedCapacity(batches);
  const cap = capacityOf(upgrades);
  const pendCap = pendingCapOf(pendingOrders);
  const freiFuer = (p: Product) =>
    p.storage === "frisch"
      ? cap.frisch - used.frisch - pendCap.frisch
      : cap.trocken - used.trocken - pendCap.trocken;

  // Ausstehende Bestellungen je Produkt (Summe + frühester Liefertag).
  const pendForProduct = (id: string): { qty: number; day: number } | null => {
    const orders = (pendingOrders as PendingOrder[]).filter((o) => o.productId === id);
    if (orders.length === 0) return null;
    return {
      qty: orders.reduce((s, o) => s + o.qty, 0),
      day: Math.min(...orders.map((o) => o.arrivalDay)),
    };
  };

  const handleBuy = (p: Product) => {
    const menge = getQty(p.id);
    const res = buy(p.id, menge, getSupplier(p));
    if (!res.ok) {
      setMsg(`⚠️ ${res.msg}`);
    } else if (res.deliveryDays && res.deliveryDays > 0) {
      setMsg(`📦 ${menge}× ${p.name} bestellt — Lieferung Tag ${res.arrivalDay}`);
    } else {
      setMsg(`✅ ${menge}× ${p.name} eingekauft.`);
    }
  };

  // Lieferanten-Mod-Label (+15%, -10% etc.)
  const modLabel = (supplierId: string) => {
    const m = supplierMods[supplierId] ?? 1.0;
    if (Math.abs(m - 1.0) < 0.005) return "";
    const pct = Math.round((m - 1.0) * 100);
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  };

  const shownCats = filter === "alle" ? CATEGORIES : [filter];

  return (
    <div className="erp-einkauf">
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
            const items = CATALOG.filter((p) => {
              if (p.category !== cat) return false;
              if (p.onlyInSeason && p.onlyInSeason !== season) return false;
              if (p.seasonWave && p.seasonWave !== wave) return false;
              // Eigenmarken nur zeigen wenn Upgrade aktiv
              if (p.requiresUpgrade === "eigenmarke" && (upgrades.eigenmarke ?? 0) < 1) return false;
              return true;
            });
            return [
              filter === "alle" ? (
                <tr key={"cat-" + cat} className="erp-cat-row">
                  <td className="l" colSpan={8}>{cat}</td>
                </tr>
              ) : null,
              ...items.map((p) => {
                const menge = getQty(p.id);
                const sup = getSupplier(p);
                const supObj = availableSuppliers.find((s) => s.id === sup);
                const offer = offers[p.id];
                const offerRabatt = offer?.rabatt ?? 0;
                const supMod = supplierMods[sup] ?? 1.0;
                const contractRabatt = contracts.includes(sup) ? 0.10 : 0.0;
                const effBase = supplierBaseEk(p, sup) * supMod * (1 - offerRabatt) * (1 - contractRabatt);
                const stueck = unitPrice(effBase, menge);
                const mengenRabatt = rabattProzent(menge);
                const gesamt = +(stueck * menge).toFixed(2);
                const myVK = prices[p.id] ?? p.vk;
                const marge = +(myVK - stueck).toFixed(2);
                const frei = freiFuer(p);
                const minQty = supObj?.minQty ?? 0;
                const tooLow = minQty > 0 && menge > 0 && menge < minQty;
                const tooExpensive = gesamt > cash;
                const tooFull = menge > frei;
                const disabled = tooExpensive || tooFull || menge <= 0 || tooLow;
                const isTrend = trendProductId === p.id;
                const title = tooLow
                  ? `Mindestmenge: ${minQty} Stück`
                  : tooExpensive
                    ? "Nicht genug Geld"
                    : tooFull
                      ? `Kein Platz — nur ${frei} frei`
                      : `Gesamt ${euro(gesamt)}`;
                return (
                  <tr key={p.id} className={isTrend ? "erp-row-trend" : ""}>
                    <td className="l">
                      <span className="erp-name">{p.name}</span>
                      {isTrend && <span className="erp-trend">🔥 Trend</span>}
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
                          {SEASON_EMOJI[p.onlyInSeason]}{p.seasonWave ? ` Welle ${p.seasonWave}` : ` ${p.onlyInSeason}-Special`}
                        </span>
                      )}
                      {p.requiresUpgrade === "eigenmarke" && (
                        <span className="erp-eigenmarke">🏷️ Eigenmarke</span>
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
                      {(() => {
                        const pend = pendForProduct(p.id);
                        if (!pend) return null;
                        return (
                          <span className="erp-pending" title="Unterwegs — Kapazität bereits reserviert.">
                            ▶ {pend.qty} Stk · Tag {pend.day}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="l">
                      <select
                        className="erp-supplier"
                        value={sup}
                        onChange={(e) =>
                          setSupplier((s) => ({ ...s, [p.id]: e.target.value }))
                        }
                      >
                        {availableSuppliers.map((s) => {
                          const outage = (supplierOutage[s.id] ?? 0) >= day;
                          const mod = supplierMods[s.id] ?? 1.0;
                          const cRabatt = contracts.includes(s.id) ? 0.10 : 0.0;
                          const baseEk = supplierBaseEk(p, s.id) * mod * (1 - offerRabatt) * (1 - cRabatt);
                          const ml = modLabel(s.id);
                          const contractMark = contracts.includes(s.id) ? " 🤝" : "";
                          const minMark = s.minQty ? ` (min. ${s.minQty})` : "";
                          const delivLabel = s.deliveryDays === 0 ? " · sofort" : ` · ${s.deliveryDays}T`;
                          return (
                            <option key={s.id} value={s.id} disabled={outage}>
                              {outage ? "⛔ " : ""}{s.name}{contractMark}{minMark}{ml ? ` ${ml}` : ""} · {euro(baseEk)}{delivLabel}{outage ? " — Ausfall" : ""}
                            </option>
                          );
                        })}
                      </select>
                      {(() => {
                        const ml = modLabel(sup);
                        if (!ml) return null;
                        const mod = supplierMods[sup] ?? 1.0;
                        return (
                          <span className={mod > 1.005 ? "erp-price-up" : "erp-price-down"}>
                            {ml}
                          </span>
                        );
                      })()}
                      {(supplierOutage[sup] ?? 0) >= day && (
                        <span className="erp-outage">⛔ Ausfall</span>
                      )}
                    </td>
                    <td>
                      {euro(stueck)}
                      {mengenRabatt > 0 && (
                        <span className="erp-rabatt"> −{mengenRabatt}%</span>
                      )}
                    </td>
                    <td>
                      {euro(myVK)}
                      {prices[p.id] !== undefined && prices[p.id] !== p.vk && (
                        <span style={{ fontSize: 10, color: "#1565c0", marginLeft: 3 }}>✎</span>
                      )}
                    </td>
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
type StatTab = "uebersicht" | "verlauf" | "produkte" | "kategorien";

function StatistikView() {
  const [tab, setTab] = useState<StatTab>("uebersicht");
  return (
    <div className="stat-wrap">
      <div className="stat-tabs">
        {(["uebersicht", "verlauf", "produkte", "kategorien"] as StatTab[]).map((t) => {
          const labels: Record<StatTab, string> = {
            uebersicht: "📊 Übersicht",
            verlauf: "📅 Tagesverlauf",
            produkte: "🏷️ Produkte",
            kategorien: "📂 Kategorien",
          };
          return (
            <button
              key={t}
              className={"stat-tab" + (tab === t ? " active" : "")}
              onClick={() => setTab(t)}
            >
              {labels[t]}
            </button>
          );
        })}
      </div>
      {tab === "uebersicht" && <StatUebersicht />}
      {tab === "verlauf" && <StatVerlauf />}
      {tab === "produkte" && <StatProdukte />}
      {tab === "kategorien" && <StatKategorien />}
    </div>
  );
}

// KPI-Kacheln -------------------------------------------------------------
function StatUebersicht() {
  const history = useEconomy((s) => s.history);
  const stats = useEconomy((s) => s.stats);
  const satisfaction = useEconomy((s) => s.satisfaction);
  const cash = useEconomy((s) => s.cash);
  const day = useEconomy((s) => s.day);

  const gesamtUmsatz = Object.values(stats).reduce((s, r) => s + r.revenue, 0);
  const gesamtVerderb = CATALOG.reduce((s, p) => s + (stats[p.id]?.spoiled ?? 0) * p.ek, 0);
  const avgTagesUmsatz = history.length > 0
    ? history.reduce((s, r) => s + r.revenue, 0) / history.length
    : 0;
  const avgZufriedenheit = history.length > 0
    ? Math.round(history.reduce((s, r) => s + r.satisfaction, 0) / history.length)
    : satisfaction;
  const gesamtVerkauft = Object.values(stats).reduce((s, r) => s + r.sold, 0);

  // Bester Tag
  const bestDay = history.length > 0
    ? history.reduce((best, r) => r.revenue > best.revenue ? r : best)
    : null;
  // Schlechtester Tag (mit mind. etwas Umsatz)
  const worstDay = history.filter((r) => r.revenue > 0).length > 0
    ? history.filter((r) => r.revenue > 0).reduce((w, r) => r.revenue < w.revenue ? r : w)
    : null;

  const { season } = dayToCalendar(day);

  return (
    <div className="stat-content">
      <div className="kpi-grid">
        <KpiCard label="Gesamtumsatz" value={euro(gesamtUmsatz)} color="green" />
        <KpiCard label="Ø Tagesumsatz" value={euro(avgTagesUmsatz)} color="blue" />
        <KpiCard label="Gesamt verkauft" value={gesamtVerkauft.toLocaleString("de-DE") + " Stk"} color="blue" />
        <KpiCard label="Gesamtverderb" value={gesamtVerderb > 0 ? "−" + euro(gesamtVerderb) : "—"} color={gesamtVerderb > 0 ? "red" : "neutral"} />
        <KpiCard label="Ø Zufriedenheit" value={avgZufriedenheit + "%"} color={avgZufriedenheit >= 80 ? "green" : avgZufriedenheit >= 55 ? "orange" : "red"} />
        <KpiCard label="Kassenstand" value={euro(cash)} color="green" />
        <KpiCard label="Aktuelle Saison" value={`${SEASON_EMOJI[season]} ${season}`} color="neutral" />
        <KpiCard label="Tage gespielt" value={history.length.toString()} color="neutral" />
      </div>

      {(bestDay || worstDay) && (
        <div className="stat-section">
          <div className="stat-section-title">Ausreißer</div>
          <div className="kpi-grid">
            {bestDay && (
              <KpiCard
                label={`🏆 Bester Tag (Tag ${bestDay.day})`}
                value={euro(bestDay.revenue)}
                color="green"
                sub={`${bestDay.unitsSold} Stk · Zufriedenheit ${bestDay.satisfaction}%`}
              />
            )}
            {worstDay && (
              <KpiCard
                label={`📉 Schwächster Tag (Tag ${worstDay.day})`}
                value={euro(worstDay.revenue)}
                color="red"
                sub={`${worstDay.unitsSold} Stk · Zufriedenheit ${worstDay.satisfaction}%`}
              />
            )}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <p className="erp-foot">Noch keine abgeschlossenen Tage — spiele einen Tag, um Statistiken zu sehen.</p>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, sub }: {
  label: string; value: string; color: "green" | "blue" | "red" | "orange" | "neutral"; sub?: string;
}) {
  const colorMap = {
    green: "#2e7d32", blue: "#1565c0", red: "#c62828", orange: "#e65100", neutral: "#37474f",
  };
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: colorMap[color] }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// Tagesverlauf ------------------------------------------------------------
function StatVerlauf() {
  const history = useEconomy((s) => s.history);

  if (history.length === 0) {
    return <p className="erp-foot" style={{ padding: "16px" }}>Noch keine abgeschlossenen Tage.</p>;
  }

  const reversed = [...history].reverse();

  return (
    <div className="erp-table-wrap">
      <table className="erp-grid">
        <thead>
          <tr>
            <th>Tag</th>
            <th className="l">Saison</th>
            <th>Umsatz</th>
            <th>Verderb</th>
            <th>Verkauft</th>
            <th>Bedient</th>
            <th>Zufriedenheit</th>
            <th>Konto danach</th>
          </tr>
        </thead>
        <tbody>
          {reversed.map((r) => {
            const cal = dayToCalendar(r.day);
            const fillRate = r.demandedTotal > 0
              ? Math.round((r.unitsSold / r.demandedTotal) * 100)
              : 100;
            return (
              <tr key={r.day}>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.day}</td>
                <td className="l">
                  {SEASON_EMOJI[cal.season]} {cal.season} · Q{cal.quarter} · T{cal.seasonDay}
                </td>
                <td className="erp-marge">{euro(r.revenue)}</td>
                <td className={r.spoiledValue > 0 ? "erp-loss" : ""}>
                  {r.spoiledValue > 0 ? "−" + euro(r.spoiledValue) : "—"}
                </td>
                <td>{r.unitsSold}</td>
                <td className={fillRate < 80 ? "erp-loss" : fillRate >= 95 ? "erp-marge" : ""}>
                  {fillRate}%
                </td>
                <td className={r.satisfaction >= 80 ? "erp-marge" : r.satisfaction >= 55 ? "" : "erp-loss"}>
                  {r.satisfaction}%
                </td>
                <td style={{ fontVariantNumeric: "tabular-nums" }}>{euro(r.cash)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="erp-foot">
        „Bedient" = wie viel Prozent der Gesamtnachfrage tatsächlich verkauft wurde.
        Unter 95% verlierst du Umsatz durch fehlende Bestände.
      </p>
    </div>
  );
}

// Produkte (ABC-Analyse + Fill Rate) --------------------------------------
function StatProdukte() {
  const stats = useEconomy((s) => s.stats);
  const demandedByProduct = useEconomy((s) => s.demandedByProduct);

  const rows = CATALOG.map((p) => {
    const st = stats[p.id] ?? { sold: 0, revenue: 0, spoiled: 0, ageSum: 0 };
    const demanded = demandedByProduct[p.id] ?? 0;
    const fillRate = demanded > 0 ? Math.round((st.sold / demanded) * 100) : null;
    const avg = st.sold > 0 ? st.ageSum / st.sold : 0;
    const spoiledValue = st.spoiled * p.ek;
    return { p, ...st, avg, spoiledValue, demanded, fillRate };
  }).sort((a, b) => b.revenue - a.revenue);

  const gesamtUmsatz = rows.reduce((s, r) => s + r.revenue, 0);

  // ABC-Klassifizierung: kumulierter Umsatzanteil.
  let cumShare = 0;
  const classified = rows.map((r) => {
    const share = gesamtUmsatz > 0 ? r.revenue / gesamtUmsatz : 0;
    cumShare += share;
    const abc = cumShare <= 0.8 ? "A" : cumShare <= 0.95 ? "B" : "C";
    return { ...r, share, abc };
  });

  const etwasVerkauft = rows.some((r) => r.sold > 0);

  return (
    <div className="erp-table-wrap">
      <div className="abc-legende">
        <span className="abc-badge A">A</span> Top 80% des Umsatzes &nbsp;
        <span className="abc-badge B">B</span> 80–95% &nbsp;
        <span className="abc-badge C">C</span> Rest
      </div>
      <table className="erp-grid">
        <thead>
          <tr>
            <th></th>
            <th className="l">Produkt</th>
            <th>Umsatz</th>
            <th>Anteil</th>
            <th>Verkauft</th>
            <th>Fill Rate</th>
            <th>Ø Lager</th>
            <th>Verderb</th>
          </tr>
        </thead>
        <tbody>
          {classified.map((r) => (
            <tr key={r.p.id}>
              <td><span className={"abc-badge " + r.abc}>{r.abc}</span></td>
              <td className="l">
                <span className="erp-name">{r.p.name}</span>
                {etwasVerkauft && r.sold === 0 && (
                  <span className="erp-ladenhueter">Ladenhüter</span>
                )}
              </td>
              <td className="erp-marge">{euro(r.revenue)}</td>
              <td style={{ color: "#78909c", fontSize: 12 }}>
                {gesamtUmsatz > 0 ? Math.round(r.share * 100) + "%" : "—"}
              </td>
              <td>{r.sold || "—"}</td>
              <td className={
                r.fillRate === null ? "" :
                r.fillRate < 80 ? "erp-loss" :
                r.fillRate >= 95 ? "erp-marge" : ""
              }>
                {r.fillRate !== null ? r.fillRate + "%" : "—"}
              </td>
              <td>{r.sold > 0 ? r.avg.toFixed(1) + " T" : "—"}</td>
              <td className={r.spoiled > 0 ? "erp-loss" : ""}>
                {r.spoiled > 0 ? `${r.spoiled} (−${euro(r.spoiledValue)})` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="erp-foot">
        Fill Rate unter 95%: du verlierst Umsatz durch fehlende Bestände —
        mehr bestellen. Ø Lager = durchschnittliche Lagerdauer der verkauften Ware in Tagen.
      </p>
    </div>
  );
}

// Kategorie-Auswertung ----------------------------------------------------
function StatKategorien() {
  const stats = useEconomy((s) => s.stats);
  const demandedByProduct = useEconomy((s) => s.demandedByProduct);

  const catData = CATEGORIES.map((cat) => {
    const products = CATALOG.filter((p) => p.category === cat);
    const umsatz = products.reduce((s, p) => s + (stats[p.id]?.revenue ?? 0), 0);
    const verkauft = products.reduce((s, p) => s + (stats[p.id]?.sold ?? 0), 0);
    const verderbStk = products.reduce((s, p) => s + (stats[p.id]?.spoiled ?? 0), 0);
    const verderbWert = products.reduce((s, p) => s + (stats[p.id]?.spoiled ?? 0) * p.ek, 0);
    const demanded = products.reduce((s, p) => s + (demandedByProduct[p.id] ?? 0), 0);
    const fillRate = demanded > 0 ? Math.round((verkauft / demanded) * 100) : null;
    // Durchschnittliche Marge der Kategorie (VK − EK, gewichtet nach Umsatz).
    const margeGesamt = products.reduce((s, p) => s + (stats[p.id]?.sold ?? 0) * (p.vk - p.ek), 0);
    return { cat, umsatz, verkauft, verderbStk, verderbWert, fillRate, margeGesamt };
  }).sort((a, b) => b.umsatz - a.umsatz);

  const gesamtUmsatz = catData.reduce((s, r) => s + r.umsatz, 0);

  return (
    <div className="erp-table-wrap">
      <table className="erp-grid">
        <thead>
          <tr>
            <th className="l">Kategorie</th>
            <th>Umsatz</th>
            <th>Anteil</th>
            <th>Marge gesamt</th>
            <th>Fill Rate</th>
            <th>Verderb</th>
          </tr>
        </thead>
        <tbody>
          {catData.map((r) => {
            const anteil = gesamtUmsatz > 0 ? Math.round((r.umsatz / gesamtUmsatz) * 100) : 0;
            return (
              <tr key={r.cat}>
                <td className="l"><strong>{r.cat}</strong></td>
                <td className="erp-marge">{euro(r.umsatz)}</td>
                <td>
                  <div className="anteil-bar-wrap">
                    <div className="anteil-bar" style={{ width: anteil + "%" }} />
                    <span>{anteil}%</span>
                  </div>
                </td>
                <td className={r.margeGesamt >= 0 ? "erp-marge" : "erp-loss"}>
                  {euro(r.margeGesamt)}
                </td>
                <td className={
                  r.fillRate === null ? "" :
                  r.fillRate < 80 ? "erp-loss" :
                  r.fillRate >= 95 ? "erp-marge" : ""
                }>
                  {r.fillRate !== null ? r.fillRate + "%" : "—"}
                </td>
                <td className={r.verderbStk > 0 ? "erp-loss" : ""}>
                  {r.verderbStk > 0 ? `${r.verderbStk} Stk (−${euro(r.verderbWert)})` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Ausbau-Ansicht -------------------------------------------------------
const TRACKS_CLASSIC: UpgradeTrack[] = ["lager", "flaeche", "kassen", "kuehltheke", "marketing", "personal"];
const TRACKS_EINMALIG: UpgradeTrack[] = ["lieferwagen", "eigenmarke"];

function AusbauView() {
  const cash = useEconomy((s) => s.cash);
  const upgrades = useEconomy((s) => s.upgrades);
  const contracts = useEconomy((s) => s.contracts);
  const doUpgrade = useEconomy((s) => s.upgrade);
  const doSign = useEconomy((s) => s.signContract);
  const doCancel = useEconomy((s) => s.cancelContract);
  const [msg, setMsg] = useState<string | null>(null);

  const cap = capacityOf(upgrades);
  const strom = kundenstrom(upgrades);
  const wage = dailyWage(upgrades);

  const effektJetzt = (track: UpgradeTrack): string => {
    if (track === "lager") return `${cap.trocken.toLocaleString("de-DE")} Plätze trocken`;
    if (track === "flaeche") return `${cap.frisch.toLocaleString("de-DE")} Plätze frisch`;
    if (track === "kassen") return `Kundenstrom ×${strom.toFixed(2)}`;
    if (track === "kuehltheke") return upgrades.kuehltheke > 0 ? `+${upgrades.kuehltheke} T Haltbarkeit` : "kein Bonus";
    if (track === "marketing") return upgrades.marketing > 0 ? `+${upgrades.marketing * 8}% Kundenstrom` : "kein Bonus";
    if (track === "personal") return upgrades.personal > 0 ? `${upgrades.personal} Mitarbeiter · −${upgrades.personal * 10}% Verderb · ${euro(wage)}/Tag` : "kein Personal";
    if (track === "lieferwagen") return upgrades.lieferwagen >= 1 ? "Aktiv ✓" : "Nicht freigeschaltet";
    if (track === "eigenmarke") return upgrades.eigenmarke >= 1 ? "Aktiv ✓" : "Nicht freigeschaltet";
    return "";
  };

  const handle = (track: UpgradeTrack) => {
    const res = doUpgrade(track);
    setMsg(res.ok
      ? `✅ ${UPGRADE_META[track].name} — Stufe ${upgrades[track] + 1} erreicht.`
      : `⚠️ ${res.msg}`
    );
  };

  const handleSign = (supplierId: string) => {
    const res = doSign(supplierId);
    const name = SUPPLIERS.find((s) => s.id === supplierId)?.name ?? supplierId;
    setMsg(res.ok ? `✅ Vertrag mit ${name} abgeschlossen (−10% dauerhaft).` : `⚠️ ${res.msg}`);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "12px 16px" }}>
      <div className="erp-ausbau-intro">
        Investiere deinen Gewinn in den Betrieb. Jede Stufe kostet mehr als die vorige.
      </div>
      {msg && <div className="erp-msg">{msg}</div>}

      <div className="ausbau-section-title">📦 Kapazität & Betrieb</div>
      <div className="erp-ausbau-grid">
        {TRACKS_CLASSIC.map((track) => {
          const meta = UPGRADE_META[track];
          const level = upgrades[track];
          const maxed = meta.maxLevel !== undefined && level >= meta.maxLevel;
          const cost = upgradeCost(track, level);
          const tooExpensive = cost > cash;
          return (
            <div key={track} className={"erp-ausbau-card" + (maxed ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">{meta.icon}</span>
                <div>
                  <div className="erp-ausbau-name">{meta.name}</div>
                  <div className="erp-ausbau-level">
                    Stufe {level}{meta.maxLevel ? ` / ${meta.maxLevel}` : ""}
                  </div>
                </div>
              </div>
              <div className="erp-ausbau-desc">{meta.desc}</div>
              <div className="erp-ausbau-effect">
                Aktuell: <strong>{effektJetzt(track)}</strong>
              </div>
              {maxed ? (
                <div className="ausbau-maxed">Maximalstufe erreicht ✓</div>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={tooExpensive}
                  title={tooExpensive ? "Nicht genug Geld" : `Kosten ${euro(cost)}`}
                  onClick={() => handle(track)}
                >
                  Ausbauen · {euro(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🔓 Einmalige Freischaltungen</div>
      <div className="erp-ausbau-grid">
        {TRACKS_EINMALIG.map((track) => {
          const meta = UPGRADE_META[track];
          const level = upgrades[track];
          const unlocked = level >= 1;
          const cost = upgradeCost(track, 0);
          const tooExpensive = cost > cash;
          return (
            <div key={track} className={"erp-ausbau-card" + (unlocked ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">{meta.icon}</span>
                <div>
                  <div className="erp-ausbau-name">{meta.name}</div>
                  <div className="erp-ausbau-level">{unlocked ? "Freigeschaltet" : "Gesperrt"}</div>
                </div>
              </div>
              <div className="erp-ausbau-desc">{meta.desc}</div>
              {unlocked ? (
                <div className="ausbau-maxed">Aktiv ✓</div>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={tooExpensive}
                  title={tooExpensive ? "Nicht genug Geld" : `Einmalig ${euro(cost)}`}
                  onClick={() => handle(track)}
                >
                  Freischalten · {euro(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🤝 Stammkunden-Verträge</div>
      <div className="erp-ausbau-intro" style={{ marginBottom: 10 }}>
        Einmalig 1.000 € pro Vertrag → dauerhaft −10% bei diesem Lieferanten. Maximal 2 gleichzeitig.
        Verträge können jederzeit gekündigt werden (kein Rückerstattung).
      </div>
      <div className="erp-ausbau-grid">
        {SUPPLIERS.filter((s) => !s.requiresUpgrade || (upgrades as unknown as Record<string,number>)[s.requiresUpgrade] >= 1).map((s) => {
          const active = contracts.includes(s.id);
          const canSign = !active && contracts.length < 2 && cash >= 1000;
          return (
            <div key={s.id} className={"erp-ausbau-card" + (active ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">🏪</span>
                <div>
                  <div className="erp-ausbau-name">{s.name}</div>
                  <div className="erp-ausbau-level">{active ? "Vertrag aktiv 🤝" : "Kein Vertrag"}</div>
                </div>
              </div>
              <div className="erp-ausbau-desc">
                {active ? "−10 % auf alle Bestellungen bei diesem Lieferanten." : "Für 1.000 € Stammkunden-Rabatt sichern."}
              </div>
              {active ? (
                <button
                  className="erp-buy erp-ausbau-buy"
                  style={{ background: "#b71c1c" }}
                  onClick={() => { doCancel(s.id); setMsg(`Vertrag mit ${s.name} gekündigt.`); }}
                >
                  Vertrag kündigen
                </button>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={!canSign}
                  title={!canSign ? (contracts.length >= 2 ? "Maximal 2 Verträge" : "Nicht genug Geld") : ""}
                  onClick={() => handleSign(s.id)}
                >
                  Vertrag abschließen · {euro(1000)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🏦 Bank & Kredit</div>
      <BankSection />
    </div>
  );
}

function BankSection() {
  const branches    = useEconomy((s) => s.branches);
  const creditUsed  = useEconomy((s) => s.creditUsed);
  const cash        = useEconomy((s) => s.cash);
  const takeCredit  = useEconomy((s) => s.takeCredit);
  const repayCredit = useEconomy((s) => s.repayCredit);
  const [msg, setMsg] = useState<string | null>(null);

  const limit     = creditLimit(branches);
  const available = Math.max(0, limit - creditUsed);
  const interest  = +(creditUsed * CREDIT_INTEREST_RATE).toFixed(2);

  const doTake = (amount: number) => {
    const r = takeCredit(amount);
    setMsg(r.ok ? `+${euro(amount)} geliehen.` : r.msg ?? null);
  };
  const doRepay = (amount: number) => {
    const r = repayCredit(amount);
    setMsg(r.ok ? `${euro(amount)} zurückgezahlt.` : r.msg ?? null);
  };

  return (
    <div style={{ background: "#f5f5f5", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "7px 11px", fontSize: 13, marginBottom: 10 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Kreditlimit", value: euro(limit), sub: `+${euro(3000)}/Filiale` },
          { label: "Genutzt", value: euro(creditUsed), sub: creditUsed > 0 ? `${euro(interest)}/Tag Zinsen` : "kein Kredit" },
          { label: "Verfügbar", value: euro(available), sub: `${CREDIT_INTEREST_RATE * 100} %/Tag Zins` },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 12, color: "#78909c", marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#263238" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#90a4ae", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[1000, 3000, available].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((amt) => (
          <button key={`take-${amt}`}
            onClick={() => doTake(amt)}
            disabled={amt > available || cash + amt > limit * 3}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: amt > available ? "#cfd8dc" : "#1565c0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: amt > available ? "default" : "pointer" }}
          >
            Leihen +{euro(amt)}
          </button>
        ))}
        <div style={{ width: "100%", height: 0 }} />
        {[1000, 3000, creditUsed].filter((v, i, a) => v > 0 && v <= creditUsed && a.indexOf(v) === i).map((amt) => (
          <button key={`repay-${amt}`}
            onClick={() => doRepay(amt)}
            disabled={amt > cash}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #b71c1c", background: "#fff", color: amt > cash ? "#cfd8dc" : "#b71c1c", fontWeight: 700, fontSize: 13, cursor: amt > cash ? "default" : "pointer" }}
          >
            Zurückzahlen −{euro(amt)}
          </button>
        ))}
        {creditUsed === 0 && (
          <span style={{ fontSize: 13, color: "#90a4ae", alignSelf: "center" }}>Kein offener Kredit.</span>
        )}
      </div>
    </div>
  );
}

// --- Preise-Ansicht -------------------------------------------------------
function PreiseView() {
  const prices    = useEconomy((s) => s.prices);
  const setPrice  = useEconomy((s) => s.setPrice);
  const upgrades  = useEconomy((s) => s.upgrades);
  const day       = useEconomy((s) => s.day);
  const { season, seasonDay } = dayToCalendar(day);

  // Lokaler Input-State (String, damit man ungestört tippen kann)
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const getInput = (id: string, baseVK: number): string => {
    if (inputs[id] !== undefined) return inputs[id];
    return (prices[id] ?? baseVK).toFixed(2);
  };

  const commit = (id: string, _baseVK: number, raw: string) => {
    const val = parseFloat(raw.replace(",", "."));
    if (!isNaN(val) && val > 0) setPrice(id, +val.toFixed(2));
    setInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const reset = (id: string, baseVK: number) => {
    setPrice(id, baseVK);
    setInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  return (
    <div className="erp-table-wrap">
      <p style={{ padding: "8px 4px 4px", margin: 0, fontSize: 12, color: "#546e7a" }}>
        Passe deine Verkaufspreise an. Höhere Preise = mehr Marge, aber weniger Kunden (Elastizität ×1,5).
        Änderungen wirken ab dem nächsten Tag.
      </p>
      <table className="erp-grid">
        <thead>
          <tr>
            <th className="l">Produkt</th>
            <th>Ø EK</th>
            <th>Basis-VK</th>
            <th>Dein Preis</th>
            <th>Marge %</th>
            <th>Nachfrage-Effekt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const items = ALL_CATALOG.filter((p) => {
              if (p.category !== cat) return true; // alle Kategorien zeigen
              return true;
            }).filter((p) => p.category === cat);
            if (items.length === 0) return null;
            return [
              <tr key={"cat-" + cat} className="erp-cat-row">
                <td className="l" colSpan={7}>{cat}</td>
              </tr>,
              ...items.map((p) => {
                const myVK     = parseFloat(getInput(p.id, p.vk));
                const isCustom = prices[p.id] !== undefined && prices[p.id] !== p.vk;
                const marge    = p.ek > 0 ? Math.round(((myVK - p.ek) / p.ek) * 100) : 0;
                void upgrades; // via effectiveSales
                const baseDemand = effectiveSales(p, upgrades, undefined, season, seasonDay);
                // Effekt bei hypothetischem Preis: Elastizität manuell berechnen
                const factor = myVK > 0 ? Math.pow(p.vk / myVK, 1.5) : 1;
                const demandPct = Math.round((factor - 1) * 100);
                const belowEK  = myVK < p.ek;
                return (
                  <tr key={p.id}>
                    <td className="l">
                      <span className="erp-name">{p.name}</span>
                      {isCustom && <span style={{ fontSize: 10, color: "#1565c0", marginLeft: 4 }}>✎ angepasst</span>}
                      {belowEK && <span style={{ fontSize: 10, color: "#c62828", marginLeft: 4 }}>⚠ unter EK</span>}
                    </td>
                    <td style={{ color: "#546e7a" }}>{euro(p.ek)}</td>
                    <td style={{ color: "#78909c" }}>{euro(p.vk)}</td>
                    <td>
                      <input
                        className="erp-qty"
                        type="number"
                        min={0.01}
                        step={0.05}
                        style={{ width: 72 }}
                        value={getInput(p.id, p.vk)}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={(e) => commit(p.id, p.vk, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commit(p.id, p.vk, (e.target as HTMLInputElement).value); }}
                      />
                    </td>
                    <td className={marge >= 20 ? "erp-marge" : marge >= 0 ? "" : "erp-loss"}>
                      {marge}%
                    </td>
                    <td style={{ color: demandPct > 0 ? "#2e7d32" : demandPct < 0 ? "#c62828" : "#546e7a", fontWeight: 600 }}>
                      {demandPct === 0 ? "—" : demandPct > 0 ? `▲${demandPct}%` : `▼${Math.abs(demandPct)}%`}
                      {baseDemand > 0 && (
                        <span style={{ fontWeight: 400, color: "#90a4ae", fontSize: 11, marginLeft: 4 }}>
                          (~{Math.round(baseDemand * factor)}/T)
                        </span>
                      )}
                    </td>
                    <td>
                      {isCustom && (
                        <button
                          className="erp-chip"
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => reset(p.id, p.vk)}
                          title="Auf Katalogpreis zurücksetzen"
                        >
                          ↺
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
      <p className="erp-foot">
        Nachfrage-Effekt = Änderung gegenüber dem Katalogpreis. ▲ = mehr Kunden, ▼ = weniger.
        Alle Preise in €, Änderung mit Enter oder Klick außerhalb bestätigen.
      </p>
    </div>
  );
}

// --- Strategie / Spezialisierung ------------------------------------------

function StrategieView() {
  const branches       = useEconomy((s) => s.branches);
  const specialization = useEconomy((s) => s.specialization);
  const cash           = useEconomy((s) => s.cash);
  const setSpec        = useEconomy((s) => s.setSpecialization);
  const [msg, setMsg]  = useState<string | null>(null);

  if (branches < 1) {
    return (
      <div className="erp-table-wrap" style={{ padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <h3 style={{ margin: "0 0 8px", color: "#37474f" }}>Strategie noch gesperrt</h3>
        <p style={{ color: "#607d8b", fontSize: 14, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
          Deine Spezialisierung schaltest du frei, sobald du deine <strong>erste Filiale</strong> eröffnet hast.
          Bis dahin: Konzentriere dich auf einen profitablen Hauptladen!
        </p>
      </div>
    );
  }

  const handlePick = (spec: Specialization) => {
    const res = setSpec(spec);
    if (!res.ok) setMsg(res.msg ?? "Aktion nicht möglich.");
    else setMsg(null);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "16px 20px" }}>
      <h3 style={{ margin: "0 0 4px", color: "#263238" }}>Deine Ausrichtung</h3>
      <p style={{ color: "#607d8b", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Wähle eine strategische Identität für deinen Markt. Jeder Pfad hat klare Vor- und Nachteile.
        {specialization === null
          ? " Die erste Wahl ist gratis."
          : ` Ein Wechsel kostet ${euro(SPEC_SWITCH_COST)}.`}
      </p>

      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 }}>
          ⚠️ {msg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {SPECIALIZATIONS.map((s) => {
          const active = specialization === s.id;
          const cost = specialization === null ? 0 : SPEC_SWITCH_COST;
          const canAfford = active || cost <= cash;
          return (
            <div
              key={s.id}
              style={{
                background: active ? "#e8f5e9" : "#fff",
                border: `2px solid ${active ? "#43a047" : "#cfd8dc"}`,
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 30 }}>{s.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#263238" }}>{s.name}</div>
                  {active && <div style={{ fontSize: 11, color: "#2e7d32", fontWeight: 700 }}>✓ AKTIV</div>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "#78909c", lineHeight: 1.4 }}>
                {s.tagline}
              </div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13, color: "#388e3c", lineHeight: 1.5 }}>
                {s.perks.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ fontSize: 12, color: "#c62828", lineHeight: 1.4, marginTop: 2 }}>
                ⚠️ {s.tradeoff}
              </div>
              <button
                disabled={active || !canAfford}
                onClick={() => handlePick(s.id)}
                style={{
                  marginTop: "auto",
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  background: active ? "#a5d6a7" : canAfford ? "#2e7d32" : "#cfd8dc",
                  color: active ? "#1b5e20" : "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: active || !canAfford ? "default" : "pointer",
                }}
              >
                {active
                  ? "Aktiv"
                  : specialization === null
                    ? "Diese Ausrichtung wählen"
                    : canAfford
                      ? `Wechseln (${euro(SPEC_SWITCH_COST)})`
                      : `${euro(SPEC_SWITCH_COST)} nötig`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Design / Ladengestaltung ---------------------------------------------

function DesignView() {
  const storeTheme  = useEconomy((s) => s.storeTheme);
  const cash        = useEconomy((s) => s.cash);
  const setTheme    = useEconomy((s) => s.setStoreTheme);
  const [msg, setMsg] = useState<string | null>(null);

  const handle = (id: StoreTheme) => {
    const r = setTheme(id);
    setMsg(r.ok ? null : r.msg ?? null);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "16px 20px" }}>
      <h3 style={{ margin: "0 0 4px", color: "#263238" }}>Ladengestaltung</h3>
      <p style={{ color: "#607d8b", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Wähle eine Einrichtung für deinen Laden — beeinflusst Kundenstrom und Zufriedenheit.
        Umbau auf ein neues Design kostet {euro(THEME_SWITCH_COST)}; Rückwechsel auf Standard ist kostenlos.
      </p>

      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 }}>
          ⚠️ {msg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {STORE_THEMES.map((t) => {
          const active   = storeTheme === t.id;
          const cost     = t.id === "standard" ? 0 : THEME_SWITCH_COST;
          const canAfford = active || cost === 0 || cash >= cost;
          return (
            <div key={t.id} style={{
              background: active ? "#e8f5e9" : "#fff",
              border: `2px solid ${active ? "#43a047" : "#cfd8dc"}`,
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 30 }}>{t.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#263238" }}>{t.name}</div>
                  {active && <div style={{ fontSize: 11, color: "#2e7d32", fontWeight: 700 }}>✓ AKTIV</div>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "#78909c", lineHeight: 1.4 }}>{t.tagline}</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13, color: "#388e3c", lineHeight: 1.5 }}>
                {t.perks.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ fontSize: 12, color: "#c62828", lineHeight: 1.4, marginTop: 2 }}>⚠️ {t.tradeoff}</div>
              <button
                disabled={active || !canAfford}
                onClick={() => handle(t.id)}
                style={{
                  marginTop: "auto", padding: "9px 0", borderRadius: 8, border: "none",
                  background: active ? "#a5d6a7" : canAfford ? "#2e7d32" : "#cfd8dc",
                  color: active ? "#1b5e20" : "#fff",
                  fontWeight: 700, fontSize: 14,
                  cursor: active || !canAfford ? "default" : "pointer",
                }}
              >
                {active ? "Aktiv" : cost === 0 ? "Standard wählen" : canAfford ? `Umbau (${euro(cost)})` : `${euro(cost)} nötig`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Krisen-Banner --------------------------------------------------------

const CRISIS_META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  hitzewelle:    { icon: "☀️", label: "Hitzewelle",    color: "#b71c1c", bg: "#fff8e1", border: "#ef9a9a" },
  preiskampf:    { icon: "⚔️", label: "Preiskampf",    color: "#1565c0", bg: "#e3f2fd", border: "#90caf9" },
  lieferskandal: { icon: "🚨", label: "Lieferskandal", color: "#6a1b9a", bg: "#f3e5f5", border: "#ce93d8" },
};

export function CrisisBanner({ crisis, day }: { crisis: SeasonCrisis; day: number }) {
  const meta = CRISIS_META[crisis.type];
  const daysLeft = Math.max(0, crisis.endDay - day + 1);

  let detail = "";
  if (crisis.type === "hitzewelle") {
    detail = "Frischware-Haltbarkeit ist halbiert";
  } else if (crisis.type === "preiskampf") {
    const names = (crisis.affectedProductIds ?? [])
      .map((id) => CATALOG.find((p) => p.id === id)?.name ?? id)
      .join(", ");
    detail = `−25 % Nachfrage: ${names || "ausgewählte Produkte"}`;
  } else if (crisis.type === "lieferskandal") {
    const sup = SUPPLIERS.find((s) => s.id === crisis.affectedSupplierId);
    detail = `${sup?.name ?? "Lieferant"} vorübergehend gesperrt`;
  }

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderLeft: `4px solid ${meta.color}`,
      color: meta.color,
      padding: "7px 14px",
      fontSize: 13,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 16 }}>{meta.icon}</span>
      <span>Krise aktiv: {meta.label}</span>
      <span style={{ fontWeight: 400, color: "#555", marginLeft: 4 }}>— {detail}</span>
      <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
        noch {daysLeft} {daysLeft === 1 ? "Tag" : "Tage"}
      </span>
    </div>
  );
}
