(() => {
const VALID = new Set();
for (let i = 0; i < VALID_RAW.length; i += 5) VALID.add(VALID_RAW.slice(i, i + 5));
ANSWERS.forEach(w => VALID.add(w));

const TZ = "America/New_York";
const EPOCH = Date.UTC(2026, 8, 23);
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const STANDALONE = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const $ = id => document.getElementById(id);

function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function etDate(d = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
const P = ds => ds.split("-").map(Number);
function dayNum(ds) { const [y, m, d] = P(ds); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5); }
function answerFor(ds) { const n = dayNum(ds), L = ANSWERS.length; return ANSWERS[((n % L) + L) % L]; }
function shift(ds, k) { const [y, m, d] = P(ds); return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10); }
function weekStart(ds) { const [y, m, d] = P(ds); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return shift(ds, -((w + 6) % 7)); }
function dayLabel(ds) { const [y, m, d] = P(ds); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) + " " + m + "/" + d; }

function evaluate(g, a) {
  const r = Array(5).fill("miss"), c = {};
  for (let i = 0; i < 5; i++) { if (g[i] === a[i]) r[i] = "hit"; else c[a[i]] = (c[a[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) { if (r[i] !== "hit" && c[g[i]] > 0) { r[i] = "near"; c[g[i]]--; } }
  return r;
}
const statusOf = (gs, a) => gs.includes(a) ? "won" : gs.length >= 6 ? "lost" : "playing";
const done = g => !!g && (g.status === "won" || g.status === "lost");
const pts = g => g && g.status === "won" ? 7 - g.guesses.length : 0;

// key from URL or storage
const qk = new URLSearchParams(location.search).get("k");
if (qk) lsSet("duel:k", qk);
const K = qk || lsGet("duel:k");

const S = { today: etDate(), answer: "", guesses: [], cur: "", status: "playing", busy: false,
  me: null, opp: null, games: {}, vapid: null, range: "week", loaded: false, view: "play" };
const gk = (d, p) => d + "|" + p;

/* ---------- toast, haptics ---------- */
let tt;
function toast(m, ms = 1800) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), ms); }
function buzz(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

/* ---------- grid ---------- */
function buildGrid() {
  const g = $("grid"); g.textContent = "";
  for (let r = 0; r < 6; r++) {
    const row = document.createElement("div"); row.className = "row";
    for (let c = 0; c < 5; c++) { const t = document.createElement("div"); t.className = "tile"; row.appendChild(t); }
    g.appendChild(row);
  }
  renderGrid(-1);
}
function renderGrid(anim, popAt) {
  const rows = $("grid").children;
  for (let r = 0; r < 6; r++) {
    const word = r < S.guesses.length ? S.guesses[r] : (r === S.guesses.length && S.status === "playing" ? S.cur : "");
    const ev = r < S.guesses.length ? evaluate(S.guesses[r], S.answer) : null;
    for (let c = 0; c < 5; c++) {
      const t = rows[r].children[c], ch = word[c] || "";
      t.textContent = ch; t.classList.toggle("filled", !!ch);
      if (popAt === c && r === S.guesses.length && !REDUCE) { t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop"); }
      if (ev) {
        if (r === anim && !REDUCE) {
          t.style.setProperty("--f", c * 0.22 + "s"); t.style.setProperty("--d", c * 0.22 + 0.23 + "s");
          t.classList.remove("flip"); void t.offsetWidth; t.classList.add("flip");
        } else t.style.setProperty("--d", "0s");
        t.dataset.s = ev[c];
      } else { delete t.dataset.s; t.classList.remove("flip"); }
    }
  }
}
function shake() { const r = $("grid").children[S.guesses.length]; if (!r || REDUCE) return; r.classList.remove("shake"); void r.offsetWidth; r.classList.add("shake"); }

/* ---------- keyboard ---------- */
function buildKeys() {
  const kb = $("kb");
  ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"].forEach(r => {
    const row = document.createElement("div"); row.className = "kr";
    for (const ch of r) {
      const b = document.createElement("button"); b.className = "k"; b.type = "button";
      if (ch === "+") { b.textContent = "Enter"; b.classList.add("w"); b.dataset.key = "enter"; }
      else if (ch === "-") { b.textContent = "⌫"; b.classList.add("w"); b.dataset.key = "back"; b.setAttribute("aria-label", "Delete"); }
      else { b.textContent = ch; b.dataset.key = ch; }
      row.appendChild(b);
    }
    kb.appendChild(row);
  });
  kb.addEventListener("click", e => { const b = e.target.closest(".k"); if (b) { buzz(); press(b.dataset.key); } });
}
function renderKeys() {
  const best = {}, rank = { miss: 1, near: 2, hit: 3 };
  S.guesses.forEach(g => evaluate(g, S.answer).forEach((s, i) => { if (!best[g[i]] || rank[s] > rank[best[g[i]]]) best[g[i]] = s; }));
  document.querySelectorAll(".k").forEach(k => { const s = best[k.dataset.key]; if (s) k.dataset.s = s; else delete k.dataset.s; });
}
function press(key) {
  if (S.status !== "playing" || S.busy || S.view !== "play" || !S.me) return;
  if (key === "enter") return submit();
  if (key === "back") { S.cur = S.cur.slice(0, -1); return renderGrid(-1); }
  if (/^[a-z]$/.test(key) && S.cur.length < 5) { S.cur += key; renderGrid(-1, S.cur.length - 1); }
}
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "Enter") { e.preventDefault(); press("enter"); }
  else if (e.key === "Backspace") { e.preventDefault(); press("back"); }
  else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
});

