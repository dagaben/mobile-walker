/** Shared multiplayer top-10 leaderboard (all players read/write the same remote list). */

export interface LeaderboardEntry {
  name: string;
  score: number;
  at: number;
}

const MAX_ENTRIES = 10;
const LOCAL_CACHE_KEY = "vampireducks_v2_leaderboard_cache";

/**
 * Public shared blob so every player sees and updates the same board.
 * CORS-enabled; concurrent clients GET → merge → PUT.
 */
const REMOTE_URL = "https://jsonblob.com/api/jsonBlob/019fc699-a49d-72a2-b29f-155f073032ca";

function normalize(entries: unknown): LeaderboardEntry[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const rec = e as Record<string, unknown>;
      const name = String(rec.name ?? "???")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 3)
        .padEnd(3, "X");
      const score = Math.max(0, Math.floor(Number(rec.score) || 0));
      const at = Number(rec.at) || 0;
      return { name, score, at };
    })
    .filter((e): e is LeaderboardEntry => e !== null)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES);
}

function cacheLocal(entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota */
  }
}

function readLocalCache(): LeaderboardEntry[] {
  try {
    return normalize(JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "[]"));
  } catch {
    return [];
  }
}

/** Fetch the global shared leaderboard (falls back to local cache offline). */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(REMOTE_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = normalize(await res.json());
    cacheLocal(data);
    return data;
  } catch {
    return readLocalCache();
  }
}

/**
 * Submit a score to the shared board. Merges with current remote top-10.
 * Returns the updated list.
 */
export async function submitScore(name: string, score: number): Promise<LeaderboardEntry[]> {
  const cleanName = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3)
    .padEnd(3, "A");
  const entry: LeaderboardEntry = {
    name: cleanName,
    score: Math.max(0, Math.floor(score)),
    at: Date.now(),
  };

  let remote = await fetchLeaderboard();
  remote = normalize([...remote, entry]);

  try {
    const res = await fetch(REMOTE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(remote),
    });
    if (res.ok) {
      const saved = normalize(await res.json().catch(() => remote));
      cacheLocal(saved.length ? saved : remote);
      return saved.length ? saved : remote;
    }
  } catch {
    /* fall through */
  }

  cacheLocal(remote);
  return remote;
}

export function qualifiesForBoard(score: number, current: LeaderboardEntry[]): boolean {
  if (current.length < MAX_ENTRIES) return score > 0;
  return score > (current[current.length - 1]?.score ?? 0);
}

export function renderLeaderboardList(listEl: HTMLElement, scores: LeaderboardEntry[]): void {
  listEl.innerHTML = "";
  if (!scores.length) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="lb-name">---</span><span class="lb-score">0</span>';
    listEl.appendChild(li);
    return;
  }
  for (const entry of scores) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="lb-name">${entry.name}</span><span class="lb-score">${entry.score}</span>`;
    listEl.appendChild(li);
  }
}
