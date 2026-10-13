// Ascent sync API: stores your ticks, daily log and settings in Upstash Redis.
// GET  /api/state  -> { done: {...}, updatedAt }
// PUT  /api/state  -> body { done: {...}, log: { "2": { steps, note, complete, food } }, settings: { stepGoal } }
// Both need the header  x-passphrase: <APP_PASSPHRASE>
import { timingSafeEqual } from "node:crypto";

const KEY = "reboot15:state";
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PASS = process.env.APP_PASSPHRASE || "";

function okPass(given) {
  if (!PASS || typeof given !== "string") return false;
  const a = Buffer.from(given), b = Buffer.from(PASS);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Redis HTTP ${r.status}`);
  return j.result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "Database not connected. Add the Upstash integration in Vercel." });
  if (!PASS) return res.status(500).json({ error: "APP_PASSPHRASE is not set in Vercel environment variables." });
  if (!okPass(req.headers["x-passphrase"])) return res.status(401).json({ error: "Wrong passphrase." });

  try {
    if (req.method === "GET") {
      const raw = await redis(["GET", KEY]);
      return res.status(200).json(raw ? { log: {}, settings: {}, ...JSON.parse(raw) } : { done: {}, log: {}, settings: {}, updatedAt: null });
    }
    if (req.method === "PUT") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const done = body && typeof body.done === "object" && !Array.isArray(body.done) ? body.done : null;
      if (!done) return res.status(400).json({ error: "Body must be { done: {...} }." });
      const clean = {};
      for (const [k, v] of Object.entries(done)) if (/^d\d{1,2}-[a-z]+\d*$/.test(k) && v === true) clean[k] = true;
      const log = {};
      const rawLog = body.log && typeof body.log === "object" && !Array.isArray(body.log) ? body.log : {};
      for (const [k, v] of Object.entries(rawLog)) {
        if (!/^\d{1,2}$/.test(k) || !v || typeof v !== "object") continue;
        const e = {};
        const steps = Number(v.steps);
        if (Number.isInteger(steps) && steps > 0 && steps <= 100000) e.steps = steps;
        if (typeof v.note === "string" && v.note.trim()) e.note = v.note.slice(0, 1000);
        if (v.complete === true) e.complete = true;
        for (const k of ["weight", "waist"]) { const n = Number(v[k]); if (n >= 30 && n <= 200) e[k] = Math.round(n * 10) / 10; }
        { const b = Number(v.bike); if (Number.isInteger(b) && b > 0 && b <= 20) e.bike = b; }
        if (v.t && typeof v.t === "object") {
          const t = {};
          for (const k of ["teethAm", "teethMid", "teethPm", "cal", "pro", "water", "salt", "carb", "sleep", "drinks"]) if (v.t[k] === true) t[k] = true;
          if (Object.keys(t).length) e.t = t;
        }
        if (v.edit && typeof v.edit === "object") {
          const x = v.edit, ed = {};
          if (typeof x.title === "string" && x.title.trim()) ed.title = x.title.slice(0, 60);
          if (typeof x.time === "string") ed.time = x.time.slice(0, 20);
          if (Array.isArray(x.tags)) { const t = x.tags.filter((t) => typeof t === "string" && t.trim()).slice(0, 8).map((t) => t.slice(0, 30)); if (t.length) ed.tags = t; }
          if (Array.isArray(x.removed)) { const r = x.removed.filter((id) => typeof id === "string" && /^d\d{1,2}-[a-z]+\d*$/.test(id)).slice(0, 40); if (r.length) ed.removed = r; }
          if (Array.isArray(x.added)) { const ad = x.added.filter((a) => a && typeof a.id === "string" && /^a\d{1,6}$/.test(a.id) && typeof a.text === "string" && a.text.trim()).slice(0, 20).map((a) => ({ id: a.id, text: a.text.slice(0, 120) })); if (ad.length) ed.added = ad; }
          if (Number.isInteger(x.seq) && x.seq > 0 && x.seq < 1e6) ed.seq = x.seq;
          if (Object.keys(ed).some((k) => k !== "seq")) e.edit = ed;
        }
        if (v.food && typeof v.food === "object") {
          const f = {};
          for (const m of ["b", "l", "s", "d"]) if (typeof v.food[m] === "string" && v.food[m].trim()) f[m] = v.food[m].slice(0, 300);
          if (Object.keys(f).length) e.food = f;
        }
        if (Object.keys(e).length) log[k] = e;
      }
      const settings = {};
      const g = Number(body.settings && body.settings.stepGoal);
      if (Number.isInteger(g) && g >= 1000 && g <= 40000) settings.stepGoal = g;
      const value = { done: clean, log, settings, updatedAt: new Date().toISOString() };
      await redis(["SET", KEY, JSON.stringify(value)]);
      return res.status(200).json(value);
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    return res.status(502).json({ error: "Database error: " + e.message });
  }
}
