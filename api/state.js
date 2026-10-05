// Reboot 15 sync API: stores your ticks in Upstash Redis.
// GET  /api/state  -> { done: {...}, updatedAt }
// PUT  /api/state  -> body { done: {...} }
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
      return res.status(200).json(raw ? JSON.parse(raw) : { done: {}, updatedAt: null });
    }
    if (req.method === "PUT") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      const done = body && typeof body.done === "object" && !Array.isArray(body.done) ? body.done : null;
      if (!done) return res.status(400).json({ error: "Body must be { done: {...} }." });
      const clean = {};
      for (const [k, v] of Object.entries(done)) if (/^d\d{1,2}-[a-z]+\d*$/.test(k) && v === true) clean[k] = true;
      const value = { done: clean, updatedAt: new Date().toISOString() };
      await redis(["SET", KEY, JSON.stringify(value)]);
      return res.status(200).json(value);
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    return res.status(502).json({ error: "Database error: " + e.message });
  }
}
