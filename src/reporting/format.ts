export type Unit = "percent" | "ms" | "usd" | "score" | "count";

export function formatUnit(unit: Unit, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  switch (unit) {
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "ms":
      return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
    case "usd":
      return value !== 0 && Math.abs(value) < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;
    case "score":
      return value.toFixed(2);
    case "count":
      return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
}

export function formatDelta(unit: Unit, delta: number | null): string {
  if (delta === null) return "n/a";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const abs = Math.abs(delta);
  switch (unit) {
    case "percent":
      return `${sign}${(abs * 100).toFixed(1)} pts`;
    case "ms":
      return `${sign}${formatUnit("ms", abs)}`;
    case "usd":
      return `${sign}${formatUnit("usd", abs)}`;
    case "score":
      return `${sign}${abs.toFixed(2)}`;
    case "count":
      return `${sign}${formatUnit("count", abs)}`;
  }
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
