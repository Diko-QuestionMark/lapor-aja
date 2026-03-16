const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const CLOUDINARY_CLOUD_NAME = "dpipyaboq";
const CLOUDINARY_UPLOAD_PRESET = "laporaja_unsigned";
const MAX_FILE_SIZE_MB = 2;
const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";
const SESSION_KEY = "laporaja_session_v1";
const AUTH_NOTICE_KEY = "laporaja_auth_notice_v1";
const UPVOTE_STORAGE_KEY = "laporaja_upvoted_ids";
const AGENCY_OPTIONS = new Set([
  "Umum",
  "Dinas PU",
  "Dinas Perhubungan",
  "Dinas Kebersihan",
  "Dinas Lingkungan Hidup",
  "PDAM",
  "PLN",
  "Satpol PP",
]);

let reports = [];
let latitude = null;
let longitude = null;
let isLocating = false;
let isSubmitting = false;
let toastInstance = null;
let reportModal = null;
let imageInspectModal = null;

function getUpvotedIds() {
  try {
    const raw = localStorage.getItem(UPVOTE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function hasUpvoted(reportId) {
  return getUpvotedIds().includes(reportId);
}

function markUpvoted(reportId) {
  const ids = getUpvotedIds();
  if (!ids.includes(reportId)) {
    ids.push(reportId);
    localStorage.setItem(UPVOTE_STORAGE_KEY, JSON.stringify(ids));
  }
}

function unmarkUpvoted(reportId) {
  const ids = getUpvotedIds().filter(function (id) {
    return id !== reportId;
  });
  localStorage.setItem(UPVOTE_STORAGE_KEY, JSON.stringify(ids));
}

async function voteReport(id, action) {
  const response = await fetch(API_BASE + "/reports", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, action }),
  });
  if (!response.ok) {
    throw new Error("Gagal memperbarui dukungan.");
  }
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function renderAuthNav() {
  const actionBtn = document.getElementById("authActionBtn");
  const avatar = document.getElementById("authUserAvatar");
  const actionText = document.getElementById("authActionText");
  if (!actionBtn || !actionText || !avatar) {
    return;
  }

  const session = readSession();
  if (!session || !session.email || !session.token) {
    actionBtn.href = "/login.html";
    actionText.textContent = "Login";
    avatar.classList.add("d-none");
    avatar.removeAttribute("src");
    return;
  }

  actionText.textContent = `Halo, ${session.name || session.email}`;
  actionBtn.href = "/profile.html";
  avatar.src = session.profile_image_url || DEFAULT_AVATAR_URL;
  avatar.classList.remove("d-none");
  avatar.onerror = function () {
    avatar.src = DEFAULT_AVATAR_URL;
  };
}

function redirectToLoginWithNotice(message) {
  if (message) {
    localStorage.setItem(AUTH_NOTICE_KEY, message);
  }
  window.location.href = "/login.html";
}

function requireSessionForReport() {
  const session = readSession();
  if (session && session.email && session.token) {
    return session;
  }
  window.location.href = "/login.html";
  return null;
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
  const label = String(status || "Menunggu").trim();
  const normalized = label.toLowerCase();
  if (normalized === "diproses") {
    return { label: "Diproses", className: "status-diproses" };
  }
  if (normalized === "selesai") {
    return { label: "Selesai", className: "status-selesai" };
  }
  return { label: "Menunggu", className: "status-menunggu" };
}

function showToast(message, type) {
  const toastEl = document.getElementById("appToast");
  const toastBody = document.getElementById("appToastBody");
  toastBody.textContent = message;
  toastEl.className = "toast align-items-center border-0";
  toastEl.classList.add(type === "error" ? "text-bg-danger" : "text-bg-success");
  toastInstance.show();
}

function validatePhoto(file) {
  if (!file) {
    return "Foto wajib dipilih dulu.";
  }
  if (!file.type.startsWith("image/")) {
    return "File harus berupa gambar.";
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `Ukuran foto maksimal ${MAX_FILE_SIZE_MB}MB.`;
  }
  return "";
}

function showPhotoError(message) {
  const errorEl = document.getElementById("photoError");
  if (!message) {
    errorEl.classList.add("d-none");
    errorEl.textContent = "";
    return;
  }
  errorEl.classList.remove("d-none");
  errorEl.textContent = message;
}

function validateTitle(value) {
  const title = String(value || "").trim();
  if (title.length < 3) {
    return "Judul minimal 3 karakter.";
  }
  if (title.length > 100) {
    return "Judul maksimal 100 karakter.";
  }
  return "";
}

function showTitleError(message) {
  const errorEl = document.getElementById("titleError");
  if (!errorEl) {
    return;
  }
  if (!message) {
    errorEl.classList.add("d-none");
    errorEl.textContent = "";
    return;
  }
  errorEl.classList.remove("d-none");
  errorEl.textContent = message;
}

function updateSubmitState() {
  const submitBtn = document.getElementById("submitBtn");
  if (!submitBtn) {
    return;
  }

  const title = document.getElementById("title").value;
  const agencyValue = (document.getElementById("agency") || { value: "Umum" }).value;
  const file = document.getElementById("photo").files[0];
  const useLocation = document.getElementById("useLocation").checked;
  const titleError = validateTitle(title);
  const photoError = validatePhoto(file);
  const locationReady = latitude !== null && longitude !== null;
  const locationBlocked = useLocation && (!locationReady || isLocating);

  submitBtn.disabled =
    Boolean(photoError) ||
    Boolean(titleError) ||
    !AGENCY_OPTIONS.has(String(agencyValue || "").trim()) ||
    isSubmitting ||
    locationBlocked;
}

function updatePhotoPreview() {
  const file = document.getElementById("photo").files[0];
  const previewWrap = document.getElementById("photoPreviewWrap");
  const previewImg = document.getElementById("photoPreview");

  const validationMessage = validatePhoto(file);
  showPhotoError(validationMessage);
  updateSubmitState();

  if (!file || validationMessage) {
    previewWrap.classList.add("d-none");
    previewImg.removeAttribute("src");
    return;
  }

  previewImg.src = URL.createObjectURL(file);
  previewWrap.classList.remove("d-none");
}

function updateTitleState() {
  const title = document.getElementById("title").value;
  const titleError = validateTitle(title);
  showTitleError(titleError);
  updateSubmitState();
}

function getLocation() {
  const locText = document.getElementById("locText");
  isLocating = true;
  latitude = null;
  longitude = null;
  updateSubmitState();

  if (!navigator.geolocation) {
    isLocating = false;
    locText.className = "small text-danger mb-0";
    locText.innerText = "Browser tidak mendukung lokasi";
    updateSubmitState();
    return;
  }

  locText.className = "small text-primary mb-0 d-flex align-items-center";
  locText.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Mengambil lokasi...';

  navigator.geolocation.getCurrentPosition(
    function (position) {
      isLocating = false;
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      locText.className = "small text-success mb-0";
      locText.innerText =
        "Lokasi: " + latitude.toFixed(6) + ", " + longitude.toFixed(6);
      updateSubmitState();
    },
    function () {
      isLocating = false;
      latitude = null;
      longitude = null;
      locText.className = "small text-danger mb-0";
      locText.innerText = "Gagal mendapatkan lokasi";
      updateSubmitState();
    },
  );
}

function toggleLocation(checkbox) {
  const locText = document.getElementById("locText");
  if (checkbox.checked) {
    getLocation();
    return;
  }

  latitude = null;
  longitude = null;
  isLocating = false;
  locText.className = "small text-secondary mb-0";
  locText.innerText = "Lokasi dimatikan";
  updateSubmitState();
}

function renderLoadingSkeleton() {
  const list = document.getElementById("reportList");
  document.getElementById("reportCount").textContent = "...";
  list.innerHTML = `
    <div class="report-list">
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
      <div class="skeleton-item"></div>
    </div>
  `;
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error("Upload foto ke Cloudinary gagal");
  }

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("URL foto dari Cloudinary tidak ditemukan");
  }

  return data.secure_url;
}

