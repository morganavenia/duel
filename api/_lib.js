import { neon } from "@neondatabase/serverless";
import webpush from "web-push";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;
export const sql = url ? neon(url) : null;

let ready;
export function init() {
  if (!ready) {
    ready = (async () => {
      await sql`create table if not exists duel_games (
        date text not null, player text not null, guesses jsonb not null default '[]'::jsonb,
        status text not null default 'playing', finished_at timestamptz, updated_at timestamptz not null default now(),
        primary key (date, player))`;
      await sql`create table if not exists duel_subs (
        endpoint text primary key, player text not null, sub jsonb not null, created_at timestamptz not null default now())`;
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

export function players() {
  return [
    { id: "morgan", name: process.env.P1_NAME || "Morgan", token: process.env.P1_TOKEN },
    { id: "blake", name: process.env.P2_NAME || "Blake", token: process.env.P2_TOKEN }
  ];
}
export function who(k) {
  if (!k || typeof k !== "string") return null;
  return players().find(p => p.token && p.token === k) || null;
}

const TZ = "America/New_York";
export function etDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function shiftDate(ds, k) {
  const [y, m, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10);
}
export function puzzleNo(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 8, 23)) / 864e5) + 1;
}

let vapidOk = false;
if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
  try { webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:duel@example.com", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE); vapidOk = true; } catch (e) {}
}
export async function pushTo(playerId, payload) {
  if (!vapidOk) return;
  const rows = playerId
    ? await sql`select endpoint, sub from duel_subs where player = ${playerId}`
    : await sql`select endpoint, sub from duel_subs`;
  await Promise.all(rows.map(async r => {
    try { await webpush.sendNotification(r.sub, JSON.stringify(payload), { TTL: 43200, urgency: "high" }); }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await sql`delete from duel_subs where endpoint = ${r.endpoint}`; }
  }));
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch (e) { return {}; }
}
