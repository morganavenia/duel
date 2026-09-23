import { sql, init, players, who, etDate, shiftDate, pushTo, body } from "./_lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!sql) return res.status(503).json({ error: "no_db" });
  try { await init(); } catch (e) { return res.status(503).json({ error: "db_unavailable" }); }
  const b = req.method === "POST" ? body(req) : {};
  const me = who(req.method === "POST" ? b.k : req.query.k);
  if (!me) return res.status(401).json({ error: "bad_key" });
  const opp = players().find(p => p.id !== me.id);
  const today = etDate();

  if (req.method === "POST") {
    const { date, guesses, status } = b;
    if (date !== today && date !== shiftDate(today, -1)) return res.status(400).json({ error: "bad_date" });
    if (!Array.isArray(guesses) || guesses.length > 6 || !guesses.every(g => typeof g === "string" && /^[a-z]{5}$/.test(g)))
      return res.status(400).json({ error: "bad_guesses" });
    if (!["playing", "won", "lost"].includes(status)) return res.status(400).json({ error: "bad_status" });
    const prev = (await sql`select guesses, status, finished_at from duel_games where date = ${date} and player = ${me.id}`)[0];
    if (prev && Array.isArray(prev.guesses) && prev.guesses.length > guesses.length) return res.json({ ok: true, ignored: true });
    const doneNow = status !== "playing";
    const wasDone = !!prev && prev.status !== "playing";
    const fin = doneNow ? (prev && prev.finished_at ? new Date(prev.finished_at).toISOString() : new Date().toISOString()) : null;
    await sql`insert into duel_games (date, player, guesses, status, finished_at, updated_at)
      values (${date}, ${me.id}, ${JSON.stringify(guesses)}::jsonb, ${status}, ${fin}, now())
      on conflict (date, player) do update set guesses = excluded.guesses, status = excluded.status,
      finished_at = excluded.finished_at, updated_at = now()`;
    if (doneNow && !wasDone && date === today) {
      const og = (await sql`select status from duel_games where date = ${date} and player = ${opp.id}`)[0];
      const oppDone = og && og.status !== "playing";
      try {
        await pushTo(opp.id, {
          title: "Word Duel",
          body: oppDone ? me.name + " finished. See who took the day." : me.name + " finished today's puzzle. Your move.",
          tag: "duel-" + date
        });
      } catch (e) {}
    }
    return res.json({ ok: true });
  }

  const rows = await sql`select date, player, guesses, status from duel_games where date >= ${shiftDate(today, -400)} order by date desc`;
  res.json({
    me: { id: me.id, name: me.name }, opp: { id: opp.id, name: opp.name },
    today, games: rows, vapid: process.env.VAPID_PUBLIC || null
  });
}
