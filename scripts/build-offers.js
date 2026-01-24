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

function formatPrice(value) {
  // Unterstützt: Number (alt) oder String (neu, z.B. "2.499 €")
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatEUR(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function parseDateISO(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/* ================= Normalizer (new schema) ================= */

function normalizeBullets(bulletsRaw) {
  // Erwartet neu: ["Text", ...]
  // Toleriert: [{ bullet: "Text" }, ...]
  const arr = toArray(bulletsRaw);

  const bullets = arr
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        if (typeof item.bullet === "string") return item.bullet.trim();
        // generischer Fallback: erstes string-Feld
        const firstString = Object.values(item).find((v) => typeof v === "string");
        return typeof firstString === "string" ? firstString.trim() : "";
      }
      return "";
    })
    .filter(Boolean);

  return bullets;
}

function normalizeFeatures(featuresRaw) {
  // Erwartet: [{ title, description }, ...]
  const arr = toArray(featuresRaw);

  return arr
    .map((f) => ({
      title: typeof f?.title === "string" ? f.title.trim() : "",
      description: typeof f?.description === "string" ? f.description.trim() : "",
    }))
    .filter((f) => f.title && f.description);
}

function normalizeHighlights(highlightsRaw) {
  // Altbestand:
  // - Array gemischt: ["Text", {item:"Text"} ...]
  // - oder String
  if (!highlightsRaw) return [];

  if (typeof highlightsRaw === "string") {
    const t = highlightsRaw.trim();
    return t ? [t] : [];
  }

  if (Array.isArray(highlightsRaw)) return highlightsRaw;

  return [];
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

        // Abwärtskompatibel: rrp (alt) oder uvp (neu)
        const uvp = d.uvp ?? d.rrp;

        return {
          // neue Basis
          title: d.title || "",
          slug: d.slug || "",
          teaser: d.teaser || "",

          // optional/alt
          category: d.category || "",

          // Preise alt/neu
          price: d.price,
          uvp: uvp,

          // Content neu/alt
          bullets: d.bullets,
          features: d.features,
          highlights: normalizeHighlights(d.highlights),

          // Medien
          image: d.image || "",

          // Laufzeit/Flags alt
          valid_to: d.valid_to || "",
          featured: d.featured === true,
          note: d.note || "",
          cta_link: d.cta_link || "https://unger-warburg.de/#kontakt",
          active: d.active !== false,

          // Debug
          __file: file,
        };
      } catch {
        console.warn(`⚠️ Offer JSON kaputt: ${file}`);
        return null;
      }
    })
    .filter(Boolean);

  // active
  offers = offers.filter((o) => o.active);

  // valid_to
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  offers = offers.filter((o) => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  // Sort: featured zuerst, dann Titel
  offers.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.title.localeCompare(b.title, "de");
  });

  // Warnungen (nicht blockierend)
  for (const o of offers) validateOffer(o);

  return offers;
}

function validateOffer(o) {
  const warnings = [];

  const bullets = normalizeBullets(o.bullets);
  if (bullets.length > 0 && (bullets.length < 5 || bullets.length > 10)) {
    warnings.push(`bullets sollten 5–10 sein, sind aber ${bullets.length}`);
  }

  const features = normalizeFeatures(o.features);
  if (features.length > 10) warnings.push(`features > 10 (${features.length})`);

  if (!o.title) warnings.push("title fehlt");
  if (!o.price && o.price !== 0) warnings.push("price fehlt");
  if (!o.image) warnings.push("image fehlt");

  if (warnings.length) {
    console.warn(`[OFFER WARN] ${o.__file} → ${warnings.join(", ")}`);
  }
}

/* ================= Legacy highlights (robust) ================= */

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

// macht aus einem langen Herstellertext mehrere lesbare Absätze (optional) – NUR legacy
function splitIntoParagraphs(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  const parts = t.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/g);

  if (parts.length <= 1) return [t];

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

function renderHighlightsLegacy(o) {
  const raw = (o.highlights || [])
    .map(highlightToText)
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  // Regel: ALLES was länger als 120 Zeichen ist -> Details (legacy-only)
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

  const longParas = long.flatMap(splitIntoParagraphs);

  return `
    ${shortHtml}
    <div class="offer-legacy">
      ${longParas.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    </div>
  `;
}

/* ================= New details rendering ================= */

function renderBulletsList(o, limit = 10) {
  const bullets = normalizeBullets(o.bullets).slice(0, limit);
  if (!bullets.length) return "";
  return `<ul class="list">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
}

function renderDetails(o) {
  // In Details sollen Bullets AUCH erscheinen (oben)
  const bulletsHtml = renderBulletsList(o, 10);
  const bulletsBlock = bulletsHtml
    ? `
      <div class="offer-details__bullets">
        <div class="offer-details__label" style="font-weight:800;margin:0 0 6px 0">Kurz & knapp</div>
        ${bulletsHtml}
      </div>
    `
    : "";

  const features = normalizeFeatures(o.features);
  const legacy = normalizeHighlights(o.highlights);

  // Wenn weder Features noch Legacy vorhanden sind, dann auch kein <details> anzeigen
  if (!bulletsBlock && features.length === 0 && legacy.length === 0) return "";

  // Body-Content: Features haben Vorrang, Legacy ist Fallback
  let bodyHtml = "";
  if (features.length > 0) {
    bodyHtml = `
      <div class="offer-details__features">
        ${features
          .map(
            (f) => `
          <div class="offer-feature">
            <h4 class="offer-feature__title">${escapeHtml(f.title)}</h4>
            <p class="offer-feature__desc">${escapeHtml(f.description)}</p>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } else if (legacy.length > 0) {
    bodyHtml = `
      <div class="offer-details__legacy">
        ${renderHighlightsLegacy({ ...o, highlights: legacy })}
      </div>
    `;
  }

  return `
    <details class="offer-details">
      <summary>Details anzeigen</summary>
      <div class="offer-details__body">
        ${bulletsBlock}
        ${bodyHtml}
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

  const priceText = formatPrice(o.price);
  const uvpText = formatPrice(o.uvp);

  const teaserHtml = o.teaser ? `<p class="note" style="color:var(--muted)">${escapeHtml(o.teaser)}</p>` : "";
  const noteHtml = o.note ? `<p class="note" style="color:var(--muted)">${escapeHtml(o.note)}</p>` : "";

  // Karte: Bullets direkt sichtbar (ohne Details)
  const bulletsOnCard = renderBulletsList(o, 10);

  return `
<article class="tile">
  ${o.featured ? `<div class="pill">🔥 Top-Angebot</div>` : ""}

  ${meta.length ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">${meta.join("")}</div>` : ""}

  <h3>${escapeHtml(o.title)}</h3>

  ${img}

  <div class="price-row" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">
    <strong style="font-size:20px">${escapeHtml(priceText)}</strong>
    ${
      uvpText
        ? `<span class="rrp" style="color:var(--muted);font-weight:800">UVP <s>${escapeHtml(uvpText)}</s></span>`
        : ""
    }
  </div>

  ${teaserHtml}
  ${noteHtml}

  ${bulletsOnCard}

  ${renderDetails(o)}

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
