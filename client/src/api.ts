export interface ScoreEntry {
  name: string;
  score: number;
  wave: number;
  kills: number;
  voidKills: number;
  at: number;
}

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export async function fetchLeaderboard(): Promise<ScoreEntry[]> {
  const res = await fetch(`${BASE}/scores?board=endless`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as ScoreEntry[];
}

export async function submitScore(entry: Omit<ScoreEntry, "at">): Promise<{ rank: number }> {
  const res = await fetch(`${BASE}/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ board: "endless", ...entry }),
  });
  if (!res.ok) throw new Error(`submit ${res.status}`);
  return (await res.json()) as { rank: number };
}
