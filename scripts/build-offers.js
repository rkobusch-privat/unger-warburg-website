import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");

// Wir bauen für die Subdomain: / (index.html) und optional auch /angebote.html
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
  // Decap config: format "YYYY-MM-DD"
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
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

  // Nur aktive
  let list = offers.filter((o) => o.active);

  // Optional: abgelaufene ausblenden (nur wenn valid_to gesetzt)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  list = list.filter((o) => {
    const d = parseDateISO(o.valid_to);
    return !d || d >= today;
  });

  // Sortierung: featured zuerst, dann nach Titel
  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), "de");
  });

  return list;
}

/**
 * WICHTIG: Wir nutzen eure bestehenden Styles/Klassen:
 * - grid
 * - tile
 * - btn / btn--ghost
 * - pill
 * Damit sieht das nicht "fremd" aus, sondern wie eure Website.
 */
function renderOfferTile(o) {
  const imgSrc = o.image ? (o.image.startsWith("/") ? o.image : "/" + o.image) : "";
  const priceNow = formatEUR(o.price);
  const priceRrp = o.rrp ? formatEUR(o.rrp) : "";
  const hasRrp = Boolean(o.rrp);

  const highlights = o.highlights?.length
    ? `<ul class="list">${o.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : "";

  const metaLine = [
    o.category ? `<span class="pill">${escapeHtml(o.category)}</span>` : "",
    o.valid_to ? `<span class="pill">gültig bis ${escapeHtml(o.valid_to)}</span>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
<article class="tile">
  ${o.featured ? `<div class="pill" style="margin-bottom:10px">🔥 Top-Angebot</div>` : ""}

  ${metaLine ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">${metaLine}</div>` : ""}

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

  ${highlights}

  ${o.note ? `<p style="margin-top:10px;color:var(--muted)">${escapeHtml(o.note)}</p>` : ""}

  <div style="margin-top:14px">
    <a class="btn btn--ghost" href="${escapeHtml(o.cta_link || "https://unger-warburg.de/#kontakt")}">Anfragen</a>
  </div>
</article>`;
}

function renderPage(offers) {
  const templatePath = path.join(process.cwd(), "templates", "offers-page.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template fehlt: ${path.relative(process.cwd(), templatePath)} (bitte templates/offers-page.html anlegen)`
    );
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

  fs.writeFileSync(outIndex, html, "utf8");
  fs.writeFileSync(outOffers, html, "utf8");

  console.log(`✅ Angebote gebaut: ${offers.length} Einträge`);
  console.log(`   → ${path.relative(process.cwd(), outIndex)}`);
  console.log(`   → ${path.relative(process.cwd(), outOffers)}`);
}

main();