function submit() {
  const g = S.cur;
  if (g.length < 5) { shake(); buzz(30); return toast("Not enough letters"); }
  if (!VALID.has(g)) { shake(); buzz(30); return toast("Not in word list"); }
  S.guesses = [...S.guesses, g]; S.cur = ""; S.status = statusOf(S.guesses, S.answer);
  lsSet("duel:" + S.today, S.guesses);
  renderGrid(S.guesses.length - 1);
  S.busy = true;
  save();
  setTimeout(() => {
    S.busy = false; renderKeys();
    if (S.status === "won") { toast(["First try. Unreal.", "Brilliant", "Sharp", "Nice", "Solid", "Phew"][S.guesses.length - 1]); buzz(40); }
    if (S.status === "lost") toast(S.answer.toUpperCase(), 3000);
    render();
  }, REDUCE ? 60 : 1400);
}

/* ---------- network ---------- */
let saving = false, again = false;
async function save() {
  if (!K || !S.me) return;
  if (saving) { again = true; return; }
  saving = true;
  try {
    do {
      again = false;
      const body = { k: K, date: S.today, guesses: S.guesses.slice(), status: S.status };
      const r = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("save " + r.status);
      S.games[gk(S.today, S.me.id)] = { date: S.today, player: S.me.id, guesses: body.guesses, status: body.status };
    } while (again);
  } catch (e) { toast("Saved on this phone. Will sync when you're back online.", 2600); }
  finally { saving = false; }
}

