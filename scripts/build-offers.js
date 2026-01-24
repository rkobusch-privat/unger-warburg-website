import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");
const outIndex = path.join(process.cwd(), "index.html");
const outOffers = path.join(process.cwd(), "angebote.html");

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

/* ================= Read offers ================= */

function readOffers() {
  if (!fs.existsSync(offersDir)) return [];
  const files = fs.readdirSync(offersDir).filter((f) => f.endsWith(".json"));

  let list = files
    .map((file) => {
      const raw = fs.readFileSync(path.join(offersDir, file), "utf8");
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

  list = list.filter((o) => o.active);

  // abgelaufene ausblenden (wenn valid_to gesetzt)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  list = list.filter((o) => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  // featured zuerst
  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), "de");
  });

  return list;
}

/* ================= Highlights: kurz vs lang + Feature-Blöcke ================= */

function splitHighlightsSmart(items) {
  const short = [];
  const long = [];

  for (const it of items || []) {
    const t = normalizeSpaces(it);
    if (!t) continue;

    // lange Herstellertexte in Details
    if (t.length > 140) long.push(t);
    else short.push(t);
  }

  // max 4 Kurzpunkte sichtbar
  const shortLimited = short.slice(0, 4);
  const shortOverflow = short.slice(4);
  if (shortOverflow.length) long.unshift(...shortOverflow);

  return { short: shortLimited, long };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Zerlegt einen langen Text anhand bekannter Feature-Keywords.
 * Funktioniert auch, wenn Keywords mehrfach vorkommen.
 */
function parseFeatureBlocks(longText) {
  const t = normalizeSpaces(longText);

  const keywords = [
    "BluPerformance",
    "NoFrost",
    "DuoCooling",
    "BioFresh",
    "SmartDevice",
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

  // echte Abschnitts-Starts finden (nur nach Satzende oder Textanfang)
  const hits = [];
  for (const k of keywords) {
    const kEsc = escapeRegExp(k);
    const re = new RegExp(`(^|[.!?]\\s+)(${kEsc})(\\s*(?:–|-|:)\\s+|\\s+)`, "g");
    let m;
    while ((m = re.exec(t)) !== null) {
      const idx = m.index + m[1].length;
      hits.push({ k, i: idx });
    }
  }

  hits.sort((a, b) => a.i - b.i);
  if (hits.length < 2) return null;

  const blocks = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].i;
    const end = i + 1 < hits.length ? hits[i + 1].i : t.length;

    const title = hits[i].k;
    let body = t.slice(start, end).trim();

    // Titel am Anfang entfernen
    body = body.replace(new RegExp(`^${escapeRegExp(title)}\\b\\s*`), "").trim();
    body = body.replace(/^(?:–|-|:)\s*/, "").trim();

    // ALLE weiteren Vorkommen des Titels entfernen
    // (aber SmartDevice-App o.ä. behalten)
    body = body.replace(
      new RegExp(`\\b${escapeRegExp(title)}\\b(?!-)`, "g"),
      ""
    );

    // Text aufräumen
    body = body
      .replace(/\s{2,}/g, " ")
      .replace(/\s+–\s+/g, " – ")
      .replace(/Das ist\s+–/g, "Das ist")
      .replace(/Dank\s+–/g, "Dank")
      .trim();

    if (body.length < 20) continue;

    blocks.push({ title, body });
  }

  return blocks.length ? blocks : null;
}

  }

  hits.sort((a, b) => a.i - b.i);

  if (hits.length < 2) return null;

  const blocks = [];
  for (let idx = 0; idx < hits.length; idx++) {
    const start = hits[idx].i;
    const end = idx + 1 < hits.length ? hits[idx + 1].i : t.length;

    const title = hits[idx].k;
    let chunk = t.slice(start, end).trim();

    // Titel am Anfang entfernen
    chunk = chunk.replace(new RegExp(`^${escapeRegExp(title)}\\b\\s*`), "").trim();
    // führende Trennzeichen entfernen
    chunk = chunk.replace(/^(?:–|-|:)\s*/, "").trim();

    if (chunk.length < 20) continue;

    blocks.push({ title, body: chunk });
  }

  // Falls derselbe Titel direkt hintereinander kommt: zusammenführen statt doppeln
  const cleaned = [];
  for (const b of blocks) {
    if (!cleaned.length) cleaned.push(b);
    else {
      const prev = cleaned[cleaned.length - 1];
      if (prev.title === b.title) prev.body = (prev.body + " " + b.body).trim();
      else cleaned.push(b);
    }
  }

  return cleaned.length ? cleaned : null;
}

  hits.sort((a, b) => a.i - b.i);

  // Wenn wir weniger als 2 Treffer haben, lohnt Split nicht
  if (hits.length < 2) return null;

  // Duplikate direkt hintereinander vermeiden (z.B. Keyword kommt sehr nah erneut)
  const dedup = [];
  for (const h of hits) {
    if (!dedup.length) dedup.push(h);
    else if (h.i - dedup[dedup.length - 1].i > 6) dedup.push(h);
  }

  const blocks = [];
  for (let idx = 0; idx < dedup.length; idx++) {
    const start = dedup[idx].i;
    const end = idx + 1 < dedup.length ? dedup[idx + 1].i : t.length;

    const title = dedup[idx].k;
    let chunk = t.slice(start, end).trim();

    // Titel am Anfang entfernen
    chunk = chunk.replace(new RegExp(`^${escapeRegExp(title)}\\b\\s*`), "").trim();
    // optional: führenden Gedankenstrich nach Titel entfernen
    chunk = chunk.replace(/^–\s*/, "").trim();

    if (chunk.length < 20) continue;

    blocks.push({ title, body: chunk });
  }

  return blocks.length ? blocks : null;
}

