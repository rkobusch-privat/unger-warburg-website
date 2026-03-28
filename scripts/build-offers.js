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

function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Accents raus
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toAbsUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  // Bilder liegen bei euch als /assets/... auf der Angebote-Subdomain
  return `https://angebote.unger-warburg.de${u.startsWith("/") ? "" : "/"}${u}`;
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
      description: typeof f?.description === "string" ? f.description.trim() : "",
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

/* ================= Schema.org (SEO) ================= */

function buildOffersSchema(offers) {
  const pageUrl = "https://angebote.unger-warburg.de/angebote.html";

  const itemListElement = offers.map((o, i) => {
    const anchor = slugify(o.title) || `offer-${i + 1}`;
    const priceNum = parseEURString(formatPrice(o.price));
    const imgAbs = toAbsUrl(o.image);

    const offerObj = {
      "@type": "Offer",
      priceCurrency: "EUR",
      url: `${pageUrl}#${anchor}`,
    };

    // Preis nur, wenn sauber parsebar
    if (!Number.isNaN(priceNum)) offerObj.price = priceNum;

    // Gültig bis (ISO) – genau das ist das SEO-Feld
    if (o.valid_to) offerObj.priceValidUntil = o.valid_to;

    return {
      "@type": "ListItem",
      position: i + 1,
      url: `${pageUrl}#${anchor}`,
      item: {
        "@type": "Product",
        name: o.title,
        ...(imgAbs ? { image: [imgAbs] } : {}),
        offers: offerObj,
      },
    };
  });

  const graph = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Aktuelle Angebote von Unger Haushalts- & Medientechnik",
    url: "https://angebote.unger-warburg.de/angebote.html",
    numberOfItems: itemListElement.length,
    itemListElement,
  };

  return `<script type="application/ld+json">\n${JSON.stringify(graph, null, 2)}\n</script>`;
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
  const anchor = slugify(o.title);

  let badge = "";
  const p = parseEURString(priceText);
  const u = parseEURString(uvpText);

  if (!Number.isNaN(p) && !Number.isNaN(u) && u > p) {
    const perc = Math.round(((u - p) / u) * 100);
    if (perc > 0) badge = `<span class="offer-badge">-${perc}%</span>`;
  }

  const cls = o.featured ? "tile offer-card--featured" : "tile";

  return `
<article id="${escapeHtml(anchor)}" class="${cls}">
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
        ? `<span class="offer-rrp">UVP <span>${escapeHtml(uvpText)}</span></span>`
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
  const tpl = fs.readFileSync(path.join(ROOT, "templates", "offers-page.html"), "utf8");

  const content = offers.length
    ? `<div class="grid offers-grid">${offers.map(renderTile).join("")}</div>`
    : `<p>Aktuell keine Angebote.</p>`;

  const schema = buildOffersSchema(offers);

  // Schema robust in den Head injizieren, ohne am Template bauen zu müssen
  const withSchema = tpl.includes("</head>")
    ? tpl.replace("</head>", `${schema}\n</head>`)
    : `${schema}\n${tpl}`;

  return withSchema.replace("{{CONTENT}}", content);
}

/* ================= Build ================= */

const offers = readOffers();
const html = renderPage(offers);

fs.writeFileSync(OUT_INDEX, html, "utf8");
fs.writeFileSync(OUT_ANGEBOTE, html, "utf8");

console.log(`✔ Angebote gebaut: ${offers.length}`);
