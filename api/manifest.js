import { who } from "./_lib.js";

export default function handler(req, res) {
  const k = typeof req.query.k === "string" ? req.query.k : "";
  const start = who(k) ? "/?k=" + encodeURIComponent(k) : "/";
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({
    name: "Word Duel", short_name: "Duel", start_url: start, scope: "/", id: "/",
    display: "standalone", background_color: "#E7EBE4", theme_color: "#E7EBE4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  }));
}
