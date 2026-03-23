const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const SESSION_KEY = "laporaja_session_v1";
const AUTH_NOTICE_KEY = "laporaja_auth_notice_v1";
const CLOUDINARY_CLOUD_NAME = "dpipyaboq";
const CLOUDINARY_UPLOAD_PRESET = "laporaja_unsigned";
const MAX_FILE_SIZE_MB = 2;
const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

let currentSession = null;
let currentUser = null;
let logoutConfirmModal = null;
let toastInstance = null;
let editProfileModal = null;

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function showAlert(message, type) {
  if (type === "success") {
    showToast(message || "Sukses");
    return;
  }
  const box = document.getElementById("profileAlert");
  box.textContent = message;
  box.className = `alert py-2 mb-3 alert-${type}`;
}

function showToast(message) {
  const toastEl = document.getElementById("profileToast");
  const toastBody = document.getElementById("profileToastBody");
  if (!toastEl || !toastBody || !toastInstance) {
    return;
  }
  toastBody.textContent = message;
  toastInstance.show();
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (char) {
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

function ensureLoggedIn() {
  const session = readSession();
  if (!session || !session.token || !session.email) {
    localStorage.setItem(
      AUTH_NOTICE_KEY,
      "Silakan login dulu untuk melihat profil.",
    );
    window.location.href = "/login.html";
    return null;
  }
  return session;
}

function getUserRole(user, session) {
  const role = String((user && user.role) || (session && session.role) || "user")
    .trim()
    .toLowerCase();
  return role === "admin" ? "admin" : "user";
}

function renderProfileInfo(user) {
  const role = getUserRole(user, currentSession);
  const agency = String(user && user.agency ? user.agency : "").trim();
  const agencyLine =
    role === "admin" && agency
      ? `<div class="small text-secondary">Instansi: ${escapeHtml(agency)}</div>`
      : "";
  const el = document.getElementById("profileInfo");
  el.innerHTML = `
    <div class="fw-semibold text-dark">${escapeHtml(user.name || "-")}</div>
    <div class="small">${escapeHtml(user.email || "-")}</div>
    ${agencyLine}
  `;
}

function renderProfileInfoSkeleton() {
  const el = document.getElementById("profileInfo");
  if (!el) {
    return;
  }
  el.innerHTML = `
    <div class="profile-skeleton-line profile-skeleton-line-name"></div>
    <div class="profile-skeleton-line profile-skeleton-line-email"></div>
  `;
}

function renderAvatar(user) {
  const avatar = document.getElementById("profileAvatar");
  avatar.classList.remove("is-skeleton");
  avatar.src = user.profile_image_url || DEFAULT_AVATAR_URL;
  avatar.onerror = function () {
    avatar.classList.remove("is-skeleton");
    avatar.src = DEFAULT_AVATAR_URL;
  };
}

function renderProfileAvatarSkeleton() {
  const avatar = document.getElementById("profileAvatar");
  if (!avatar) {
    return;
  }
  avatar.classList.add("is-skeleton");
  avatar.src = TRANSPARENT_PIXEL;
  avatar.onerror = null;
}

function syncPreviewAvatar(url) {
  const preview = document.getElementById("profilePhotoPreview");
  if (!preview) {
    return;
  }
  preview.src = url || DEFAULT_AVATAR_URL;
  preview.onerror = function () {
    preview.src = DEFAULT_AVATAR_URL;
  };
}

function setReportsSectionCopy(user) {
  const role = getUserRole(user, currentSession);
  const titleEl = document.getElementById("profileReportsTitle");
  const subtitleEl = document.getElementById("profileReportsSubtitle");
  if (titleEl) {
    titleEl.textContent =
      role === "admin" ? "Laporan Instansi Saya" : "Laporan Saya";
  }
  if (subtitleEl) {
    subtitleEl.textContent = "";
  }
}

function setSaveLoading(isLoading) {
  const btn = document.getElementById("saveProfileBtn");
  if (!btn) {
    return;
  }
  if (!btn.dataset.defaultText) {
    btn.dataset.defaultText = btn.textContent || "Simpan";
  }
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Menyimpan..." : btn.dataset.defaultText;
}

async function apiFetch(path, options = {}) {
  const session = currentSession || readSession();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${session.token}`,
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(function () {
    return {};
  });
  if (response.status === 401) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(
      AUTH_NOTICE_KEY,
      "Sesi kamu habis. Silakan login lagi.",
    );
    window.location.href = "/login.html";
    throw new Error("Tidak terautentikasi");
  }
  if (!response.ok) {
    throw new Error(data.error || "Request gagal");
  }
  return data;
}

function validatePhotoFile(file) {
  if (!file) {
    return "";
  }
  if (!file.type.startsWith("image/")) {
    return "File foto profil harus berupa gambar.";
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `Ukuran foto profil maksimal ${MAX_FILE_SIZE_MB}MB.`;
  }
  return "";
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData },
  );
  if (!response.ok) {
    throw new Error("Upload foto profil gagal");
  }
  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("URL foto profil tidak ditemukan");
  }
  return data.secure_url;
}

function renderStats(stats) {
  const root = document.getElementById("profileStats");
  root.innerHTML = stats
    .map(function (item) {
      return `
        <div class="col-6 col-md-3">
          <div class="card shadow-sm h-100">
            <div class="card-body py-3">
              <div class="small text-secondary">${item.label}</div>
              <div class="h5 mb-0">${item.value}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderUserStats(myReports) {
  const total = myReports.length;
  const waiting = myReports.filter(function (r) {
    return String(r.status || "").toLowerCase() === "menunggu";
  }).length;
  const done = myReports.filter(function (r) {
    return String(r.status || "").toLowerCase() === "selesai";
  }).length;
  const support = myReports.reduce(function (sum, r) {
    return sum + Number(r.upvotes || 0);
  }, 0);

  renderStats([
    { label: "Total Laporan", value: total },
    { label: "Menunggu", value: waiting },
    { label: "Selesai", value: done },
    { label: "Total Dukungan", value: support },
  ]);
}

function renderAdminStats(adminReports) {
  const total = adminReports.length;
  const waiting = adminReports.filter(function (r) {
    return String(r.status || "").toLowerCase() === "menunggu";
  }).length;
  const inProgress = adminReports.filter(function (r) {
    return String(r.status || "").toLowerCase() === "diproses";
  }).length;
  const done = adminReports.filter(function (r) {
    return String(r.status || "").toLowerCase() === "selesai";
  }).length;

  renderStats([
    { label: "Total Laporan", value: total },
    { label: "Menunggu", value: waiting },
    { label: "Diproses", value: inProgress },
    { label: "Selesai", value: done },
  ]);
}

function renderStatsSkeleton() {
  const root = document.getElementById("profileStats");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div class="col-6 col-md-3">
      <div class="card shadow-sm h-100 profile-stat-skeleton-card"><div class="card-body py-3"><div class="profile-skeleton-line profile-skeleton-line-sm"></div><div class="profile-skeleton-line profile-skeleton-line-md"></div></div></div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card shadow-sm h-100 profile-stat-skeleton-card"><div class="card-body py-3"><div class="profile-skeleton-line profile-skeleton-line-sm"></div><div class="profile-skeleton-line profile-skeleton-line-md"></div></div></div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card shadow-sm h-100 profile-stat-skeleton-card"><div class="card-body py-3"><div class="profile-skeleton-line profile-skeleton-line-sm"></div><div class="profile-skeleton-line profile-skeleton-line-md"></div></div></div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card shadow-sm h-100 profile-stat-skeleton-card"><div class="card-body py-3"><div class="profile-skeleton-line profile-skeleton-line-sm"></div><div class="profile-skeleton-line profile-skeleton-line-md"></div></div></div>
    </div>
  `;
}

function getReportPreviewUrl(report) {
  if (Array.isArray(report.image_urls) && report.image_urls.length > 0) {
    return String(report.image_urls[0] || "").trim();
  }
  return String(report.image_url || "").trim();
}

function formatRelativeTime(dateValue) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const nowMs = Date.now();
  const diffMs = nowMs - date.getTime();
  const isPast = diffMs >= 0;
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);

  const units = [
    { limit: 60, seconds: 1, label: "detik" },
    { limit: 60 * 60, seconds: 60, label: "menit" },
    { limit: 60 * 60 * 24, seconds: 60 * 60, label: "jam" },
    { limit: 60 * 60 * 24 * 30, seconds: 60 * 60 * 24, label: "hari" },
    { limit: 60 * 60 * 24 * 365, seconds: 60 * 60 * 24 * 30, label: "bulan" },
  ];

  let value = Math.floor(diffSec / (60 * 60 * 24 * 365));
  let label = "tahun";

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (diffSec < unit.limit) {
      value = Math.floor(diffSec / unit.seconds);
      label = unit.label;
      break;
    }
  }

  const safeValue = Math.max(1, value);
  if (isPast) {
    return `${safeValue} ${label} yang lalu`;
  }
  return `dalam ${safeValue} ${label}`;
}

function renderUserReports(myReports) {
  const root = document.getElementById("profileReports");
  if (myReports.length === 0) {
    root.innerHTML =
      '<p class="text-secondary mb-0">Kamu belum mengirim laporan apa pun.</p>';
    return;
  }

  root.innerHTML = myReports
    .map(function (report) {
      const status = getStatusMeta(report.status);
      const previewUrl = getReportPreviewUrl(report);
      const reportId = Number(report.id);
      return `
        <article class="profile-report-card mb-2" data-report-id="${reportId}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="d-flex align-items-start gap-2 flex-grow-1">
              <img
                src="${escapeHtml(previewUrl || DEFAULT_AVATAR_URL)}"
                class="profile-report-thumb"
                alt="Preview laporan"
                onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
              />
              <div class="w-100">
                <div class="fw-semibold">${escapeHtml(report.title || "Tanpa Judul")}</div>
                <div class="small mb-1 text-truncate-2">${escapeHtml(report.desc || "Tanpa deskripsi")}</div>
                <div class="small text-secondary">${formatRelativeTime(report.created_at)}</div>
              </div>
            </div>
            <span class="badge status-badge ${status.className}">${status.label}</span>
          </div>
          <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
            <div class="small text-secondary">Dukungan: ${Number(report.upvotes || 0)}</div>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              data-delete-report="${reportId}"
            >
              Hapus
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAdminReports(adminReports) {
  const root = document.getElementById("profileReports");
  const agency = String((currentUser && currentUser.agency) || "").trim();
  if (!Array.isArray(adminReports) || adminReports.length === 0) {
    root.innerHTML = `<p class="text-secondary mb-0">Belum ada laporan untuk ${
      escapeHtml(agency || "instansi kamu")
    }.</p>`;
    return;
  }

  root.innerHTML = adminReports
    .map(function (report) {
      const status = getStatusMeta(report.status);
      const previewUrl = getReportPreviewUrl(report);
      const reportId = Number(report.id);
      const reporterName = String(report.reporter_name || "Anonim");
      const reporterEmail = String(report.reporter_email || "-");
      return `
        <article class="profile-admin-report-card mb-2" data-admin-report-id="${reportId}">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="d-flex align-items-start gap-2 flex-grow-1">
              <img
                src="${escapeHtml(previewUrl || DEFAULT_AVATAR_URL)}"
                class="profile-report-thumb"
                alt="Preview laporan"
                onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
              />
              <div class="w-100">
                <div class="fw-semibold">${escapeHtml(report.title || "Tanpa Judul")}</div>
                <div class="small mb-1 text-truncate-2">${escapeHtml(report.desc || "Tanpa deskripsi")}</div>
                <div class="profile-admin-meta">${escapeHtml(reporterName)} (${escapeHtml(reporterEmail)})</div>
                <div class="small text-secondary">${formatRelativeTime(report.created_at)}</div>
              </div>
            </div>
            <span class="badge status-badge ${status.className}">${status.label}</span>
          </div>
          <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
            <div class="small text-secondary">Dukungan: ${Number(report.upvotes || 0)}</div>
            <a href="/admin/report.html?id=${reportId}" class="btn btn-sm btn-outline-dark">Buka Detail</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderReportsSkeleton() {
  const root = document.getElementById("profileReports");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <article class="profile-report-skeleton mb-2" aria-hidden="true">
      <div class="profile-report-skeleton-thumb"></div>
      <div class="profile-report-skeleton-main">
        <div class="profile-skeleton-line profile-skeleton-line-md"></div>
        <div class="profile-skeleton-line"></div>
        <div class="profile-skeleton-line profile-skeleton-line-sm"></div>
      </div>
      <div class="profile-report-skeleton-side">
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
      </div>
    </article>
    <article class="profile-report-skeleton mb-2" aria-hidden="true">
      <div class="profile-report-skeleton-thumb"></div>
      <div class="profile-report-skeleton-main">
        <div class="profile-skeleton-line profile-skeleton-line-md"></div>
        <div class="profile-skeleton-line"></div>
        <div class="profile-skeleton-line profile-skeleton-line-sm"></div>
      </div>
      <div class="profile-report-skeleton-side">
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
      </div>
    </article>
    <article class="profile-report-skeleton mb-2" aria-hidden="true">
      <div class="profile-report-skeleton-thumb"></div>
      <div class="profile-report-skeleton-main">
        <div class="profile-skeleton-line profile-skeleton-line-md"></div>
        <div class="profile-skeleton-line"></div>
        <div class="profile-skeleton-line profile-skeleton-line-sm"></div>
      </div>
      <div class="profile-report-skeleton-side">
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
        <div class="profile-skeleton-line profile-skeleton-pill"></div>
      </div>
    </article>
  `;
}

function renderProfilePageSkeleton() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.classList.add("d-none");
  }
  const reportTitle = document.getElementById("profileReportsTitle");
  if (reportTitle) {
    reportTitle.textContent = "Laporan Saya";
  }
  const reportSubtitle = document.getElementById("profileReportsSubtitle");
  if (reportSubtitle) {
    reportSubtitle.textContent = "";
  }
  renderProfileAvatarSkeleton();
  renderProfileInfoSkeleton();
  renderStatsSkeleton();
  renderReportsSkeleton();
}

async function handleDeleteReport(reportId) {
  if (!reportId || Number.isNaN(reportId)) {
    return;
  }
  const shouldDelete = window.confirm("Yakin ingin menghapus laporan ini?");
  if (!shouldDelete) {
    return;
  }

  try {
    await apiFetch(`/reports?id=${reportId}`, { method: "DELETE" });
    showAlert("Laporan berhasil dihapus.", "success");
    if (currentUser) {
      await loadProfileContentByRole(currentUser);
    }
  } catch (error) {
    showAlert(error.message || "Gagal menghapus laporan.", "danger");
  }
}

async function loadReportsForUser(user) {
  const data = await apiFetch("/reports");
  const myReports = data.filter(function (item) {
    return Number(item.reporter_user_id || 0) === Number(user.id);
  });
  renderUserStats(myReports);
  renderUserReports(myReports);
}

async function loadReportsForAdmin() {
  const adminReports = await apiFetch("/admin/reports");
  renderAdminStats(adminReports);
  renderAdminReports(adminReports);
}

async function loadProfileContentByRole(user) {
  const role = getUserRole(user, currentSession);
  setReportsSectionCopy(user);
  if (role === "admin") {
    await loadReportsForAdmin();
    return;
  }
  await loadReportsForUser(user);
}

async function loadProfile() {
  currentSession = ensureLoggedIn();
  if (!currentSession) {
    return;
  }
  renderProfilePageSkeleton();

  try {
    const data = await apiFetch("/me");
    currentUser = data.user;
    renderAvatar(currentUser);
    syncPreviewAvatar(currentUser.profile_image_url || DEFAULT_AVATAR_URL);
    renderProfileInfo(currentUser);
    const editBtn = document.getElementById("editProfileBtn");
    if (editBtn) {
      editBtn.classList.remove("d-none");
    }
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.classList.remove("d-none");
    }
    document.getElementById("profileName").value = currentUser.name || "";

    const nextSession = {
      ...currentSession,
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role || currentSession.role || "user",
      agency: currentUser.agency || currentSession.agency || "",
      profile_image_url: currentUser.profile_image_url || "",
    };
    writeSession(nextSession);
    currentSession = nextSession;

    await loadProfileContentByRole(currentUser);
  } catch (error) {
    showAlert(error.message || "Gagal memuat profil.", "danger");
    document.getElementById("profileInfo").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat profil.</p>';
    document.getElementById("profileReports").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat laporan profil.</p>';
    document.getElementById("profileStats").innerHTML = "";
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.classList.remove("d-none");
    }
  }
}

async function handleSaveProfile(event) {
  event.preventDefault();
  if (!currentSession || !currentUser) {
    return;
  }

  const nextName = document.getElementById("profileName").value.trim();
  const photoFile = document.getElementById("profilePhoto").files[0];
  const photoError = validatePhotoFile(photoFile);
  if (photoError) {
    showAlert(photoError, "danger");
    return;
  }

  if (nextName.length < 2) {
    showAlert("Nama minimal 2 karakter.", "danger");
    return;
  }

  setSaveLoading(true);
  try {
    let nextImageUrl = currentUser.profile_image_url || "";
    if (photoFile) {
      showAlert("Mengupload foto profil...", "info");
      nextImageUrl = await uploadToCloudinary(photoFile);
    }

    const data = await apiFetch("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        profile_image_url: nextImageUrl,
      }),
    });

    currentUser = data.user;
    const nextSession = {
      ...currentSession,
      token: data.token || currentSession.token,
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role || currentSession.role || "user",
      agency: currentUser.agency || currentSession.agency || "",
      profile_image_url: currentUser.profile_image_url || "",
    };
    writeSession(nextSession);
    currentSession = nextSession;

    renderAvatar(currentUser);
    syncPreviewAvatar(currentUser.profile_image_url || DEFAULT_AVATAR_URL);
    renderProfileInfo(currentUser);
    document.getElementById("profilePhoto").value = "";
    showAlert("Profil berhasil diperbarui.", "success");
    await loadProfileContentByRole(currentUser);
    if (editProfileModal) {
      editProfileModal.hide();
    }
  } catch (error) {
    showAlert(error.message || "Gagal menyimpan profil.", "danger");
  } finally {
    setSaveLoading(false);
  }
}

