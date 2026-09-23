import { sql, init, etDate, puzzleNo, pushTo } from "./_lib.js";

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== "Bearer " + process.env.CRON_SECRET) return res.status(401).end();
  if (!sql) return res.status(503).json({ error: "no_db" });
  await init();
  const d = etDate();
  await pushTo(null, { title: "Word Duel", body: "Puzzle " + puzzleNo(d) + " is up. Go get it.", tag: "daily-" + d });
  res.json({ ok: true });
}
