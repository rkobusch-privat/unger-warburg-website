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
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

function parseDateISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ================= Read offers ================= */

function readOffers() {
  if (!fs.existsSync(OFFERS_DIR)) return [];
  const files = fs.readdirSync(OFFERS_DIR).filter((f) => f.endsWith(".json"));

  let offers = files
    .map((file) => {
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
        console.warn(`⚠️ Offer JSON kaputt: ${file}`);
        return null;
      }
    })
    .filter(Boolean);

  offers = offers.filter((o) => o.active);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  offers = offers.filter((o) => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  offers.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, "de");
  });

  return offers;
}

/* ================= Highlights (robust) ================= */

// Unterstützt: "Text" oder {item:"Text"} oder {something:"Text"}
function highlightToText(h) {
  if (typeof h === "string") return h;
  if (h && typeof h === "object") {
    if (typeof h.item === "string") return h.item;
    // falls irgend ein Feld ein String ist, nimm den ersten
    for (const k of Object.keys(h)) {
      if (typeof h[k] === "string") return h[k];
    }
  }
  return "";
}

// macht aus einem langen Herstellertext mehrere lesbare Absätze (optional)
function splitIntoParagraphs(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  // Split an typischen Übergängen: ". " + Großbuchstabe oder " – " nach Keyword bleibt drin
  // Wir splitten vorsichtig nur an Satzenden.
  const parts = t.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/g);

  // Wenn nur 1 Teil, liefere 1 Absatz zurück
  if (parts.length <= 1) return [t];

  // Sehr kurze Satzteile wieder zusammenführen
  const merged = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    if (merged.length && s.length < 40) {
      merged[merged.length - 1] = (merged[merged.length - 1] + " " + s).trim();
    } else {
      merged.push(s);
    }
  }
  return merged.length ? merged : [t];
}

function renderHighlights(o) {
  // in Strings normalisieren
  const raw = (o.highlights || []).map(highlightToText).map((x) => String(x || "").trim()).filter(Boolean);

  // Regel: ALLES was länger als 120 Zeichen ist -> Details
  // (damit dein Liebherr-Block garantiert eingeklappt wird)
  const short = [];
  const long = [];

  for (const t of raw) {
    if (t.length > 120) long.push(t);
    else short.push(t);
  }

  // max 4 short Punkte sichtbar
  const shortLimited = short.slice(0, 4);
  const shortOverflow = short.slice(4);
  if (shortOverflow.length) long.unshift(...shortOverflow);

  const shortHtml = shortLimited.length
    ? `<ul class="list">${shortLimited.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
    : "";

  if (!long.length) return shortHtml;

  // long Texte in Absätze zerlegen -> besser lesbar
  const longParas = long.flatMap(splitIntoParagraphs);

  return `
    ${shortHtml}
    <details class="offer-details">
      <summary>Details anzeigen</summary>
      <div class="offer-details__body">
        ${longParas.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
      </div>
    </details>
  `;
}

/* ================= Tile ================= */

function renderTile(o) {
  const img = o.image
    ? `<img src="${escapeHtml(o.image)}" alt="${escapeHtml(o.title)}" class="offer-img" loading="lazy">`
    : "";

  const meta = [];
  if (o.category) meta.push(`<span class="pill">${escapeHtml(o.category)}</span>`);
  if (o.valid_to) meta.push(`<span class="pill">gültig bis ${escapeHtml(o.valid_to)}</span>`);

  return `
<article class="tile">
  ${o.featured ? `<div class="pill">🔥 Top-Angebot</div>` : ""}

  ${meta.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">${meta.join("")}</div>` : ""}

  <h3>${escapeHtml(o.title)}</h3>

  ${img}

  <div class="price-row" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
    <strong style="font-size:20px">${formatEUR(o.price)}</strong>
    ${o.rrp ? `<span class="rrp" style="color:var(--muted);font-weight:800">UVP <s>${formatEUR(o.rrp)}</s></span>` : ""}
  </div>

  ${o.note ? `<p class="note" style="color:var(--muted)">${escapeHtml(o.note)}</p>` : ""}

  ${renderHighlights(o)}

  <a class="btn btn--ghost" href="${escapeHtml(o.cta_link)}">Anfragen</a>
</article>`;
}

/* ================= Page ================= */

function renderPage(offers) {
  const tpl = fs.readFileSync(path.join(ROOT, "templates", "offers-page.html"), "utf8");

  const content = offers.length
    ? `<div class="grid">${offers.map(renderTile).join("")}</div>`
    : `<p>Aktuell keine Angebote.</p>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – automatisch aus dem CMS.")
    .replaceAll("{{CONTENT}}", content);
}

/* ================= Build ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(OUT_INDEX, html, "utf8");
fs.writeFileSync(OUT_ANGEBOTE, html, "utf8");

console.log(`✔ Angebote gebaut: ${offers.length}`);


