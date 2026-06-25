import { useGoal, type YearEndData, type SeasonResult } from "../economy/goalStore";
import { euro } from "../economy/catalog";
import "./yearend.css";

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

const RATING_META: Record<string, { color: string; desc: string }> = {
  S: { color: "#f9a825", desc: "Perfekt — kein Supermarkt macht dir etwas vor!" },
  A: { color: "#43a047", desc: "Sehr gut — starke Leistung über alle Saisons!" },
  B: { color: "#1e88e5", desc: "Gut — solider Betrieb mit Luft nach oben." },
  C: { color: "#fb8c00", desc: "Befriedigend — mehr Ziele anpeilen!" },
  D: { color: "#e53935", desc: "Ausbaufähig — nächstes Jahr wird besser!" },
};

export function YearEnd() {
  const yearEndOpen = useGoal((s) => s.yearEndOpen);
  const yearEndData = useGoal((s) => s.yearEndData);
  const closeYearEnd = useGoal((s) => s.closeYearEnd);

  if (!yearEndOpen || !yearEndData) return null;

  return (
    <div className="ye-overlay">
      <div className="ye-card">
        <Content data={yearEndData} onClose={closeYearEnd} />
      </div>
    </div>
  );
}

function Content({ data, onClose }: { data: YearEndData; onClose: () => void }) {
  const meta = RATING_META[data.rating];
  const goalPct = data.goalsTotal > 0 ? Math.round((data.goalsCompleted / data.goalsTotal) * 100) : 0;

  return (
    <>
      <div className="ye-header">
        <div className="ye-kicker">Jahresabschluss</div>
        <h1 className="ye-title">Jahr {data.year} abgeschlossen</h1>
      </div>

      {/* Note */}
      <div className="ye-rating">
        <div className="ye-badge" style={{ color: meta.color, borderColor: meta.color }}>
          {data.rating}
        </div>
        <div className="ye-rating-desc">{meta.desc}</div>
      </div>

      {/* KPIs */}
      <div className="ye-kpis">
        <KpiTile label="Jahresumsatz" value={euro(data.totalRevenue)} color="#2e7d32" />
        <KpiTile
          label="Ø Zufriedenheit"
          value={data.avgSatisfaction + "%"}
          color={data.avgSatisfaction >= 80 ? "#2e7d32" : data.avgSatisfaction >= 60 ? "#f9a825" : "#e53935"}
        />
        <KpiTile label="Boni verdient" value={euro(data.totalCashBonus)} color="#1e88e5" />
        <KpiTile
          label="Ziele erfüllt"
          value={`${data.goalsCompleted} / ${data.goalsTotal}`}
          sub={goalPct + "%"}
          color={goalPct >= 75 ? "#2e7d32" : goalPct >= 50 ? "#f9a825" : "#e53935"}
        />
      </div>

      {/* Saisons */}
      {data.seasonResults.length > 0 && (
        <div className="ye-seasons">
          <div className="ye-section-title">Saison-Übersicht</div>
          <div className="ye-season-grid">
            {data.seasonResults.map((r, i) => (
              <SeasonCard key={i} result={r} />
            ))}
          </div>
        </div>
      )}

      <div className="ye-actions">
        <button className="ye-btn" onClick={onClose}>
          Weiter zu Jahr {data.year + 1} ▶
        </button>
      </div>
      <p className="ye-hint">Die Ziele werden jetzt schwieriger — bleib auf Kurs!</p>
    </>
  );
}

function KpiTile({ label, value, color, sub }: {
  label: string; value: string; color: string; sub?: string;
}) {
  return (
    <div className="ye-kpi">
      <div className="ye-kpi-label">{label}</div>
      <div className="ye-kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="ye-kpi-sub">{sub}</div>}
    </div>
  );
}

function SeasonCard({ result }: { result: SeasonResult }) {
  const perfect = result.goalsCompleted === result.goalsTotal;
  return (
    <div className="ye-season-card">
      <div className="ye-season-name">{SEASON_EMOJI[result.season]} {result.season}</div>
      <div className="ye-season-revenue">{euro(result.seasonRevenue)}</div>
      <div className={"ye-season-goals" + (perfect ? " perfect" : "")}>
        {result.goalsCompleted}/{result.goalsTotal} Ziele
      </div>
    </div>
  );
}