async function load() {
  if (!K) return;
  let r;
  try { r = await fetch("/api/state?k=" + encodeURIComponent(K), { cache: "no-store" }); } catch (e) { return; }
  if (r.status === 401) { showGate("That invite link isn't valid. Ask for a fresh one."); try { localStorage.removeItem("duel:k"); } catch (e) {} return; }
  if (r.status === 503) { if (!S.loaded) showGate("The scoreboard database isn't connected yet. Try again in a minute."); return; }
  if (!r.ok) return;
  const d = await r.json();
  const first = !S.loaded;
  const next = {};
  (d.games || []).forEach(g => { if (g && g.date && g.player) next[gk(g.date, g.player)] = { date: g.date, player: g.player, guesses: Array.isArray(g.guesses) ? g.guesses : [], status: g.status }; });

  if (!first && d.opp) {
    const was = S.games[gk(S.today, d.opp.id)], now = next[gk(S.today, d.opp.id)];
    if (done(now) && !done(was)) {
      const m = S.status === "playing" ? d.opp.name + " finished. Your move." : d.opp.name + " finished. See who took the day.";
      toast(m, 4200); buzz(60);
    }
  }
  // keep my own in-flight guesses if server is behind
  const mineKey = S.me ? gk(S.today, S.me.id) : null;
  if (mineKey && next[mineKey] && next[mineKey].guesses.length < S.guesses.length) next[mineKey] = S.games[mineKey] || next[mineKey];
  S.me = d.me; S.opp = d.opp; S.vapid = d.vapid; S.games = next; S.loaded = true;

  if (first) { $("gate").hidden = true; $("top").hidden = false; setView(S.view); updateBell(); }
  if (d.today && d.today !== S.today && d.today === etDate()) startDay(d.today);

  const mine = next[gk(S.today, S.me.id)];
  const remote = mine ? mine.guesses.filter(g => /^[a-z]{5}$/.test(g)).slice(0, 6) : [];
  if (remote.length > S.guesses.length && !S.busy) {
    S.guesses = remote; S.cur = ""; S.status = statusOf(S.guesses, S.answer); lsSet("duel:" + S.today, S.guesses);
    renderGrid(-1); renderKeys();
  } else if (first && S.guesses.length > remote.length) save();
  render();
}

function showGate(msg) { $("gateMsg").textContent = msg; $("gate").hidden = false; $("top").hidden = true; $("vPlay").hidden = true; $("vScores").hidden = true; }

/* ---------- push ---------- */
function b64(s) { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); }
let swReg = null;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(r => { swReg = r; updateBell(); }).catch(() => {});
async function currentSub() { try { return swReg && swReg.pushManager ? await swReg.pushManager.getSubscription() : null; } catch (e) { return null; } }
async function updateBell() {
  const sub = await currentSub();
  const on = !!sub && typeof Notification !== "undefined" && Notification.permission === "granted";
  $("bell").dataset.on = String(on);
  $("bell").setAttribute("aria-label", on ? "Notifications are on" : "Turn on notifications");
  if (on && K) fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k: K, sub }) }).catch(() => {});
  renderTip(on);
}
$("bell").addEventListener("click", async () => {
  if ($("bell").dataset.on === "true") return toast("Notifications are on for this device");
  if (IOS && !STANDALONE) return toast("Add Duel to your Home Screen first, then tap the bell there", 3600);
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") return toast("This browser can't do notifications");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return toast("Notifications are blocked. You can allow them in Settings.", 3200);
    const reg = swReg || await navigator.serviceWorker.ready;
    if (!S.vapid) return toast("Notifications aren't set up on the server yet");
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(S.vapid) });
    const r = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k: K, sub }) });
    if (!r.ok) throw new Error();
    toast("You're set. Alerts will come to this device.", 2600);
  } catch (e) { toast("Couldn't turn on notifications. Try again.", 2600); }
  updateBell();
});
function renderTip(on) {
  const t = $("installTip");
  if (!STANDALONE) {
    t.hidden = false;
    t.textContent = IOS
      ? "For notifications, tap the Share button in Safari, choose Add to Home Screen, then open Duel from your Home Screen and tap the bell."
      : "Install Duel from your browser menu (Add to Home screen or Install app) for a full-screen app, then tap the bell for alerts.";
  } else if (!on) { t.hidden = false; t.textContent = "Tap the bell up top to get a ping when the other person finishes and when the daily puzzle drops."; }
  else t.hidden = true;
}