async function loadReports() {
  renderLoadingSkeleton();

  try {
    const response = await fetch(API_BASE + "/reports");
    if (!response.ok) {
      throw new Error("Gagal mengambil data laporan");
    }

    reports = await response.json();
    renderReports();
  } catch (error) {
    document.getElementById("reportList").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa terhubung ke backend/database.</p>';
    console.error(error);
  }
}

function resetForm() {
  document.getElementById("title").value = "";
  document.getElementById("desc").value = "";
  document.getElementById("agency").value = "Umum";
  document.getElementById("photo").value = "";
  document.getElementById("useLocation").checked = false;
  showTitleError("");
  showPhotoError("");
  toggleLocation(document.getElementById("useLocation"));
  updatePhotoPreview();
}

async function submitReport() {
  if (isSubmitting) {
    return;
  }
  const session = requireSessionForReport();
  if (!session) {
    return;
  }

  const title = document.getElementById("title").value.trim();
  const desc = document.getElementById("desc").value.trim();
  const agency = String(document.getElementById("agency").value || "Umum").trim();
  const file = document.getElementById("photo").files[0];
  const useLocation = document.getElementById("useLocation").checked;
  const hasLocation = latitude !== null && longitude !== null;
  const submitBtn = document.getElementById("submitBtn");
  const titleValidationMessage = validateTitle(title);
  const validationMessage = validatePhoto(file);

  if (titleValidationMessage) {
    showTitleError(titleValidationMessage);
    showToast(titleValidationMessage, "error");
    return;
  }
  if (validationMessage) {
    showPhotoError(validationMessage);
    showToast(validationMessage, "error");
    return;
  }
  if (!AGENCY_OPTIONS.has(agency)) {
    showToast("Pilih tujuan instansi yang valid.", "error");
    return;
  }
  if (useLocation && !hasLocation) {
    showToast("Lokasi belum tersedia. Tunggu lokasi didapat atau matikan centang lokasi.", "error");
    return;
  }

  try {
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Mengupload foto...';

    const imageUrl = await uploadToCloudinary(file);

    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Menyimpan laporan...';

    const payload = {
      title: title,
      desc: desc,
      agency: agency,
      lat: latitude,
      lng: longitude,
      image_url: imageUrl,
    };

    const response = await fetch(API_BASE + "/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      localStorage.removeItem(SESSION_KEY);
      redirectToLoginWithNotice("Sesi kamu sudah habis. Silakan login lagi.");
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal menyimpan laporan");
    }

    resetForm();
    reportModal.hide();
    showToast("Laporan berhasil dikirim.", "success");
    await loadReports();
  } catch (error) {
    showToast("Laporan gagal dikirim. Cek backend/database.", "error");
    console.error(error);
  } finally {
    isSubmitting = false;
    updateSubmitState();
    submitBtn.textContent = "Kirim Laporan";
  }
}

