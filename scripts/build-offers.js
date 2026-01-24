import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");

// Für die Angebots-Subdomain: / (index.html) und zusätzlich /angebote.html
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
  if (!Number.isFinite(num)) return escapeHtml(String(value));
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

  const offers = files
    .map((file) => {
      const full = path.join(offersDir, file);
      const raw = fs.readFileSync(full, "utf8");

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn(`⚠️ Ungültiges JSON: ${file}`);
        return null;
      }

      return {
        title: data.title ?? "",
        category: data.category ?? "",
        price: data.price,
        rrp: data.rrp,
        highlights: Array.isArray(data.highlights) ? data.highlights : [],
        image: data.image ?? "",
        valid_to: data.valid_to ?? "",
        featured: data.featured === true,
        note: data.note ?? "",
        cta_link: data.cta_link ?? "https://unger-warburg.de/#kontakt",
        active: data.active !== false,
      };
    })
    .filter(Boolean);

  // nur aktive
  let list = offers.filter((o) => o.active);

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

/** Teilt Highlights in kurze Punkte und lange Textblöcke (Details) */
function splitHighlightsSmart(items) {
  const short = [];
  const long = [];

  for (const it of (items || [])) {
    const t = normalizeSpaces(it);
    if (!t) continue;

    // alles über 140 Zeichen gilt als Langtext
    if (t.length > 140) long.push(t);
    else short.push(t);
  }

  // max 4 Kurzpunkte, Rest wandert in Details
  const shortLimited = short.slice(0, 4);
  const shortOverflow = short.slice(4);
  if (shortOverflow.length) long.unshift(...shortOverflow);

  return { short: shortLimited, long };
}

/**
 * Versucht, einen langen Herstellertext in Feature-Blöcke zu zerlegen.
 * Erkennt Muster wie: "NoFrost – ... DuoCooling – ... BioFresh – ..."
 */
function parseFeatureBlocks(longText) {
  const t = normalizeSpaces(longText);

  // Keywords kannst du jederzeit erweitern – gilt dann für ALLE Angebote
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
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
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

    let body = chunk.replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*`), "").trim();
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
            </div>
          `
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

/** Render der Karte im Stil eurer Website: .grid + .tile + .btn + .pill */
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
<article class="tile">
  ${o.featured ? `<div class="pill" style="margin-bottom:10px">🔥 Top-Angebot</div>` : ""}

  ${metaLine}

  <h3 style="margin:0 0 10px">${escapeHtml(o.title)}</h3>

  ${
    imgSrc
      ? `<img src="${escapeHtml(imgSrc)}"
              alt="${escapeHtml(o.title)}"
              style="width:100%;height:220px;object-fit:cover;border-radius:14px;border:1px solid var(--line);margin:0 0 12px"
              loading="lazy">`
      : ""
  }

  <p style="margin:0 0 6px;font-weight:1000;font-size:20px">
    ${escapeHtml(priceNow)}
  </p>

  ${
    hasRrp
      ? `<p style="margin:0 0 12px;color:var(--muted);font-weight:800">
           UVP <span style="text-decoration:line-through;margin-left:6px">${escapeHtml(priceRrp)}</span>
         </p>`
      : ""
  }

  ${o.note ? `<p style="margin:10px 0 0;color:var(--muted)">${escapeHtml(o.note)}</p>` : ""}

  ${highlightsHtml}

  <div style="margin-top:14px">
    <a class="btn btn--ghost" href="${escapeHtml(o.cta_link || "https://unger-warburg.de/#kontakt")}">Anfragen</a>
  </div>
</article>`;
}

function renderPage(offers) {
  const templatePath = path.join(process.cwd(), "templates", "offers-page.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template fehlt: ${path.relative(process.cwd(), templatePath)} (bitte templates/offers-page.html anlegen)`);
  }

  const tpl = fs.readFileSync(templatePath, "utf8");

  const content = offers.length
    ? `<div class="grid">${offers.map(renderOfferTile).join("\n")}</div>`
    : `<div class="tile"><h3 style="margin:0 0 8px">Aktuell sind keine Angebote online.</h3><p style="margin:0;color:var(--muted)">Schau später nochmal vorbei oder ruf uns an.</p></div>`;

  return tpl
    .replaceAll("{{TITLE}}", "Angebote | Unger Haushalts- & Medientechnik")
    .replaceAll("{{DESCRIPTION}}", "Aktuelle Angebote – im CMS gepflegt, automatisch aktualisiert.")
    .replaceAll("{{CONTENT}}", content);
}

function main() {
  const offers = readOffers();
  const html = renderPage(offers);

  // Subdomain hübsch: / zeigt direkt Angebote
  fs.writeFileSync(outIndex, html, "utf8");
  fs.writeFileSync(outOffers, html, "utf8");

  console.log(`✅ Angebote gebaut: ${offers.length} Einträge`);
  console.log(`   → ${path.relative(process.cwd(), outIndex)}`);
  console.log(`   → ${path.relative(process.cwd(), outOffers)}`);
}

main();
