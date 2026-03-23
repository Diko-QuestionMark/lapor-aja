const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, function (char) {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char] || char
    );
  });
}

function getStatusMeta(status) {
  const normalized = String(status || "Menunggu").toLowerCase();
  if (normalized === "diproses") {
    return { label: "Diproses", className: "status-diproses" };
  }
  if (normalized === "selesai") {
    return { label: "Selesai", className: "status-selesai" };
  }
  return { label: "Menunggu", className: "status-menunggu" };
}

function showAlert(message, type) {
  const box = document.getElementById("userAlert");
  box.textContent = message;
  box.className = `alert py-2 mb-3 alert-${type}`;
}

function getUserIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

function renderHeader(user, reportCount) {
  const avatar = document.getElementById("userAvatar");
  const name = document.getElementById("userName");
  const meta = document.getElementById("userMeta");

  avatar.src = user.profile_image_url || DEFAULT_AVATAR_URL;
  avatar.onerror = function () {
    avatar.src = DEFAULT_AVATAR_URL;
  };
  name.textContent = user.name || "Warga";
  meta.textContent = `Total laporan: ${reportCount} - Bergabung: ${
    user.created_at ? new Date(user.created_at).toLocaleString("id-ID") : "-"
  }`;
}

function renderReports(reports) {
  const root = document.getElementById("userReports");
  if (!Array.isArray(reports) || reports.length === 0) {
    root.innerHTML = '<p class="text-secondary mb-0">Pelapor ini belum punya laporan.</p>';
    return;
  }

  root.innerHTML = reports
    .map(function (report) {
      const status = getStatusMeta(report.status);
      return `
        <article class="border rounded p-3 mb-2">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="flex-grow-1">
              <div class="fw-semibold">${escapeHtml(report.title || "Tanpa Judul")}</div>
              <div class="small text-secondary mb-1">${
                report.created_at
                  ? new Date(report.created_at).toLocaleString("id-ID")
                  : "-"
              }</div>
              <div class="small">Dukungan: ${Number(report.upvotes || 0)}</div>
            </div>
            <span class="badge status-badge ${status.className}">${status.label}</span>
          </div>
          <a class="small" href="/report.html?id=${Number(report.id)}">Lihat detail</a>
        </article>
      `;
    })
    .join("");
}

async function loadUserProfile() {
  const userId = getUserIdFromQuery();
  if (!userId || Number.isNaN(userId)) {
    showAlert("ID user tidak valid.", "danger");
    document.getElementById("userReports").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat profil user.</p>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/users?id=${userId}`);
    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(data.error || "Gagal memuat user");
    }

    renderHeader(data.user || {}, Array.isArray(data.reports) ? data.reports.length : 0);
    renderReports(data.reports || []);
  } catch (error) {
    showAlert(error.message || "Gagal memuat profil user.", "danger");
    document.getElementById("userReports").innerHTML =
      '<p class="text-danger mb-0">Gagal memuat laporan user.</p>';
  }
}

loadUserProfile();