/* ---------- views ---------- */
function setView(v) {
  S.view = v;
  $("tPlay").setAttribute("aria-selected", String(v === "play"));
  $("tScores").setAttribute("aria-selected", String(v === "scores"));
  $("vPlay").hidden = v !== "play"; $("vScores").hidden = v !== "scores";
  render();
}
$("tPlay").onclick = () => setView("play");
$("tScores").onclick = () => setView("scores");
$("strip").addEventListener("click", () => setView("scores"));
document.querySelectorAll(".range button").forEach(b => b.addEventListener("click", () => {
  S.range = b.dataset.r;
  document.querySelectorAll(".range button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  render();
}));

function stats() {
  const ids = [S.me.id, S.opp.id], st = {};
  ids.forEach(id => st[id] = { week: 0, month: 0, all: 0, played: 0, solved: 0, gsum: 0, days: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0] });
  const ws = weekStart(S.today), ms = S.today.slice(0, 8) + "01", dates = new Set();
  Object.values(S.games).forEach(g => {
    if (!st[g.player] || !done(g) || g.date > S.today) return;
    const s = st[g.player], p = pts(g);
    s.all += p; s.played++;
    if (g.status === "won") { s.solved++; s.gsum += g.guesses.length; s.dist[g.guesses.length - 1]++; }
    if (g.date >= ws) s.week += p;
    if (g.date >= ms) s.month += p;
    dates.add(g.date);
  });
  let ties = 0;
  dates.forEach(d => {
    const a = S.games[gk(d, ids[0])], b = S.games[gk(d, ids[1])];
    if (done(a) && done(b)) { const pa = pts(a), pb = pts(b); if (pa > pb) st[ids[0]].days++; else if (pb > pa) st[ids[1]].days++; else ties++; }
  });
  ids.forEach(id => {
    let d = S.today; const t = S.games[gk(d, id)];
    if (t && t.status === "lost") { st[id].streak = 0; return; }
    if (!(t && t.status === "won")) d = shift(d, -1);
    let n = 0; while (true) { const x = S.games[gk(d, id)]; if (x && x.status === "won") { n++; d = shift(d, -1); } else break; }
    st[id].streak = n;
  });
  return { st, ties };
}

function mini(gs) {
  const m = document.createElement("div"); m.className = "mini";
  gs.forEach(g => { const r = document.createElement("div"); r.className = "r"; evaluate(g, S.answer).forEach(s => { const i = document.createElement("i"); i.className = s; r.appendChild(i); }); m.appendChild(r); });
  return m;
}
function setBar(a, b, ea, eb) { ea.style.flexGrow = (a + b) ? a : 1; eb.style.flexGrow = (a + b) ? b : 1; }

