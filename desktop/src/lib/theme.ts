export const colors = {
  brand: "#4ADE80",
  positive: "#4ADE80",
  negative: "#FB7185",
  streak: "#FBBF24",
  dim: "#374151",
  textPrimary: "#F9FAFB",
  textSecondary: "#9CA3AF",
  heatNone: "#1a1a2e",
  heatLight: "#064e3b",
  heatModerate: "#059669",
  heatHeavy: "#4ADE80",
  bg: "#0a0a0f",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgCardHover: "rgba(255, 255, 255, 0.06)",
  border: "rgba(255, 255, 255, 0.06)",
  borderActive: "rgba(74, 222, 128, 0.3)",
} as const;

export function getHeatColor(level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 0:
      return colors.heatNone;
    case 1:
      return colors.heatLight;
    case 2:
      return colors.heatModerate;
    case 3:
      return colors.heatHeavy;
  }
}

export function getHeatLevel(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}
