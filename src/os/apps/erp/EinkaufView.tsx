import { useState } from "react";
import {
  useEconomy,
  stockOf,
  usedCapacity,
  capacityOf,
  pendingCapOf,
  type PendingOrder,
} from "../../../economy/economyStore";
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
  type Product,
} from "../../../economy/catalog";
import { CATEGORIES, SEASON_EMOJI, type Filter, FILTERS, DEFAULT_QTY, empfMenge } from "./shared";

// --- Einkauf-Ansicht ------------------------------------------------------
export function EinkaufView({ setMsg }: { setMsg: (m: string) => void }) {
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
  const specialization = useEconomy((s) => s.specialization);
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
  const cap = capacityOf(upgrades, specialization);
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
