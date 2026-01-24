import fs from "fs";
import path from "path";

const offersDir = path.join(process.cwd(), "content", "offers");
const outFile = path.join(process.cwd(), "angebote.html");

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
  // Decap datetime mit format YYYY-MM-DD (ohne Uhrzeit) -> direkt nutzbar
  const d = new Date(dateStr + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function readOffers() {
  if (!fs.existsSync(offersDir)) return [];

  const files = fs.readdirSync(offersDir).filter(f => f.endsWith(".json"));

  const offers = files.map(file => {
    const raw = fs.readFileSync(path.join(offersDir, file), "utf8");
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.warn(`⚠️ JSON fehlerhaft: ${file}`);
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
      cta_link: data.cta_link ?? "/kontakt.html",
      active: data.active !== false
    };
  }).filter(Boolean);

  // Filtern: nur active
  let list = offers.filter(o => o.active);

  // Optional: abgelaufene ausblenden (wenn valid_to gesetzt und < heute)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  list = list.filter(o => {
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

function renderOfferCard(o) {
  const img = o.image
    ? `<img class="card__img" src="${escapeHtml(o.image.startsWith("/") ? o.image : "/" + o.image)}" alt="${escapeHtml(o.title)}" loading="lazy">`
    : `<div class="card__img card__img--placeholder" aria-hidden="true"></div>`;

  const priceLine = `
    <div class="price">
      <span class="price__now">${escapeHtml(formatEUR(o.price))}</span>
      ${o.rrp ? `<span class="price__rrp">UVP: ${escapeHtml(formatEUR(o.rrp))}</span>` : ``}
    </div>
  `;

  const highlights = o.highlights?.length
    ? `<ul class="hl">${o.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : ``;

  const meta = `
    <div class="meta">
      ${o.category ? `<span class="pill">${escapeHtml(o.category)}</span>` : ``}
      ${o.valid_to ? `<span class="muted">gültig bis ${escapeHtml(o.valid_to)}</span>` : ``}
      ${o.featured ? `<span class="pill pill--hot">Top</span>` : ``}
    </div>
  `;

  const note = o.note ? `<p class="note">${escapeHtml(o.note)}</p>` : ``;

  const cta = o.cta_link
    ? `<a class="btn" href="${escapeHtml(o.cta_link)}">Anfragen</a>`
    : ``;

  return `
    <article class="card">
      ${img}
      <div class="card__body">
        ${meta}
        <h2 class="card__title">${escapeHtml(o.title)}</h2>
        ${priceLine}
        ${highlights}
        ${note}
        <div class="cta">${cta}</div>
      </div>
    </article>
  `;
}

function renderPage(offers) {
  const cards = offers.map(renderOfferCard).join("\n");

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Angebote – Unger Warburg</title>
  <meta name="description" content="Aktuelle Angebote – gepflegt im CMS und automatisch hier angezeigt." />
  <style>
    :root{--max:1100px;--gap:18px;--radius:14px;--border:#e7e7e7;--muted:#666;}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111;background:#fff;}
    header{padding:28px 16px;border-bottom:1px solid var(--border);}
    .wrap{max-width:var(--max);margin:0 auto;}
    h1{margin:0 0 6px;font-size:28px;}
    .sub{margin:0;color:var(--muted);}
    main{padding:22px 16px 40px;}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--gap);}
    @media (max-width: 980px){.grid{grid-template-columns:repeat(2,1fr);}}
    @media (max-width: 620px){.grid{grid-template-columns:1fr;}}
    .card{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:#fff;box-shadow:0 8px 22px rgba(0,0,0,.04);display:flex;flex-direction:column;}
    .card__img{width:100%;aspect-ratio: 4/3;object-fit:cover;display:block;background:#f4f4f4;}
    .card__img--placeholder{display:block;}
    .card__body{padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px;flex:1;}
    .card__title{margin:0;font-size:18px;}
    .meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
    .pill{font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:#fafafa;}
    .pill--hot{border-color:#ffd6a8;background:#fff3e6;}
    .muted{color:var(--muted);font-size:12px;}
    .price{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;}
    .price__now{font-weight:800;font-size:18px;}
    .price__rrp{color:var(--muted);font-size:12px;text-decoration:line-through;}
    .hl{margin:0;padding-left:18px;color:#222;}
    .hl li{margin:2px 0;}
    .note{margin:0;color:var(--muted);font-size:13px;}
    .cta{margin-top:auto;}
    .btn{display:inline-block;padding:10px 12px;border-radius:12px;border:1px solid var(--border);text-decoration:none;color:#111;background:#fff;}
    .empty{padding:20px;border:1px dashed var(--border);border-radius:var(--radius);color:var(--muted);}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>Angebote</h1>
      <p class="sub">Aktuelle Angebote – im CMS gepflegt, automatisch hier angezeigt.</p>
    </div>
  </header>

  <main>
    <div class="wrap">
      ${offers.length ? `<section class="grid">${cards}</section>` : `<div class="empty">Aktuell sind keine Angebote online.</div>`}
    </div>
  </main>
</body>
</html>`;
}

const offers = readOffers();
fs.writeFileSync(outFile, renderPage(offers), "utf8");
console.log(`✅ angebote.html erzeugt (${offers.length} Angebote)`);