function renderHighlightsSection(o) {
  const { short, long } = splitHighlightsSmart(o.highlights);

  const shortHtml = short.length
    ? `<ul class="list">${short.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : "";

  if (!long.length) return shortHtml;

  // Wenn genau ein langer Block: versuche Feature-Blöcke
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
</details>`;
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
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">${metaBits.join("")}</div>`
    : "";

  const highlightsHtml = renderHighlightsSection(o);

  return `
<article class="tile offer-tile">
  ${o.featured ? `<div class="pill" style="margin-bottom:10px;display:inline-block">🔥 Top-Angebot</div>` : ""}

  ${metaLine}

  <h3 style="margin:0 0 10px">${escapeHtml(o.title)}</h3>

  ${
    imgSrc
      ? `<img src="${escapeHtml(imgSrc)}"
              alt="${escapeHtml(o.title)}"
              class="offer-img"
              loading="lazy">`
      : ""
  }

  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">
    <div style="font-weight:1000;font-size:20px;margin:6px 0">${escapeHtml(priceNow)}</div>
    ${hasRrp ? `<div style="color:var(--muted);font-weight:800">UVP <span style="text-decoration:line-through;margin-left:6px">${escapeHtml(priceRrp)}</span></div>` : ``}
  </div>

  ${o.note ? `<p style="margin:10px 0 0;color:var(--muted)">${escapeHtml(o.note)}</p>` : ""}

  ${highlightsHtml}

  <div style="margin-top:14px">
    <a class="btn btn--ghost" href="${escapeHtml(o.cta_link || "https://unger-warburg.de/#kontakt")}">Anfragen</a>
  </div>
</article>`;
}

/* ================= Page ================= */

function renderPage(offers) {
  const templatePath = path.join(process.cwd(), "templates", "offers-page.html");
  const tpl = fs.readFileSync(templatePath, "utf8");

  const content = offers.length
    ? `<div class="grid offers-grid">${offers.map(renderOfferTile).join("\n")}</div>`
    : `<div class="tile"><h3 style="margin:0 0 8px">Aktuell sind keine Angebote online.</h3><p style="margin:0;color:var(--muted)">Schau später nochmal vorbei oder ruf uns an.</p></div>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – im CMS gepflegt, automatisch aktualisiert.")
    .replaceAll("{{CONTENT}}", content);
}

/* ================= Build ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(outIndex, html, "utf8");
fs.writeFileSync(outOffers, html, "utf8");

console.log(`✅ Angebote gebaut: ${offers.length} (index.html + angebote.html)`);


