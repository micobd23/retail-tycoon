import { useCompetitor } from "../../economy/competitorStore";
import { useEconomy } from "../../economy/economyStore";
import "./browser.css";

const TYPE_LABEL: Record<string, string> = {
  discounter: "🏷️ Discounter",
  bio: "🌿 Bio-Markt",
};

const STRATEGY_LABEL: Record<string, string> = {
  expansion: "Expansions-Strategie",
  volume: "Volumen-Strategie",
  quality: "Qualitäts-Fokus",
};

const STRATEGY_DESC: Record<string, string> = {
  expansion: "Wächst aggressiv — früh viel Marktanteil sichern.",
  volume: "Stetiges Wachstum — hört nie auf, aber nie ein Sprint.",
  quality: "Langsamer Start, starkes Fundament — langfristig gefährlich.",
};

function StrengthBar({ value }: { value: number }) {
  const pct = Math.round(value);
  const color =
    pct < 30 ? "#66bb6a" : pct < 60 ? "#ffa726" : "#ef5350";
  return (
    <div className="comp-bar-wrap">
      <div
        className="comp-bar-fill"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="comp-bar-label">{pct} %</span>
    </div>
  );
}

export function BrowserApp() {
  const competitors = useCompetitor((s) => s.competitors);
  const visibleNews = useCompetitor((s) => s.visibleNews);
  const firmName = useEconomy((s) => s.firmName);
  const started = useEconomy((s) => s.started);

  return (
    <div className="app-pad browser-app">
      <div className="browser-bar">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <div className="browser-url">retailnet://markt/wettbewerb</div>
      </div>

      {!started ? (
        <div className="app-placeholder">
          <div className="app-placeholder-icon">🌐</div>
          <h3>RetailNet Explorer</h3>
          <p>Starte ein Spiel, um den Marktbericht zu sehen.</p>
        </div>
      ) : (
        <div className="browser-content">
          <h2 className="browser-title">
            Marktbericht
            {firmName && <span className="browser-firm"> — {firmName}</span>}
          </h2>

          {/* Konkurrenten-Übersicht */}
          <section className="browser-section">
            <h3 className="browser-section-title">Konkurrenten</h3>
            <div className="comp-list">
              {competitors.map((c) => (
                <div key={c.id} className="comp-card">
                  <div className="comp-header">
                    <span className="comp-name">{c.name}</span>
                    <span className="comp-type">{TYPE_LABEL[c.type]}</span>
                  </div>
                  <div className="comp-strategy">{STRATEGY_LABEL[c.strategy]}</div>
                  <div className="comp-desc">{STRATEGY_DESC[c.strategy]}</div>
                  <div className="comp-strength-row">
                    <span className="comp-strength-label">Marktstärke</span>
                    <StrengthBar value={c.strength} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* News-Feed */}
          <section className="browser-section">
            <h3 className="browser-section-title">📰 Markt-Nachrichten</h3>
            {visibleNews.length === 0 ? (
              <p className="browser-empty">Noch keine Meldungen — Markt beobachten…</p>
            ) : (
              <div className="news-list">
                {visibleNews.map((n, i) => {
                  const comp = competitors.find((c) => c.id === n.competitorId);
                  return (
                    <div key={i} className="news-item">
                      <div className="news-meta">
                        <span className="news-day">Tag {n.day}</span>
                        <span className="news-who">{comp?.name ?? n.competitorId}</span>
                      </div>
                      <p className="news-text">{n.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