function render() {
  if (!S.me) return;
  const me = S.me, op = S.opp, { st, ties } = stats(), A = st[me.id], B = st[op.id];
  // play view
  $("nA").textContent = me.name; $("nB").textContent = op.name;
  $("sA").textContent = A.week; $("sB").textContent = B.week; setBar(A.week, B.week, $("bA"), $("bB"));
  $("puz").textContent = "Puzzle " + (dayNum(S.today) + 1);
  const og = S.games[gk(S.today, op.id)], o = $("opp"); o.classList.remove("done");
  if (done(og)) { o.textContent = op.name + " is done ✓"; o.classList.add("done"); }
  else if (og && og.guesses.length) o.textContent = op.name + " is mid-puzzle";
  else o.textContent = op.name + " hasn't played yet";

  const finished = S.status !== "playing" && !S.busy;
  $("kb").hidden = finished; $("result").hidden = !finished;
  if (finished) {
    const res = $("result"); res.textContent = "";
    const card = document.createElement("div"); card.className = "rc";
    const h = document.createElement("h3"), s = document.createElement("p"); s.className = "s";
    if (S.status === "won") { h.textContent = "Solved in " + S.guesses.length; const p = 7 - S.guesses.length; s.textContent = "+" + p + (p === 1 ? " point" : " points"); }
    else { h.textContent = "The word was " + S.answer.toUpperCase(); s.textContent = "0 points today"; }
    card.append(h, s);
    if (done(og)) {
      const vs = document.createElement("div"); vs.className = "vs";
      [[me.name, S.guesses], [op.name, og.guesses]].forEach(([n, gs]) => {
        const col = document.createElement("div"), w = document.createElement("div"); w.className = "who";
        w.textContent = n + "  " + (gs.includes(S.answer) ? gs.length + "/6" : "X/6");
        col.append(w, mini(gs)); vs.appendChild(col);
      });
      const v = document.createElement("p"); v.className = "verdict";
      const pa = pts({ status: S.status, guesses: S.guesses }), pb = pts(og);
      v.textContent = pa > pb ? "You take the day." : pb > pa ? op.name + " takes the day." : "Dead even today.";
      card.append(vs, v);
    } else {
      const w = document.createElement("p"); w.className = "s"; w.style.marginTop = "10px";
      w.textContent = "Waiting on " + op.name + ". You'll get a ping when they finish.";
      card.appendChild(w);
    }
    res.appendChild(card);
  }

  // scores view
  if (S.view !== "scores") return;
  const key = S.range;
  $("hnA").textContent = me.name; $("hnB").textContent = op.name;
  $("hsA").textContent = A[key]; $("hsB").textContent = B[key]; setBar(A[key], B[key], $("hbA"), $("hbB"));
  const sEl = $("stats"); sEl.textContent = "";
  const cell = (t, c) => { const d = document.createElement("div"); d.className = c; d.textContent = t; sEl.appendChild(d); };
  cell("", "l"); cell(me.name, "v h"); cell(op.name, "v h");
  [["Days won", x => x.days], ["Points, all time", x => x.all], ["Solve rate", x => x.played ? Math.round(100 * x.solved / x.played) + "%" : "–"],
   ["Avg guesses", x => x.solved ? (x.gsum / x.solved).toFixed(1) : "–"], ["Win streak", x => x.streak], ["Aces (1–2 guesses)", x => x.dist[0] + x.dist[1]]]
    .forEach(([l, f]) => { cell(l, "l"); cell(String(f(A)), "v"); cell(String(f(B)), "v"); });
  if (ties) { cell("Tied days", "l"); cell(String(ties), "v"); cell(String(ties), "v"); }

  const tb = $("recent"); tb.textContent = "";
  const hr = tb.insertRow(); ["", me.name, op.name].forEach(t => { const th = document.createElement("th"); th.textContent = t; hr.appendChild(th); });
  for (let k = 0; k < 14; k++) {
    const d = shift(S.today, -k), tr = tb.insertRow();
    tr.insertCell().textContent = k === 0 ? "Today" : k === 1 ? "Yesterday" : dayLabel(d);
    const ga = S.games[gk(d, me.id)], gb = S.games[gk(d, op.id)], both = done(ga) && done(gb);
    [[ga, gb, false], [gb, ga, k === 0 && !done(ga)]].forEach(([g, other, hide]) => {
      const td = tr.insertCell();
      if (!done(g)) { td.textContent = g && g.guesses.length ? "…" : "–"; td.className = "x"; return; }
      if (hide) { td.textContent = "done"; td.className = "x"; return; }
      td.textContent = g.status === "won" ? g.guesses.length + "/6" : "X";
      if (g.status !== "won") td.className = "x"; else if (both && pts(g) > pts(other)) td.className = "win";
    });
  }
}

/* ---------- day ---------- */
function startDay(ds) {
  S.today = ds; S.answer = answerFor(ds); S.cur = "";
  const saved = lsGet("duel:" + ds);
  S.guesses = Array.isArray(saved) ? saved.filter(g => typeof g === "string" && /^[a-z]{5}$/.test(g)).slice(0, 6) : [];
  const mine = S.me && S.games[gk(ds, S.me.id)];
  if (mine && mine.guesses.length > S.guesses.length) S.guesses = mine.guesses.slice(0, 6);
  S.status = statusOf(S.guesses, S.answer);
  buildGrid(); renderKeys(); render();
}

/* ---------- boot ---------- */
buildKeys();
startDay(etDate());
if (!K) showGate("This is a private game. Open it from your invite link.");
else { load(); }
let poll = setInterval(tick, 6000);
function tick() {
  if (document.visibilityState !== "visible") return;
  const now = etDate();
  if (now !== S.today) { startDay(now); toast("Puzzle " + (dayNum(now) + 1) + " is up", 2600); }
  load();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
})();
