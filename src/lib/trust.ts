import type { Profile } from "./db";

export function trustScore(p: Pick<Profile, "rating" | "total_trades" | "completed_trades">): number {
  const rating = Number(p.rating ?? 0);
  const total = Number(p.total_trades ?? 0);
  const completed = Number(p.completed_trades ?? 0);
  const successRate = total > 0 ? completed / total : 0;
  const ratingScore = (rating / 5) * 60;
  const successScore = successRate * 30;
  const volumeScore = (Math.min(total, 50) / 50) * 10;
  return Math.round(ratingScore + successScore + volumeScore);
}

export function trustLabel(score: number) {
  if (score >= 90) return { label: "Elite", color: "text-emerald-600" };
  if (score >= 75) return { label: "Trusted", color: "text-primary" };
  if (score >= 50) return { label: "Established", color: "text-amber-600" };
  return { label: "New", color: "text-muted-foreground" };
}
