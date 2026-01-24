import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");
const outIndex = path.join(process.cwd(), "index.html");
const outOffers = path.join(process.cwd(), "angebote.html");

/* ================= HELPERS ================= */

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEUR(value) {
  if (value === null || value === undefined || value === "") return "";
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

function normalizeSpaces(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\s+–\s+/g, " – ")
    .trim();
}

/* ================= READ OFFERS ================= */

function readOffers() {
  if (!fs.existsSync(offersDir)) return [];

  const files = fs.readdirSync(offersDir).filter(f => f.endsWith(".json"));

  let list = files.map(file => {
    const raw = fs.readFileSync(path.join(offersDir, file), "utf8");
    try {
      const d = JSON.parse(raw);
      return {
        title: d.title,
        category: d.category,
        price: d.price,
        rrp: d.rrp,
        highlights: Array.isArray(d.highlights) ? d.highlights : [],
        image: d.image,
        valid_to: d.valid_to,
        featured: d.featured === true,
        note: d.note,
        cta_link: d.cta_link || "https://unger-warburg.de/#kontakt",
        active: d.active !== false,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  list = list.filter(o => o.active);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  list = list.filter(o => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, "de");
  });

  return list;
}

/* ================= HIGHLIGHTS ================= */

function splitHighlights(items) {
  const short = [];
  const long = [];

  for (const it of items || []) {
    const t = normalizeSpaces(it);
    if (!t) continue;
    if (t.length > 140) long.push(t);
    else short.push(t);
  }

  return {
    short: short.slice(0, 4),
    long: long.concat(short.slice(4)),
  };
}

function renderHighlights(o) {
  const { short, long } = splitHighlights(o.highlights);

  const shortHtml = short.length
    ? `<ul class="list">${short.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
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

/* ================= TILE ================= */

function renderOfferTile(o) {
  const imgSrc = o.image ? (o.image.startsWith("/") ? o.image : "/" + o.image) : "";

  return `
<article class="tile">
  ${o.featured ? `<div class="pill">🔥 Top-Angebot</div>` : ""}

  <h3>${escapeHtml(o.title)}</h3>

  ${
    imgSrc
      ? `<img src="${escapeHtml(imgSrc)}"
              alt="${escapeHtml(o.title)}"
              class="offer-img"
              loading="lazy">`
      : ""
  }

  <p class="price">${formatEUR(o.price)}</p>
  ${o.rrp ? `<p class="rrp">UVP <span>${formatEUR(o.rrp)}</span></p>` : ""}

  ${o.note ? `<p class="note">${escapeHtml(o.note)}</p>` : ""}

  ${renderHighlights(o)}

  <a class="btn btn--ghost" href="${escapeHtml(o.cta_link)}">Anfragen</a>
</article>`;
}

/* ================= PAGE ================= */

function renderPage(offers) {
  const tpl = fs.readFileSync(path.join(process.cwd(), "templates", "offers-page.html"), "utf8");

  const content = offers.length
    ? `<div class="grid">${offers.map(renderOfferTile).join("")}</div>`
    : `<p>Aktuell keine Angebote.</p>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – automatisch aus dem CMS.")
    .replaceAll("{{CONTENT}}", content);
}

/* ================= BUILD ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(outIndex, html);
fs.writeFileSync(outOffers, html);

console.log(`✔ Angebote gebaut (${offers.length})`);
