const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const srcDir = path.join(projectRoot, "src-pages");
const partialsDir = path.join(projectRoot, "partials");

const partialFiles = {
  topbar: path.join(partialsDir, "topbar.html"),
  header: path.join(partialsDir, "header.html"),
  footer: path.join(partialsDir, "footer.html"),
};

function readFileSafe(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datei nicht gefunden: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getHtmlFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Quellordner nicht gefunden: ${dirPath}`);
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith(".html"))
    .sort();
}

function injectPartials(template, partials) {
  return template
    .replace(/{{\s*TOPBAR\s*}}/g, partials.topbar)
    .replace(/{{\s*HEADER\s*}}/g, partials.header)
    .replace(/{{\s*FOOTER\s*}}/g, partials.footer);
}

function injectYearScript(template) {
  const yearScript = `
  <script>
    (function () {
      var el = document.getElementById("year");
      if (el) el.textContent = new Date().getFullYear();
    })();
  </script>`;

  return template.replace(/{{\s*YEAR_SCRIPT\s*}}/g, yearScript);
}

function buildPages() {
  ensureDirectory(srcDir);
  ensureDirectory(partialsDir);

  const partials = {
    topbar: readFileSafe(partialFiles.topbar),
    header: readFileSafe(partialFiles.header),
    footer: readFileSafe(partialFiles.footer),
  };

  const htmlFiles = getHtmlFiles(srcDir);

  if (htmlFiles.length === 0) {
    console.log("Keine HTML-Dateien in src-pages gefunden.");
    return;
  }

  htmlFiles.forEach((fileName) => {
    const srcFile = path.join(srcDir, fileName);
    const outFile = path.join(projectRoot, fileName);

    let html = readFileSafe(srcFile);
    html = injectPartials(html, partials);
    html = injectYearScript(html);

    fs.writeFileSync(outFile, html, "utf8");
    console.log(`Gebaut: ${fileName}`);
  });

  console.log("Build abgeschlossen.");
}

try {
  buildPages();
} catch (error) {
  console.error("Build fehlgeschlagen:");
  console.error(error.message);
  process.exit(1);
}