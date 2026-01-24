import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OFFERS_DIR = path.join(ROOT, "content", "offers");
const OUT_INDEX = path.join(ROOT, "index.html");
const OUT_ANGEBOTE = path.join(ROOT, "angebote.html");

/* ================= Helpers ================= */

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEUR(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

function parseDateISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ================= Read offers ================= */

function readOffers() {
  if (!fs.existsSync(OFFERS_DIR)) return [];

  const files = fs.readdirSync(OFFERS_DIR).filter(f => f.endsWith(".json"));

  let offers = files.map(file => {
    try {
      const raw = fs.readFileSync(path.join(OFFERS_DIR, file), "utf8");
      const d = JSON.parse(raw);
      return {
        title: d.title || "",
        category: d.category || "",
        price: d.price,
        rrp: d.rrp,
        highlights: Array.isArray(d.highlights) ? d.highlights : [],
        image: d.image || "",
        valid_to: d.valid_to || "",
        featured: d.featured === true,
        note: d.note || "",
        cta_link: d.cta_link || "https://unger-warburg.de/#kontakt",
        active: d.active !== false,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  // nur aktive
  offers = offers.filter(o => o.active);

  // abgelaufene ausblenden
  const today = new Date();
  today.setHours(0,0,0,0);
  offers = offers.filter(o => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  // featured zuerst
  offers.sort((a,b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, "de");
  });

  return offers;
}

/* ================= Highlights (STABIL!) ================= */

function renderHighlights(o) {
  const short = [];
  const long = [];

  for (const h of o.highlights) {
    const t = String(h || "").trim();
    if (!t) continue;
    if (t.length > 160) long.push(t);
    else short.push(t);
  }

  const shortHtml = short.length
    ? `<ul class="list">${short.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";

  if (!long.length) return shortHtml;

  return `
    ${shortHtml}
    <details class="offer-details">
      <summary>Details anzeigen</summary>
      <div class="offer-details__body">
        ${long.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
    </details>
  `;
}

/* ================= Tile ================= */

function renderTile(o) {
  const img = o.image
    ? `<img src="${escapeHtml(o.image)}"
             alt="${escapeHtml(o.title)}"
             class="offer-img"
             loading="lazy">`
    : "";

  return `
<article class="tile">
  ${o.featured ? `<div class="pill">🔥 Top-Angebot</div>` : ""}

  <h3>${escapeHtml(o.title)}</h3>

  ${img}

  <div class="price-row">
    <strong>${formatEUR(o.price)}</strong>
    ${o.rrp ? `<span class="rrp">UVP <s>${formatEUR(o.rrp)}</s></span>` : ""}
  </div>

  ${o.note ? `<p class="note">${escapeHtml(o.note)}</p>` : ""}

  ${renderHighlights(o)}

  <a class="btn btn--ghost" href="${escapeHtml(o.cta_link)}">Anfragen</a>
</article>`;
}

/* ================= Page ================= */

function renderPage(offers) {
  const tpl = fs.readFileSync(
    path.join(ROOT, "templates", "offers-page.html"),
    "utf8"
  );

  const content = offers.length
    ? `<div class="grid">${offers.map(renderTile).join("")}</div>`
    : `<p>Aktuell keine Angebote.</p>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – automatisch gepflegt.")
    .replaceAll("{{CONTENT}}", content);
}

/* ================= Build ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(OUT_INDEX, html);
fs.writeFileSync(OUT_ANGEBOTE, html);

console.log(`✔ Angebote gebaut: ${offers.length}`);


