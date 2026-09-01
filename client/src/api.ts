export interface ScoreEntry {
  name: string;
  score: number;
  wave: number;
  kills: number;
  voidKills: number;
  at: number;
}

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export async function fetchLeaderboard(board: "endless" | "daily", day?: string): Promise<ScoreEntry[]> {
  const res = await fetch(`${BASE}/scores?board=${board}${day ? `&day=${day}` : ""}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as ScoreEntry[];
}

export async function submitScore(board: "endless" | "daily", entry: Omit<ScoreEntry, "at">, day?: string): Promise<{ rank: number }> {
  const res = await fetch(`${BASE}/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ board, day, ...entry }),
  });
  if (!res.ok) throw new Error(`submit ${res.status}`);
  return (await res.json()) as { rank: number };
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
