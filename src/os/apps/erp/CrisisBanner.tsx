import { CATALOG, SUPPLIERS } from "../../../economy/catalog";
import { type SeasonCrisis } from "../../../economy/economyStore";

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
