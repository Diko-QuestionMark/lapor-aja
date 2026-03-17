function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAdminEmailMap() {
  const raw = process.env.ADMIN_EMAIL_AGENCY_MAP;
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function buildAdminEmailMap() {
  const fromEnv = parseAdminEmailMap();
  if (fromEnv) {
    const map = new Map();
    Object.keys(fromEnv).forEach(function (key) {
      const email = normalizeEmail(key);
      const agency = String(fromEnv[key] || "").trim();
      if (email && agency) {
        map.set(email, agency);
      }
    });
    if (map.size > 0) {
      return map;
    }
  }

  return new Map([
    ["umum@gmail.com", "Umum"],
    ["dinaspu@gmail.com", "Dinas PU"],
    ["dishub@gmail.com", "Dinas Perhubungan"],
    ["dinaskebersihan@gmail.com", "Dinas Kebersihan"],
    ["dinaslh@gmail.com", "Dinas Lingkungan Hidup"],
    ["pdam@gmail.com", "PDAM"],
    ["pln@gmail.com", "PLN"],
    ["mbg@gmail.com", "Makan Bergizi Gratis (MBG)"],
    ["satpolpp@gmail.com", "Satpol PP"],
  ]);
}

const ADMIN_EMAIL_MAP = buildAdminEmailMap();

function getAdminAgencyByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return "";
  }
  return ADMIN_EMAIL_MAP.get(normalized) || "";
}

function isAdminEmail(email) {
  return Boolean(getAdminAgencyByEmail(email));
}

module.exports = {
  getAdminAgencyByEmail,
  isAdminEmail,
  normalizeEmail,
};
