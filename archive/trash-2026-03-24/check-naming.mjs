import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "css/app.css",
  "js/index-page.js",
  "docs/naming-conventions.md",
  "docs/pr-checklist.md",
];

const KEBAB_FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;
const LEGACY_FILE_ALLOWLIST = new Set(["style.css", "script.js"]);

const CORE_FILE_NAME_DIRS = ["css", "js"];

const REQUIRED_IDS = [
  "navbar-mount",
  "report-list",
  "filter-modal",
  "sort-filter",
  "time-filter",
  "agency-filter-user",
  "reset-filter-btn",
  "report-modal",
  "photo-error",
  "photo-preview-wrap",
  "photo-preview-grid",
  "photo-preview-count",
  "title-error",
  "agency-guide-panel",
  "use-location",
  "submit-btn",
  "app-toast",
  "app-toast-body",
  "image-inspect-modal",
  "image-inspect-title",
  "image-inspect-preview",
  "report-grid",
  "location-text",
  "auth-action-btn",
  "auth-user-avatar",
  "auth-action-text",
  "nav-avatar-wrap",
  "nav-notif-badge",
  "search-input",
  "create-report-btn",
];

const ID_TARGET_FILES = ["index.html", "js/index-page.js", "js/navbar-component.js"];

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

const violations = [];

for (const relPath of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(ROOT, relPath))) {
    violations.push(`Missing required file: ${relPath}`);
  }
}

for (const dir of CORE_FILE_NAME_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    continue;
  }
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (LEGACY_FILE_ALLOWLIST.has(entry.name)) {
      continue;
    }
    if (!KEBAB_FILE_RE.test(entry.name)) {
      violations.push(`Non-kebab file name in ${dir}/: ${entry.name}`);
    }
  }
}

const idCorpus = ID_TARGET_FILES.map(readFile).join("\n");
for (const id of REQUIRED_IDS) {
  if (!idCorpus.includes(id)) {
    violations.push(`Required kebab-case ID not found in core files: ${id}`);
  }
}

if (violations.length > 0) {
  console.error("Naming check failed:");
  for (const item of violations) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Naming check passed.");