function init() {
  const toastEl = document.getElementById("profileToast");
  if (toastEl) {
    toastInstance = new bootstrap.Toast(toastEl, { delay: 2600 });
  }
  const editModalEl = document.getElementById("editProfileModal");
  if (editModalEl) {
    editProfileModal = bootstrap.Modal.getOrCreateInstance(editModalEl);
  }
  const form = document.getElementById("profileForm");
  if (form) {
    form.addEventListener("submit", handleSaveProfile);
  }
  const photoInput = document.getElementById("profilePhoto");
  if (photoInput) {
    photoInput.addEventListener("change", function () {
      const file = photoInput.files ? photoInput.files[0] : null;
      if (!file) {
        syncPreviewAvatar(currentUser ? currentUser.profile_image_url : "");
        return;
      }
      if (!file.type.startsWith("image/")) {
        return;
      }
      const url = URL.createObjectURL(file);
      syncPreviewAvatar(url);
    });
  }
  const editBtn = document.getElementById("editProfileBtn");
  if (editBtn) {
    editBtn.addEventListener("click", function () {
      if (editProfileModal) {
        editProfileModal.show();
      }
    });
  }
  logoutConfirmModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("logoutConfirmModal"),
  );
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      if (logoutConfirmModal) {
        logoutConfirmModal.show();
      }
    });
  }
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener("click", function () {
      localStorage.removeItem(SESSION_KEY);
      if (logoutConfirmModal) {
        logoutConfirmModal.hide();
      }
      window.location.href = "/login.html";
    });
  }
  const params = new URLSearchParams(window.location.search || "");
  const shouldOpenLogoutConfirm = params.get("logout") === "1";
  if (shouldOpenLogoutConfirm) {
    window.history.replaceState({}, "", "/profile.html");
    window.setTimeout(function () {
      if (logoutConfirmModal) {
        logoutConfirmModal.show();
      }
    }, 80);
  }
  const reportsRoot = document.getElementById("profileReports");
  if (reportsRoot) {
    reportsRoot.addEventListener("click", function (event) {
      const deleteBtn = event.target.closest("[data-delete-report]");
      if (deleteBtn) {
        const reportId = Number(deleteBtn.getAttribute("data-delete-report"));
        handleDeleteReport(reportId);
        return;
      }
      const adminCard = event.target.closest("[data-admin-report-id]");
      if (adminCard) {
        const reportId = Number(adminCard.getAttribute("data-admin-report-id"));
        if (!reportId || Number.isNaN(reportId)) {
          return;
        }
        if (!event.target.closest("a, button")) {
          window.location.href = `/admin/report.html?id=${reportId}`;
        }
        return;
      }
      const card = event.target.closest("[data-report-id]");
      if (!card) {
        return;
      }
      const reportId = Number(card.getAttribute("data-report-id"));
      if (!reportId || Number.isNaN(reportId)) {
        return;
      }
      window.location.href = `/report.html?id=${reportId}`;
    });
  }
  loadProfile();
}

init();
