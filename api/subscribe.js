import { sql, init, who, body } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!sql) return res.status(503).json({ error: "no_db" });
  try { await init(); } catch (e) { return res.status(503).json({ error: "db_unavailable" }); }
  const b = body(req);
  const me = who(b.k);
  if (!me) return res.status(401).json({ error: "bad_key" });
  if (req.method === "POST") {
    const s = b.sub;
    if (!s || typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || !s.keys) return res.status(400).json({ error: "bad_sub" });
    await sql`insert into duel_subs (endpoint, player, sub) values (${s.endpoint}, ${me.id}, ${JSON.stringify(s)}::jsonb)
      on conflict (endpoint) do update set player = excluded.player, sub = excluded.sub`;
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    if (typeof b.endpoint === "string") await sql`delete from duel_subs where endpoint = ${b.endpoint} and player = ${me.id}`;
    return res.json({ ok: true });
  }
  res.status(405).end();
}