function getSortedReports() {
  const mode = document.getElementById("sortFilter").value;
  const timeMode = document.getElementById("timeFilter").value;
  const keyword = String(
    (document.getElementById("searchInput") || { value: "" }).value || "",
  )
    .trim()
    .toLowerCase();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeek = startOfDay - dayOfWeek * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filtered = reports.filter(function (item) {
    const itemTime = new Date(item.created_at || 0).getTime();
    if (timeMode === "today" && itemTime < startOfDay) {
      return false;
    }
    if (timeMode === "week" && itemTime < startOfWeek) {
      return false;
    }
    if (timeMode === "month" && itemTime < startOfMonth) {
      return false;
    }

    if (!keyword) {
      return true;
    }
    const parts = [
      item.title,
      item.desc,
      item.reporter_name,
      item.reporter_email,
      item.status,
      item.agency,
      item.lat !== null && item.lat !== undefined ? `${item.lat}, ${item.lng}` : "",
    ];
    const haystack = parts
      .map(function (value) {
        return String(value || "").toLowerCase();
      })
      .join(" ");
    return haystack.includes(keyword);
  });

  const sorted = filtered.slice();
  sorted.sort(function (a, b) {
    const aStatus = String(a.status || "Menunggu").toLowerCase();
    const bStatus = String(b.status || "Menunggu").toLowerCase();
    const aUpvotes = Number(a.upvotes || 0);
    const bUpvotes = Number(b.upvotes || 0);
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    if (mode === "oldest") {
      return aDate - bDate;
    }
    if (mode === "upvotes") {
      return bUpvotes - aUpvotes || bDate - aDate;
    }
    if (mode === "status_waiting") {
      const aPriority = aStatus === "menunggu" ? 0 : 1;
      const bPriority = bStatus === "menunggu" ? 0 : 1;
      return aPriority - bPriority || bDate - aDate;
    }
    if (mode === "status_done") {
      const aPriority = aStatus === "selesai" ? 0 : 1;
      const bPriority = bStatus === "selesai" ? 0 : 1;
      return aPriority - bPriority || bDate - aDate;
    }
    return bDate - aDate;
  });
  return sorted;
}

