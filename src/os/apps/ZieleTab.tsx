import { useGoal, GOAL_ICONS, type Goal, type SeasonResult } from "../../economy/goalStore";
import { euro } from "../../economy/catalog";
import "./ziele.css";

const SEASON_EMOJI: Record<string, string> = {
  Frühling: "🌸", Sommer: "☀️", Herbst: "🍂", Winter: "❄️",
};

export function ZieleTab() {
  const goals = useGoal((s) => s.goals);
  const currentSeason = useGoal((s) => s.currentSeason);
  const currentYear = useGoal((s) => s.currentYear);
  const seasonResults = useGoal((s) => s.seasonResults);
  const totalCashBonus = useGoal((s) => s.totalCashBonus);
  const done = goals.filter((g) => g.done).length;

  if (!goals.length) {
    return (
      <div className="ziele-empty">
        <p>Noch keine Saisonziele geladen — spiele einen Tag, um die Ziele zu aktivieren.</p>
      </div>
    );
  }

  return (
    <div className="ziele-wrap">
      {/* Aktuelle Saison */}
      <div className="ziele-season-header">
        <div className="ziele-season-title">
          {SEASON_EMOJI[currentSeason ?? "Frühling"]} {currentSeason} · Jahr {currentYear}
        </div>
        <div className="ziele-season-meta">
          <span className="ziele-done-count">{done}/{goals.length} Ziele</span>
          {totalCashBonus > 0 && (
            <span className="ziele-bonus-earned">+{euro(totalCashBonus)} verdient</span>
          )}
        </div>
      </div>

      <div className="ziele-cards">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} />
        ))}
      </div>

      {/* Saisonhistorie */}
      {seasonResults.length > 0 && (
        <div className="ziele-history">
          <div className="ziele-history-title">Abgeschlossene Saisons</div>
          <table className="ziele-history-table">
            <thead>
              <tr>
                <th className="l">Saison</th>
                <th>Ziele</th>
                <th>Umsatz</th>
              </tr>
            </thead>
            <tbody>
              {[...seasonResults].reverse().map((r, i) => (
                <HistoryRow key={i} result={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const icon = GOAL_ICONS[goal.kind];
  const isEndOnly = goal.kind === "satisfaction_end";

  let pct = 0;
  let progressText = "";

  if (goal.done) {
    pct = 100;
  } else if (isEndOnly) {
    pct = 0;
    progressText = "Wird am Saisonende geprüft";
  } else {
    switch (goal.kind) {
      case "fill_rate_day": {
        const p = Math.round(goal.progress * 100);
        pct = Math.min(100, p);
        progressText = goal.progress > 0 ? `Bisher max. ${p}%` : "Noch nicht erreicht";
        break;
      }
      case "no_spoilage_run":
        pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
        progressText = `${goal.progress} / ${goal.target} Tage`;
        break;
      case "units_fresh":
        pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
        progressText = `${goal.progress} / ${goal.target} Stück`;
        break;
      case "revenue_season":
        pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
        progressText = `${euro(goal.progress)} / ${euro(goal.target)}`;
        break;
      case "revenue_day":
        pct = Math.min(100, Math.round((goal.progress / goal.target) * 100));
        progressText = goal.progress > 0 ? `Bisher max. ${euro(goal.progress)}` : "Noch nicht erreicht";
        break;
    }
  }

  return (
    <div className={"ziele-card" + (goal.done ? " done" : "")}>
      <div className="ziele-card-head">
        <span className="ziele-card-icon">{icon}</span>
        <div className="ziele-card-info">
          <div className="ziele-card-label">{goal.label}</div>
          <div className="ziele-card-reward">Bonus: {euro(goal.reward)}</div>
        </div>
        {goal.done && <span className="ziele-check">✓</span>}
      </div>

      {!isEndOnly && !goal.done && (
        <>
          <div className="ziele-bar">
            <div className="ziele-bar-fill" style={{ width: pct + "%" }} />
          </div>
          <div className="ziele-progress-text">{progressText}</div>
        </>
      )}

      {isEndOnly && !goal.done && (
        <div className="ziele-end-hint">{progressText}</div>
      )}

      {goal.done && <div className="ziele-done-label">Abgeschlossen ✓</div>}
    </div>
  );
}

function HistoryRow({ result }: { result: SeasonResult }) {
  const allDone = result.goalsCompleted === result.goalsTotal;
  const noneDone = result.goalsCompleted === 0;
  return (
    <tr>
      <td className="l">
        {SEASON_EMOJI[result.season]} {result.season} · J{result.year}
      </td>
      <td className={allDone ? "ziele-all-done" : noneDone ? "ziele-none-done" : ""}>
        {result.goalsCompleted}/{result.goalsTotal}
      </td>
      <td className="ziele-rev">{euro(result.seasonRevenue)}</td>
    </tr>
  );
}
