import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const PORT = Number(process.env.PORT ?? 3006);
const DATA_DIR = process.env.KESSLER_DATA ?? path.join(root, "server-data");
const FILE = path.join(DATA_DIR, "scores.json");

interface Entry { name: string; score: number; wave: number; kills: number; voidKills: number; at: number }
type Boards = Record<string, Entry[]>;

fs.mkdirSync(DATA_DIR, { recursive: true });
let boards: Boards = fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, "utf8")) as Boards) : {};
let writeTimer: NodeJS.Timeout | null = null;
function persist(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    fs.writeFileSync(FILE, JSON.stringify(boards));
  }, 500);
}

function boardKey(board: unknown, day: unknown): string | null {
  if (board === "endless") return "endless";
  if (board === "daily" && typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) return `daily:${day}`;
  return null;
}

const app = express();
app.use(express.json({ limit: "4kb" }));
const api = express.Router();
// Apache proxies /kessler/* to / here; when hit directly the prefix is still present, so mount both.
app.use("/api", api);
app.use("/kessler/api", api);

api.get("/scores", (req, res) => {
  const key = boardKey(req.query.board, req.query.day);
  if (!key) return res.status(400).json({ error: "bad board" });
  res.json((boards[key] ?? []).slice(0, 20));
});

api.post("/scores", (req, res) => {
  const b = req.body ?? {};
  const key = boardKey(b.board, b.day);
  if (!key) return res.status(400).json({ error: "bad board" });
  const name = String(b.name ?? "anonymous").replace(/[^\w \-.!?]/g, "").slice(0, 16) || "anonymous";
  const num = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);
  const score = num(b.score, 5_000_000), wave = num(b.wave, 500), kills = num(b.kills, 100_000), voidKills = num(b.voidKills, 100_000);
  if (score === null || wave === null || kills === null || voidKills === null) return res.status(400).json({ error: "bad entry" });
  const list = boards[key] ?? (boards[key] = []);
  const entry: Entry = { name, score, wave, kills, voidKills, at: Date.now() };
  list.push(entry);
  list.sort((x, y) => y.score - x.score || x.at - y.at);
  if (list.length > 200) list.length = 200;
  persist();
  res.json({ rank: list.indexOf(entry) + 1 });
});

api.get("/health", (_req, res) => res.json({ ok: true, boards: Object.keys(boards).length }));

const clientDir = path.join(root, "dist", "client");
app.use("/kessler", express.static(clientDir, { maxAge: "1h", index: "index.html" }));
app.use(express.static(clientDir, { maxAge: "1h", index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(clientDir, "index.html")));

app.listen(PORT, () => console.log(`kessler on :${PORT}`));