function renderReports() {
  const list = document.getElementById("reportList");
  const countBadge = document.getElementById("reportCount");
  const sortedReports = getSortedReports();
  const keyword = String(
    (document.getElementById("searchInput") || { value: "" }).value || "",
  ).trim();
  countBadge.textContent = String(sortedReports.length);

  if (sortedReports.length === 0) {
    list.innerHTML = `
      <div class="report-empty">
        ${
          keyword
            ? `Tidak ada hasil untuk <strong>${escapeHtml(keyword)}</strong>.`
            : 'Belum ada laporan. Tekan tombol <strong>Buat Laporan</strong> untuk menambah data.'
        }
      </div>
    `;
    return;
  }

  list.innerHTML = '<div class="report-list" id="reportGrid"></div>';
  const grid = document.getElementById("reportGrid");

  sortedReports.forEach(function (r) {
    const reportId = Number(r.id);
    const reporterUserId = Number(r.reporter_user_id || 0);
    const hasReporterProfile = reporterUserId > 0;
    const hasLocation = r.lat !== null && r.lat !== undefined;
    const isUpvoted = hasUpvoted(reportId);
    const statusMeta = getStatusMeta(r.status);
    const reporterName = String(r.reporter_name || "Anonim");
    const reporterAvatar = String(
      r.reporter_profile_image_url || DEFAULT_AVATAR_URL,
    );
    const titleText = String(r.title || "Laporan Warga");
    const agencyText = String(r.agency || "Umum");
    const imageBlock =
      r.image_url && String(r.image_url).trim() !== ""
        ? `<img
            src="${escapeHtml(r.image_url)}"
            class="img-fluid report-cover"
            alt="Foto laporan"
          />`
        : '<div class="report-cover report-cover-empty">Foto tidak tersedia</div>';
    const authorBlock = hasReporterProfile
      ? `
          <a
            href="/user.html?id=${reporterUserId}"
            class="report-author report-author-link"
            data-profile-link="1"
            aria-label="Lihat profil pelapor ${escapeHtml(reporterName)}"
          >
            <img
              src="${escapeHtml(reporterAvatar)}"
              class="report-author-avatar"
              alt="Avatar pelapor"
              onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
            />
            <div>
              <p class="mb-0 fw-semibold">${escapeHtml(reporterName)}</p>
              <small class="report-meta"><i class="bi bi-clock text-primary me-1"></i>${
                r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : ""
              }</small>
            </div>
          </a>
        `
      : `
          <div class="report-author">
            <img
              src="${escapeHtml(reporterAvatar)}"
              class="report-author-avatar"
              alt="Avatar pelapor"
              onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
            />
            <div>
              <p class="mb-0 fw-semibold">${escapeHtml(reporterName)}</p>
              <small class="report-meta"><i class="bi bi-clock text-primary me-1"></i>${
                r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : ""
              }</small>
            </div>
          </div>
        `;
    const html = `
      <article class="report-card report-card-clickable" data-report-id="${reportId}">
        <div class="report-feed-head">
          ${authorBlock}
          <span class="badge status-badge ${statusMeta.className}">${statusMeta.label}</span>
        </div>
        ${imageBlock}
        <div class="report-feed-body">
          <h4 class="report-title text-truncate-2">${escapeHtml(titleText)}</h4>
          <div class="report-meta-row">
            <span class="meta-main">
              <span class="meta-item"><i class="bi bi-building"></i>${escapeHtml(agencyText)}</span>
              <span class="meta-sep" aria-hidden="true">&bull;</span>
              ${
                hasLocation
                  ? `<a
                      href="https://www.google.com/maps?q=${Number(r.lat)},${Number(r.lng)}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="meta-item meta-action-link"
                      data-location-link="1"
                    ><i class="bi bi-geo-alt"></i>${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}</a>`
                  : `<span class="meta-item"><i class="bi bi-geo-alt"></i>Lokasi tidak tersedia</span>`
              }
            </span>
            <button
              type="button"
              class="meta-like meta-action-like ${isUpvoted ? "is-active" : ""}"
              data-like-btn="1"
              data-report-id="${reportId}"
              aria-label="${isUpvoted ? "Tarik dukungan" : "Dukung laporan"}"
            >
              <i class="bi ${isUpvoted ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}"></i>${Number(
                r.upvotes || 0,
              )}
            </button>
          </div>
        </div>
      </article>
    `;
    grid.innerHTML += html;
  });
}

