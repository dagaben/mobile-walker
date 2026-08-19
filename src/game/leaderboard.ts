/** Shared multiplayer top-10 leaderboard (all players read/write the same remote list). */

export interface LeaderboardEntry {
  name: string;
  score: number;
  at: number;
}

const MAX_ENTRIES = 10;
const LOCAL_CACHE_KEY = "vampireducks_v2_leaderboard_cache";
const PUT_ATTEMPTS = 3;

/**
 * Public shared blob so every player sees and updates the same board.
 * CORS-enabled; concurrent clients GET → merge → PUT.
 */
const REMOTE_URL = "https://jsonblob.com/api/jsonBlob/019fc699-a49d-72a2-b29f-155f073032ca";

type FetchResult =
  | { status: "remote"; entries: LeaderboardEntry[] }
  | { status: "offline"; entries: LeaderboardEntry[] };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Accept a raw array or { entries: [...] }. Anything else is invalid (do not treat as empty board). */
function extractPayload(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { entries?: unknown }).entries)) {
    return (data as { entries: unknown[] }).entries;
  }
  return null;
}

function normalize(entries: unknown): LeaderboardEntry[] {
  const payload = extractPayload(entries);
  if (!payload) return [];
  return payload
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

function mergeBoards(...lists: LeaderboardEntry[][]): LeaderboardEntry[] {
  const seen = new Set<string>();
  const merged: LeaderboardEntry[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.name}|${entry.score}|${entry.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return normalize(merged);
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

async function fetchLeaderboardResult(): Promise<FetchResult> {
  try {
    const res = await fetch(REMOTE_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (extractPayload(json) === null) {
      // Remote is present but not a board. Do not treat as empty — a PUT would wipe it.
      return { status: "offline", entries: readLocalCache() };
    }
    const data = normalize(json);
    cacheLocal(mergeBoards(data, readLocalCache()));
    return { status: "remote", entries: data };
  } catch {
    return { status: "offline", entries: readLocalCache() };
  }
}

async function putBoard(entries: LeaderboardEntry[]): Promise<boolean> {
  const res = await fetch(REMOTE_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(entries),
  });
  return res.ok;
}

/** Fetch the global shared leaderboard (falls back to local cache offline). */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const result = await fetchLeaderboardResult();
  return mergeBoards(result.entries, readLocalCache());
}

/**
 * Submit a score to the shared board. Merges with the current remote top-10.
 * Never PUTs a one-player list after a failed GET (that previously wiped the board).
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

  for (let attempt = 0; attempt < PUT_ATTEMPTS; attempt += 1) {
    const result = await fetchLeaderboardResult();
    if (result.status !== "remote") {
      await delay(250 * (attempt + 1));
      continue;
    }

    const merged = mergeBoards(result.entries, readLocalCache(), [entry]);
    try {
      if (await putBoard(merged)) {
        cacheLocal(merged);
        return merged;
      }
    } catch {
      /* retry */
    }
    await delay(250 * (attempt + 1));
  }

  // Remote unreachable: keep the score locally only. Do not PUT — that would
  // replace the shared blob with a single entry and erase everyone else.
  const localOnly = mergeBoards(readLocalCache(), [entry]);
  cacheLocal(localOnly);
  return localOnly;
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
