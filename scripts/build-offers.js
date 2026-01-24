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
  const imgSrc = o.image
    ? (o.image.startsWith("/") ? o.image : "/" + o.image)
    : "";

  const img = imgSrc
    ? `<img class="card__img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(o.title)}" loading="lazy">`
    : `<div class="card__img card__img--placeholder" aria-hidden="true"></div>`;

  const priceNow = formatEUR(o.price);
  const priceRrp = o.rrp ? formatEUR(o.rrp) : "";
  const hasRrp = Boolean(o.rrp);

  const highlights = (o.highlights?.length)
    ? `<ul class="hl">${o.highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
    : ``;

  const metaLeft = o.category ? `<span class="meta__pill">${escapeHtml(o.category)}</span>` : ``;
  const metaRight = o.valid_to ? `<span class="meta__hint">gültig bis ${escapeHtml(o.valid_to)}</span>` : ``;

  const badge = o.featured ? `<div class="badge" aria-label="Top-Angebot">Top</div>` : ``;

  const note = o.note ? `<p class="note">${escapeHtml(o.note)}</p>` : ``;

  const cta = o.cta_link
    ? `<a class="btn" href="${escapeHtml(o.cta_link)}">Beratung / Anfragen</a>`
    : ``;

  return `
    <article class="card">
      <div class="media">
        ${badge}
        ${img}
      </div>

      <div class="card__body">
        <div class="meta">
          <div class="meta__left">${metaLeft}</div>
          <div class="meta__right">${metaRight}</div>
        </div>

        <h2 class="card__title">${escapeHtml(o.title)}</h2>

        <div class="price">
          <div class="price__now">${escapeHtml(priceNow)}</div>
          ${hasRrp ? `<div class="price__rrp">UVP <span>${escapeHtml(priceRrp)}</span></div>` : ``}
        </div>

        ${highlights}
        ${note}

        <div class="cta">
          ${cta}
        </div>
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
  :root{
    --max: 1120px;
    --gap: 18px;
    --radius: 16px;
    --border: #e7e7ea;
    --text: #111216;
    --muted: #5e6472;
    --bg: #ffffff;
    --bg-soft: #f6f7f9;
    --shadow: 0 10px 28px rgba(0,0,0,.06);
    --shadow2: 0 10px 26px rgba(0,0,0,.10);
    --accent: #0a66ff;
  }

  *{box-sizing:border-box}
  body{
    margin:0;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    line-height:1.5;
    color:var(--text);
    background: linear-gradient(180deg, var(--bg-soft), var(--bg) 320px);
  }

  a{color:inherit}

  header{
    padding: 34px 16px 22px;
    border-bottom:1px solid rgba(0,0,0,.06);
    background: rgba(255,255,255,.75);
    backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .wrap{max-width:var(--max);margin:0 auto;}
  h1{margin:0 0 6px;font-size:30px;letter-spacing:-0.02em}
  .sub{margin:0;color:var(--muted);max-width: 70ch}

  main{padding: 22px 16px 46px;}

  /* Grid */
  .grid{
    display:grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gap);
  }
  @media (max-width: 1020px){ .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 660px){ .grid{ grid-template-columns: 1fr; } }

  /* Card */
  .card{
    border:1px solid var(--border);
    border-radius: var(--radius);
    background: rgba(255,255,255,.92);
    box-shadow: var(--shadow);
    overflow:hidden;
    display:flex;
    flex-direction:column;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .card:hover{ transform: translateY(-2px); box-shadow: var(--shadow2); }

  .media{ position:relative; }
  .card__img{
    width:100%;
    aspect-ratio: 4/3;
    object-fit: cover;
    display:block;
    background:#eceef2;
  }
  .card__img--placeholder{
    background: repeating-linear-gradient(135deg, #eef0f4, #eef0f4 14px, #f6f7fa 14px, #f6f7fa 28px);
  }

  .badge{
    position:absolute;
    top: 12px;
    left: 12px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(10,102,255,.10);
    border: 1px solid rgba(10,102,255,.22);
    color: #0a3fb5;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: .02em;
    z-index: 2;
  }

  .card__body{
    padding: 14px 14px 16px;
    display:flex;
    flex-direction:column;
    gap: 10px;
    flex:1;
  }

  .meta{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap: 10px;
    flex-wrap:wrap;
  }
  .meta__pill{
    display:inline-flex;
    align-items:center;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,.08);
    background: rgba(255,255,255,.8);
    font-size: 12px;
    color: var(--muted);
  }
  .meta__hint{
    font-size: 12px;
    color: var(--muted);
  }

  .card__title{
    margin:0;
    font-size: 18px;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }

  .price{
    display:flex;
    align-items:baseline;
    justify-content:space-between;
    gap: 10px;
    flex-wrap:wrap;
    padding: 10px 12px;
    border-radius: 14px;
    background: #fff;
    border: 1px solid rgba(0,0,0,.06);
  }
  .price__now{
    font-weight: 900;
    font-size: 20px;
    letter-spacing:-0.01em;
  }
  .price__rrp{
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }
  .price__rrp span{
    text-decoration: line-through;
    margin-left: 6px;
  }

  .hl{
    margin: 0;
    padding-left: 18px;
    color: #2b2f3a;
  }
  .hl li{ margin: 3px 0; }

  .note{
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    padding: 10px 12px;
    border-left: 3px solid rgba(10,102,255,.25);
    background: rgba(10,102,255,.06);
    border-radius: 12px;
  }

  .cta{ margin-top:auto; }

  .btn{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap: 8px;
    padding: 11px 12px;
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,.10);
    background: #111216;
    color: #fff;
    text-decoration:none;
    font-weight: 700;
    font-size: 14px;
  }
  .btn:hover{ filter: brightness(1.05); }

  .empty{
    padding: 22px;
    border: 1px dashed rgba(0,0,0,.18);
    border-radius: var(--radius);
    color: var(--muted);
    background: rgba(255,255,255,.7);
  }
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