function openImageInspect(src, title) {
  const preview = document.getElementById("imageInspectPreview");
  const modalTitle = document.getElementById("imageInspectTitle");
  preview.src = src;
  modalTitle.textContent = title || "Detail Foto Laporan";
  imageInspectModal.show();
}

function initUi() {
  toastInstance = new bootstrap.Toast(document.getElementById("appToast"), {
    delay: 2600,
  });
  reportModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("reportModal"),
  );
  imageInspectModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("imageInspectModal"),
  );

  document.getElementById("photo").addEventListener("change", updatePhotoPreview);
  document.getElementById("title").addEventListener("input", updateTitleState);
  document.getElementById("agency").addEventListener("change", updateSubmitState);
  const createReportBtn = document.getElementById("createReportBtn");
  if (createReportBtn) {
    createReportBtn.addEventListener("click", function (event) {
      const session = readSession();
      if (!session || !session.email || !session.token) {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = "/login.html";
      }
    });
  }
  document.getElementById("sortFilter").addEventListener("change", renderReports);
  const timeFilter = document.getElementById("timeFilter");
  if (timeFilter) {
    timeFilter.addEventListener("change", renderReports);
  }
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderReports);
  }
  document.getElementById("reportList").addEventListener("click", function (event) {
    const likeBtn = event.target.closest("[data-like-btn='1']");
    if (likeBtn) {
      event.preventDefault();
      event.stopPropagation();
      const reportId = Number(likeBtn.getAttribute("data-report-id"));
      if (!reportId || Number.isNaN(reportId)) {
        return;
      }
      const isLiked = hasUpvoted(reportId);
      likeBtn.disabled = true;
      likeBtn.classList.add("is-loading");

      voteReport(reportId, isLiked ? "downvote" : "upvote")
        .then(function () {
          if (isLiked) {
            unmarkUpvoted(reportId);
          } else {
            markUpvoted(reportId);
          }
          const target = reports.find(function (item) {
            return Number(item.id) === reportId;
          });
          if (target) {
            const curr = Number(target.upvotes || 0);
            target.upvotes = isLiked ? Math.max(curr - 1, 0) : curr + 1;
          }
          renderReports();
        })
        .catch(function () {
          showToast("Gagal memperbarui dukungan.", "error");
        })
        .finally(function () {
          likeBtn.disabled = false;
          likeBtn.classList.remove("is-loading");
        });
      return;
    }

    const locationLink = event.target.closest("[data-location-link='1']");
    if (locationLink) {
      return;
    }

    const profileLink = event.target.closest("[data-profile-link='1']");
    if (profileLink) {
      return;
    }
    const reportCard = event.target.closest(".report-card-clickable");
    if (reportCard) {
      const reportId = Number(reportCard.getAttribute("data-report-id"));
      if (reportId) {
        window.location.href = `/report.html?id=${reportId}`;
      }
      return;
    }
  });
  document
    .getElementById("reportModal")
    .addEventListener("hidden.bs.modal", resetForm);
}

initUi();
document.addEventListener("navbar:ready", renderAuthNav);
renderAuthNav();
resetForm();
loadReports();
