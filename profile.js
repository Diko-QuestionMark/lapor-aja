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

let currentSession = null;
let currentUser = null;
let logoutConfirmModal = null;

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
  const box = document.getElementById("profileAlert");
  box.textContent = message;
  box.className = `alert py-2 mb-3 alert-${type}`;
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

function renderProfileInfo(user, session) {
  const el = document.getElementById("profileInfo");
  const loginAt = session.loginAt
    ? new Date(session.loginAt).toLocaleString("id-ID")
    : "-";
  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleString("id-ID")
    : "-";
  el.innerHTML = `
    <div class="small"><strong>Email:</strong> ${escapeHtml(user.email || "-")}</div>
    <div class="small"><strong>Bergabung:</strong> ${createdAt}</div>
    <div class="small"><strong>Login terakhir:</strong> ${loginAt}</div>
  `;
}

function renderAvatar(user) {
  const avatar = document.getElementById("profileAvatar");
  avatar.src = user.profile_image_url || DEFAULT_AVATAR_URL;
  avatar.onerror = function () {
    avatar.src = DEFAULT_AVATAR_URL;
  };
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

function renderStats(myReports) {
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

  const stats = [
    { label: "Total Laporan", value: total },
    { label: "Menunggu", value: waiting },
    { label: "Selesai", value: done },
    { label: "Total Dukungan", value: support },
  ];

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

function renderMyReports(myReports) {
  const root = document.getElementById("profileReports");
  if (myReports.length === 0) {
    root.innerHTML =
      '<p class="text-secondary mb-0">Kamu belum mengirim laporan apa pun.</p>';
    return;
  }

  root.innerHTML = myReports
    .slice(0, 8)
    .map(function (report) {
      const status = getStatusMeta(report.status);
      return `
        <article class="border rounded p-3 mb-2">
          <div class="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(report.title || "Tanpa Judul")}</div>
              <div class="small mb-1">${escapeHtml(report.desc || "Tanpa deskripsi")}</div>
              <div class="small text-secondary">${report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "-"}</div>
            </div>
            <span class="badge status-badge ${status.className}">${status.label}</span>
          </div>
          <div class="small text-secondary mt-2">Dukungan: ${Number(report.upvotes || 0)}</div>
          <a class="small" href="/report.html?id=${Number(report.id)}">Lihat detail</a>
        </article>
      `;
    })
    .join("");
}

async function loadReportsForUser(user) {
  const data = await apiFetch("/reports");
  const myReports = data.filter(function (item) {
    return Number(item.reporter_user_id || 0) === Number(user.id);
  });
  renderStats(myReports);
  renderMyReports(myReports);
}

async function loadProfile() {
  currentSession = ensureLoggedIn();
  if (!currentSession) {
    return;
  }

  try {
    const data = await apiFetch("/me");
    currentUser = data.user;
    renderAvatar(currentUser);
    renderProfileInfo(currentUser, currentSession);
    document.getElementById("profileName").value = currentUser.name || "";

    const nextSession = {
      ...currentSession,
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      profile_image_url: currentUser.profile_image_url || "",
    };
    writeSession(nextSession);
    currentSession = nextSession;

    await loadReportsForUser(currentUser);
  } catch (error) {
    showAlert(error.message || "Gagal memuat profil.", "danger");
    document.getElementById("profileInfo").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat profil.</p>';
    document.getElementById("profileReports").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat laporan profil.</p>';
    document.getElementById("profileStats").innerHTML = "";
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
      profile_image_url: currentUser.profile_image_url || "",
    };
    writeSession(nextSession);
    currentSession = nextSession;

    renderAvatar(currentUser);
    renderProfileInfo(currentUser, currentSession);
    document.getElementById("profilePhoto").value = "";
    showAlert("Profil berhasil diperbarui.", "success");
    await loadReportsForUser(currentUser);
  } catch (error) {
    showAlert(error.message || "Gagal menyimpan profil.", "danger");
  } finally {
    setSaveLoading(false);
  }
}

function init() {
  const form = document.getElementById("profileForm");
  if (form) {
    form.addEventListener("submit", handleSaveProfile);
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
  loadProfile();
}

init();
