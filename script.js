// Mobile Menü
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Menü schließen nach Klick
  navMenu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      navMenu.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// Jahr im Footer
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Datum "Stand" Datenschutz
const privacyDate = document.getElementById("privacyDate");
if (privacyDate) {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  privacyDate.textContent = `${dd}.${mm}.${yyyy}`;
}

// Kontaktformular: öffnet Mailprogramm (mailto), keine Daten werden gespeichert.
function handleContactSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  const message = form.message.value.trim();

  const subject = encodeURIComponent("Anfrage – Unger Haushalts- & Medientechnik");
  const body = encodeURIComponent(
    `Name: ${name}\nTelefon: ${phone}\nE-Mail: ${email}\n\nNachricht:\n${message}\n`
  );

  window.location.href = `mailto:info@unger-warburg.de?subject=${subject}&body=${body}`;
  return false;
}

// Lightbox (Galerie)
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");

function openLightbox(src, altText = "") {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightboxImg.alt = altText;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-lightbox]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const src = btn.getAttribute("data-lightbox");
    const img = btn.querySelector("img");
    const alt = img ? img.getAttribute("alt") : "";
    openLightbox(src, alt);
  });
});

if (lightbox) {
  // Klick auf Hintergrund schließt
  lightbox.addEventListener("click", (e) => {
    if (e.target && e.target.matches("[data-close]")) closeLightbox();
  });

  // ESC schließt
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  const backdrop = lightbox.querySelector("[data-close]");
  const xBtn = lightbox.querySelector(".lightbox__close");
  if (backdrop) backdrop.addEventListener("click", closeLightbox);
  if (xBtn) xBtn.addEventListener("click", closeLightbox);
}
