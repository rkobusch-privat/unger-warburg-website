import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");

// Subdomain: / (index.html) + optional /angebote.html
const outIndex = path.join(process.cwd(), "index.html");
const outOffers = path.join(process.cwd(), "angebote.html");

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
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
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

function readOffers() {
  if (!fs.existsSync(offersDir)) return [];

  const files = fs.readdirSync(offersDir).filter((f) => f.endsWith(".json"));
  let list = files
    .map((file) => {
      const full = path.join(offersDir, file);
      const raw = fs.readFileSync(full, "utf8");
      try {
        const d = JSON.parse(raw);
        return {
          title: d.title ?? "",
          category: d.category ?? "",
          price: d.price,
          rrp: d.rrp,
          highlights: Array.isArray(d.highlights) ? d.highlights : [],
          image: d.image ?? "",
          valid_to: d.valid_to ?? "",
          featured: d.featured === true,
          note: d.note ?? "",
          cta_link: d.cta_link ?? "https://unger-warburg.de/#kontakt",
          active: d.active !== false,
        };
      } catch {
        console.warn(`⚠️ Ungültiges JSON: ${file}`);
        return null;
      }
    })
    .filter(Boolean);

  // nur aktive
  list = list.filter((o) => o.active);

  // abgelaufene ausblenden (nur wenn valid_to gesetzt)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  list = list.filter((o) => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  // Sortierung: featured zuerst, dann Titel
  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), "de");
  });

  return list;
}

/* ================= Highlights: kurz vs lang (Details) ================= */

function splitHighlightsSmart(items) {
  const short = [];
  const long = [];

  for (const it of items || []) {
    const t = normalizeSpaces(it);
    if (!t) continue;
    if (t.length > 140) long.push(t);
    else short.push(t);
  }

  // max 4 Kurzpunkte, Rest wandert in Details
  const shortLimited = short.slice(0, 4);
  const shortOverflow = short.slice(4);
  if (shortOverflow.length) long.unshift(...shortOverflow);

  return { short: shortLimited, long };
}

function parseFeatureBlocks(longText) {
  const t = normalizeSpaces(longText);

  // Einmal pflegen, gilt für alle Angebote
  const keywords = [
    "NoFrost",
    "BioFresh",
    "DuoCooling",
    "SmartDevice",
    "BluPerformance",
    "Inverter",
    "DirectDrive",
    "AI DD",
    "NeoQLED",
    "QLED",
    "OLED",
    "HDR",
    "Dolby Vision",
    "Dolby Atmos",
    "Steam",
    "SteamCare",
    "AutoDose",
  ];

  const hits = [];
  for (const k of keywords) {
    const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${safe}\\b`, "g");
    let m;
    while ((m = re.exec(t)) !== null) hits.push({ k, i: m.index });
  }
  hits.sort((a, b) => a.i - b.i);

  if (hits.length < 2) return null;

  const blocks = [];
  for (let idx = 0; idx < hits.length; idx++) {
    const start = hits[idx].i;
    const end = idx + 1 < hits.length ? hits[idx + 1].i : t.length;

    const chunk = t.slice(start, end).trim();
    const title = hits[idx].k;

    const safeTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let body = chunk.replace(new RegExp(`^${safeTitle}\\b\\s*`), "").trim();
    body = body.replace(/^–\s*/, "").trim();

    if (body.length < 20) continue;
    blocks.push({ title, body });
  }

  return blocks.length ? blocks : null;
}

function renderHighlightsSection(o) {
  const { short, long } = splitHighlightsSmart(o.highlights);

  const shortHtml = short.length
    ? `<ul class="list">${short.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : "";

  if (!long.length) return shortHtml;

  let detailsInner = "";
  if (long.length === 1) {
    const blocks = parseFeatureBlocks(long[0]);
    if (blocks) {
      detailsInner = blocks
        .map(
          (b) => `
          <div class="feature">
            <div class="feature__title">${escapeHtml(b.title)}</div>
            <div class="feature__text">${escapeHtml(b.body)}</div>
          </div>`
        )
        .join("");
    } else {
      detailsInner = `<p>${escapeHtml(long[0])}</p>`;
    }
  } else {
    detailsInner = long.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  }

  return `
    ${shortHtml}
    <details class="offer-details">
      <summary>Details anzeigen</summary>
      <div class="offer-details__body">
        ${detailsInner}
      </div>
    </details>
  `;
}

/* ================= Tile ================= */

function renderOfferTile(o) {
  const imgSrc = o.image ? (o.image.startsWith("/") ? o.image : "/" + o.image) : "";
  const priceNow = formatEUR(o.price);
  const priceRrp = o.rrp ? formatEUR(o.rrp) : "";
  const hasRrp = Boolean(o.rrp);

  const metaBits = [];
  if (o.category) metaBits.push(`<span class="pill">${escapeHtml(o.category)}</span>`);
  if (o.valid_to) metaBits.push(`<span class="pill">gültig bis ${escapeHtml(o.valid_to)}</span>`);
  const metaLine = metaBits.length
    ? `<div class="offer-meta">${metaBits.join("")}</div>`
    : "";

  const highlightsHtml = renderHighlightsSection(o);

  return `
<article class="tile offer-tile">
  ${o.featured ? `<div class="pill offer-hot">🔥 Top-Angebot</div>` : ""}

  ${metaLine}

  <h3 class="offer-title">${escapeHtml(o.title)}</h3>

  ${
    imgSrc
      ? `<img src="${escapeHtml(imgSrc)}"
              alt="${escapeHtml(o.title)}"
              class="offer-img"
              loading="lazy">`
      : ""
  }

  <div class="offer-prices">
    <div class="offer-price">${escapeHtml(priceNow)}</div>
    ${hasRrp ? `<div class="offer-rrp">UVP <span>${escapeHtml(priceRrp)}</span></div>` : ``}
  </div>

  ${o.note ? `<p class="offer-note">${escapeHtml(o.note)}</p>` : ""}

  ${highlightsHtml}

  <div class="offer-cta">
    <a class="btn btn--ghost" href="${escapeHtml(o.cta_link || "https://unger-warburg.de/#kontakt")}">Anfragen</a>
  </div>
</article>`;
}

/* ================= Page ================= */

function renderPage(offers) {
  const templatePath = path.join(process.cwd(), "templates", "offers-page.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template fehlt: ${path.relative(process.cwd(), templatePath)}`);
  }

  const tpl = fs.readFileSync(templatePath, "utf8");

  const content = offers.length
    ? `<div class="grid offers-grid">${offers.map(renderOfferTile).join("\n")}</div>`
    : `<div class="tile"><h3 style="margin:0 0 8px">Aktuell sind keine Angebote online.</h3><p style="margin:0;color:var(--muted)">Schau später nochmal vorbei oder ruf uns an.</p></div>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – im CMS gepflegt, automatisch aktualisiert.")
    .replaceAll("{{CONTENT}}", content);
}

function main() {
  const offers = readOffers();
  const html = renderPage(offers);

  // Subdomain: / zeigt direkt Angebote
  fs.writeFileSync(outIndex, html, "utf8");
  fs.writeFileSync(outOffers, html, "utf8");

  console.log(`✅ Angebote gebaut: ${offers.length}`);
  console.log(`   → index.html, angebote.html`);
}

main();

