import { useState } from "react";
import { useEconomy } from "../../../economy/economyStore";
import { CATALOG, euro, dayToCalendar } from "../../../economy/catalog";
import { CATEGORIES, SEASON_EMOJI } from "./shared";

// --- Statistik-Ansicht ----------------------------------------------------
type StatTab = "uebersicht" | "verlauf" | "produkte" | "kategorien";

export function StatistikView() {
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
