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

function formatPrice(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatEUR(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function parseEURString(str) {
  if (!str) return NaN;
  let cleaned = String(str).replace(/[^\d,.-]/g, "");
  cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function parseDateISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateDE(iso) {
  // Erwartet "YYYY-MM-DD"
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, yyyy, mm, dd] = m;
  return `${dd}.${mm}.${yyyy}`; // ✅ TT.MM.JJJJ
}

/* ================= Normalizer ================= */

function normalizeBullets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => (typeof b === "string" ? b.trim() : ""))
    .filter(Boolean);
}

function normalizeFeatures(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      title: typeof f?.title === "string" ? f.title.trim() : "",
      description:
        typeof f?.description === "string" ? f.description.trim() : "",
    }))
    .filter((f) => f.title && f.description);
}

function normalizeHighlights(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((h) => {
      if (typeof h === "string") return h.trim();
      if (h && typeof h === "object") {
        if (typeof h.item === "string") return h.item.trim();
        const v = Object.values(h).find((x) => typeof x === "string");
        return typeof v === "string" ? v.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
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
          uvp: d.uvp ?? d.rrp,
          bullets: normalizeBullets(d.bullets),
          features: normalizeFeatures(d.features),
          highlights: normalizeHighlights(d.highlights),
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
    .filter(Boolean)
    .filter((o) => o.active);

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

/* ================= Render Details ================= */

function renderDetails(o) {
  let body = "";

  if (o.bullets.length) {
    body += `<ul class="list">${o.bullets
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join("")}</ul>`;
  }

  if (o.features.length) {
    body += o.features
      .map(
        (f) => `
        <div class="feature">
          <div class="feature__title">${escapeHtml(f.title)}</div>
          <div class="feature__text">${escapeHtml(f.description)}</div>
        </div>`
      )
      .join("");
  } else if (o.highlights.length) {
    body += o.highlights.map((h) => `<p>${escapeHtml(h)}</p>`).join("");
  }

  if (!body) return "";

  return `
<details class="offer-details">
  <summary>Details anzeigen</summary>
  <div class="offer-details__body">
    ${body}
  </div>
</details>`;
}

/* ================= Tile ================= */

function renderTile(o) {
  const priceText = formatPrice(o.price);
  const uvpText = formatPrice(o.uvp);

  let badge = "";
  const p = parseEURString(priceText);
  const u = parseEURString(uvpText);

  if (!Number.isNaN(p) && !Number.isNaN(u) && u > p) {
    const perc = Math.round(((u - p) / u) * 100);
    if (perc > 0) badge = `<span class="offer-badge">-${perc}%</span>`;
  }

  const cls = o.featured ? "tile offer-card--featured" : "tile";

  return `
<article class="${cls}">
  ${badge}

  <h3>${escapeHtml(o.title)}</h3>

  ${
    o.image
      ? `<img src="${escapeHtml(o.image)}" alt="${escapeHtml(
          o.title
        )}" class="offer-img" loading="lazy">`
      : ""
  }

  <div class="price-row">
    <strong>${escapeHtml(priceText)}</strong>
    ${
      uvpText
        ? `<span class="offer-rrp">UVP <span>${escapeHtml(
            uvpText
          )}</span></span>`
        : ""
    }
  </div>

  ${
    o.valid_to
      ? `<p class="muted small" style="margin:6px 0 0">Angebot ist gültig bis ${escapeHtml(
          formatDateDE(o.valid_to)
        )}</p>`
      : ""
  }

  ${o.note ? `<p class="note">${escapeHtml(o.note)}</p>` : ""}

  ${renderDetails(o)}

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
    ? `<div class="grid offers-grid">${offers
        .map(renderTile)
        .join("")}</div>`
    : `<p>Aktuell keine Angebote.</p>`;

  return tpl.replace("{{CONTENT}}", content);
}

/* ================= Build ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(OUT_INDEX, html, "utf8");
fs.writeFileSync(OUT_ANGEBOTE, html, "utf8");

console.log(`✔ Angebote gebaut: ${offers.length}`);

