const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const CLOUDINARY_CLOUD_NAME = "dpipyaboq";
const CLOUDINARY_UPLOAD_PRESET = "laporaja_unsigned";
const HARD_MAX_FILE_SIZE_MB = 15;
const COMPRESS_TRIGGER_MB = 2;
const COMPRESS_TARGET_MB = 1.8;
const COMPRESS_MAX_DIMENSION = 1600;
const MAX_PHOTO_COUNT = 5;
const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";
const SESSION_KEY = "laporaja_session_v1";
const AUTH_NOTICE_KEY = "laporaja_auth_notice_v1";
const UPVOTE_STORAGE_KEY = "laporaja_upvoted_ids";
const NOTIFICATION_SEEN_PREFIX = "laporaja_report_notification_seen_v1";
const NOTIFICATION_COUNT_KEY = "laporaja_notification_unread_v1";
const AGENCY_OPTIONS = new Set([
  "Umum",
  "Dinas PU",
  "Dinas Perhubungan",
  "Dinas Kebersihan",
  "Dinas Lingkungan Hidup",
  "PDAM",
  "PLN",
  "Makan Bergizi Gratis (MBG)",
  "Satpol PP",
]);

const AGENCY_ABBREV = {
  "Dinas PU": "PU",
  "Dinas Perhubungan": "Dishub",
  "Dinas Kebersihan": "DK",
  "Dinas Lingkungan Hidup": "DLH",
  "Makan Bergizi Gratis (MBG)": "MBG",
  "Satpol PP": "Satpol PP",
  PDAM: "PDAM",
  PLN: "PLN",
  Umum: "Umum",
};

function getAgencyShortLabel(value) {
  const key = String(value || "Umum");
  return AGENCY_ABBREV[key] || key;
}

let reports = [];
let latitude = null;
let longitude = null;
let isLocating = false;
let isSubmitting = false;
let toastInstance = null;
let reportModal = null;
let imageInspectModal = null;
let selectedPhotos = [];

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

function getNotificationSeenAt(userId) {
  const key = `${NOTIFICATION_SEEN_PREFIX}_${Number(userId || 0)}`;
  const raw = localStorage.getItem(key);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function updateNotificationBadge(count) {
  const badge = document.getElementById("navNotifBadge");
  if (!badge) {
    return;
  }
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount <= 0) {
    badge.classList.add("d-none");
    return;
  }
  badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
  badge.classList.remove("d-none");
}

function updateUnreadNotifications(reportsData) {
  const session = readSession();
  if (!session || !session.id) {
    updateNotificationBadge(0);
    return;
  }
  const seenAt = getNotificationSeenAt(session.id);
  const unreadCount = (reportsData || []).filter(function (item) {
    const ownerId = Number(item.reporter_user_id || 0);
    if (ownerId !== Number(session.id)) {
      return false;
    }
    const updatedAt = new Date(item.admin_updated_at || 0).getTime();
    return updatedAt && updatedAt > seenAt;
  }).length;
  localStorage.setItem(NOTIFICATION_COUNT_KEY, String(unreadCount));
  updateNotificationBadge(unreadCount);
}

function updateCreateReportAccess(session) {
  const createReportBtn = document.getElementById("createReportBtn");
  if (!createReportBtn) {
    return;
  }
  const role = String((session && session.role) || "").toLowerCase();
  const isAdmin = role === "admin";
  createReportBtn.classList.toggle("d-none", isAdmin);
  createReportBtn.disabled = isAdmin;
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
    updateCreateReportAccess(null);
    updateNotificationBadge(0);
    actionBtn.href = "/login.html";
    actionText.textContent = "Login";
    avatar.classList.add("d-none");
    avatar.removeAttribute("src");
    return;
  }

  updateCreateReportAccess(session);
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

function formatTimeAgo(value) {
  if (!value) {
    return "";
  }
  let raw = value;
  const now = Date.now();
  if (typeof raw === "string") {
    const hasTz = /[zZ]$/.test(raw) || /[+-]\d{2}:\d{2}$/.test(raw);
    if (!hasTz) {
      const localRaw = raw.replace(" ", "T");
      const utcRaw = `${localRaw}Z`;
      const localTs = new Date(localRaw).getTime();
      const utcTs = new Date(utcRaw).getTime();
      const localDiff = Math.abs(now - localTs);
      const utcDiff = Math.abs(now - utcTs);
      const bestTs = utcDiff < localDiff ? utcTs : localTs;
      raw = new Date(bestTs).toISOString();
    } else {
      raw = raw.replace(" ", "T");
    }
  }
  const ts = new Date(raw).getTime();
  if (!ts) {
    return "";
  }
  const diffMs = Date.now() - ts;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) {
    return diffSec <= 5 ? "baru saja" : `${diffSec} detik yang lalu`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin} menit yang lalu`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour} jam yang lalu`;
  }
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) {
    return `${diffDay} hari yang lalu`;
  }
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) {
    return `${diffMonth} bulan yang lalu`;
  }
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} tahun yang lalu`;
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

function getSelectedPhotos() {
  return selectedPhotos.slice();
}

function validatePhotos(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return "Minimal pilih 1 foto.";
  }
  if (files.length > MAX_PHOTO_COUNT) {
    return `Maksimal ${MAX_PHOTO_COUNT} foto per laporan.`;
  }

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return "Semua file harus berupa gambar.";
    }
    if (file.size > HARD_MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `Ada foto yang terlalu besar. Maksimal ${HARD_MAX_FILE_SIZE_MB}MB per foto.`;
    }
  }
  return "";
}

function addSelectedPhotos(files) {
  if (!files || files.length === 0) {
    return;
  }

  let hasError = "";
  for (const file of files) {
    if (selectedPhotos.length >= MAX_PHOTO_COUNT) {
      hasError = `Maksimal ${MAX_PHOTO_COUNT} foto per laporan.`;
      break;
    }
    if (!file.type.startsWith("image/")) {
      hasError = "Semua file harus berupa gambar.";
      continue;
    }
    if (file.size > HARD_MAX_FILE_SIZE_MB * 1024 * 1024) {
      hasError = `Ada foto yang terlalu besar. Maksimal ${HARD_MAX_FILE_SIZE_MB}MB per foto.`;
      continue;
    }
    selectedPhotos.push(file);
  }

  if (hasError) {
    showPhotoError(hasError);
  } else {
    showPhotoError("");
  }
}

async function compressImageIfNeeded(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return file;
  }

  if (file.size <= COMPRESS_TRIGGER_MB * 1024 * 1024) {
    return file;
  }

  const dataUrl = await new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(new Error("Gagal membaca file foto."));
    };
    reader.readAsDataURL(file);
  });

  const image = await new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Gagal memuat foto untuk kompresi."));
    };
    img.src = dataUrl;
  });

  let width = image.width;
  let height = image.height;
  const maxSide = Math.max(width, height);
  if (maxSide > COMPRESS_MAX_DIMENSION) {
    const scale = COMPRESS_MAX_DIMENSION / maxSide;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return file;
  }
  ctx.drawImage(image, 0, 0, width, height);

  const targetBytes = COMPRESS_TARGET_MB * 1024 * 1024;
  let quality = 0.85;
  let bestBlob = null;

  for (let i = 0; i < 6; i += 1) {
    // Iterasi kualitas agar ukuran mendekati target tanpa terlalu menurunkan detail.
    const blob = await new Promise(function (resolve) {
      canvas.toBlob(
        function (result) {
          resolve(result);
        },
        "image/jpeg",
        quality,
      );
    });

    if (!blob) {
      break;
    }
    bestBlob = blob;
    if (blob.size <= targetBytes) {
      break;
    }
    quality -= 0.12;
    if (quality < 0.35) {
      quality = 0.35;
    }
  }

  if (!bestBlob || bestBlob.size >= file.size) {
    return file;
  }

  const compressedName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
  return new File([bestBlob], compressedName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
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
  const files = getSelectedPhotos();
  const useLocation = document.getElementById("useLocation").checked;
  const titleError = validateTitle(title);
  const photoError = validatePhotos(files);
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
  const files = getSelectedPhotos();
  const previewWrap = document.getElementById("photoPreviewWrap");
  const previewGrid = document.getElementById("photoPreviewGrid");
  const previewCount = document.getElementById("photoPreviewCount");

  const validationMessage = validatePhotos(files);
  showPhotoError(validationMessage);
  updateSubmitState();

  if (previewGrid) {
    const oldImages = previewGrid.querySelectorAll("img[data-preview-url='1']");
    oldImages.forEach(function (imgEl) {
      if (imgEl.src) {
        URL.revokeObjectURL(imgEl.src);
      }
    });
    previewGrid.innerHTML = "";
  }

  if (files.length === 0 || validationMessage) {
    previewWrap.classList.add("d-none");
    if (previewCount) {
      previewCount.textContent = "";
    }
    return;
  }

  if (previewGrid) {
    files.forEach(function (file, index) {
      const item = document.createElement("figure");
      item.className = "photo-preview-item";

      const img = document.createElement("img");
      img.alt = `Preview foto ${index + 1}`;
      img.src = URL.createObjectURL(file);
      img.setAttribute("data-preview-url", "1");
      item.appendChild(img);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "photo-remove-btn";
      removeBtn.setAttribute("data-remove-index", String(index));
      removeBtn.setAttribute("aria-label", `Hapus foto ${index + 1}`);
      removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
      item.appendChild(removeBtn);

      previewGrid.appendChild(item);
    });
  }

  previewWrap.classList.remove("d-none");
  if (previewCount) {
    previewCount.textContent = `${files.length} foto dipilih`;
  }
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
    updateUnreadNotifications(reports);
  } catch (error) {
    document.getElementById("reportList").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa terhubung ke backend/database.</p>';
    console.error(error);
    updateNotificationBadge(0);
  }
}

function resetForm() {
  document.getElementById("title").value = "";
  document.getElementById("desc").value = "";
  document.getElementById("agency").value = "Umum";
  document.getElementById("photo").value = "";
  selectedPhotos = [];
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
  const files = getSelectedPhotos();
  const useLocation = document.getElementById("useLocation").checked;
  const hasLocation = latitude !== null && longitude !== null;
  const submitBtn = document.getElementById("submitBtn");
  const titleValidationMessage = validateTitle(title);
  const validationMessage = validatePhotos(files);

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
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memproses foto...';
    const imageUrls = [];
    for (let i = 0; i < files.length; i += 1) {
      submitBtn.innerHTML =
        `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memproses foto ${i + 1}/${files.length}...`;
      const processedFile = await compressImageIfNeeded(files[i]);
      submitBtn.innerHTML =
        `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Mengupload foto ${i + 1}/${files.length}...`;
      const imageUrl = await uploadToCloudinary(processedFile);
      imageUrls.push(imageUrl);
    }

    submitBtn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Menyimpan laporan...';

    const payload = {
      title: title,
      desc: desc,
      agency: agency,
      lat: latitude,
      lng: longitude,
      image_url: imageUrls[0] || "",
      image_urls: imageUrls,
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
    showToast("Laporan berhasil dikirim. Terima kasih sudah peduli!", "success");
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
  const agencyMode = String(
    (document.getElementById("agencyFilterUser") || { value: "all" }).value || "all",
  );
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
    const itemAgency = String(item.agency || "Umum");
    if (agencyMode !== "all" && itemAgency !== agencyMode) {
      return false;
    }

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
  function smartScore(item) {
    const upvotes = Number(item.upvotes || 0);
    const createdAt = new Date(item.created_at || 0).getTime();
    const ageHours = Math.max(1, (Date.now() - createdAt) / (1000 * 60 * 60));
    const recencyBonus = Math.max(0, 24 - ageHours); // max bonus for 24 jam terakhir
    const noise = Math.random() * 0.75; // random kecil setiap reload
    return upvotes * 5 + recencyBonus + noise;
  }

  sorted.sort(function (a, b) {
    const aStatus = String(a.status || "Menunggu").toLowerCase();
    const bStatus = String(b.status || "Menunggu").toLowerCase();
    const aUpvotes = Number(a.upvotes || 0);
    const bUpvotes = Number(b.upvotes || 0);
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    if (mode === "smart") {
      return smartScore(b) - smartScore(a) || bDate - aDate;
    }
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

function updateSectionTitle() {
  const titleEl = document.getElementById("reportSectionTitle");
  if (!titleEl) {
    return;
  }
  const agencyMode = String(
    (document.getElementById("agencyFilterUser") || { value: "all" }).value || "all",
  );
  const timeMode = String(
    (document.getElementById("timeFilter") || { value: "all" }).value || "all",
  );

  const timeLabels = {
    all: "Semua Waktu",
    today: "Hari Ini",
    week: "Minggu Ini",
    month: "Bulan Ini",
  };
  const timeLabel = timeLabels[timeMode] || "Semua Waktu";

  if (agencyMode === "all") {
    titleEl.textContent = `Laporan Warga • ${timeLabel}`;
    return;
  }
  titleEl.textContent = `Laporan ke Instansi: ${agencyMode} • ${timeLabel}`;
}

function renderReports() {
  updateSectionTitle();
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
    const agencyShort = getAgencyShortLabel(agencyText);
    const imageCandidates = Array.isArray(r.image_urls) ? r.image_urls : [];
    const coverImage = String(imageCandidates[0] || r.image_url || "").trim();
    const imageBlock =
      coverImage !== ""
        ? `<img
            src="${escapeHtml(coverImage)}"
            class="img-fluid report-cover img-lazy"
            alt="Foto laporan"
            loading="lazy"
            decoding="async"
            onload="this.classList.add('is-loaded')"
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
              <small class="report-meta">${
                r.created_at ? formatTimeAgo(r.created_at) : ""
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
              <small class="report-meta">${
                r.created_at ? formatTimeAgo(r.created_at) : ""
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
          <h4 class="report-title text-truncate-1">${escapeHtml(titleText)}</h4>
          <div class="report-meta-row">
            <span class="meta-main">
              <button
                type="button"
                class="meta-item meta-action-link meta-action-btn"
                data-agency-filter="${escapeHtml(agencyText)}"
                aria-label="Filter laporan instansi ${escapeHtml(agencyText)}"
              ><i class="bi bi-building"></i>${escapeHtml(agencyShort)}</button>
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

  const photoInput = document.getElementById("photo");
  if (photoInput) {
    photoInput.addEventListener("change", function () {
      const files = Array.from(photoInput.files || []);
      addSelectedPhotos(files);
      photoInput.value = "";
      updatePhotoPreview();
    });
  }
  const previewGrid = document.getElementById("photoPreviewGrid");
  if (previewGrid) {
    previewGrid.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-remove-index]");
      if (!btn) {
        return;
      }
      const index = Number(btn.getAttribute("data-remove-index"));
      if (!Number.isNaN(index)) {
        selectedPhotos = selectedPhotos.filter(function (_, idx) {
          return idx !== index;
        });
        updatePhotoPreview();
      }
    });
  }
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
  const agencyFilter = document.getElementById("agencyFilterUser");
  if (agencyFilter) {
    agencyFilter.addEventListener("change", renderReports);
  }
  const resetFilterBtn = document.getElementById("resetFilterBtn");
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener("click", function () {
      const sortFilter = document.getElementById("sortFilter");
      const timeFilterInner = document.getElementById("timeFilter");
      const agencyFilterInner = document.getElementById("agencyFilterUser");
      if (sortFilter) {
        sortFilter.value = "smart";
      }
      if (timeFilterInner) {
        timeFilterInner.value = "all";
      }
      if (agencyFilterInner) {
        agencyFilterInner.value = "all";
      }
      renderReports();
    });
  }
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderReports);
  }
  document.getElementById("reportList").addEventListener("click", function (event) {
    const agencyBtn = event.target.closest("[data-agency-filter]");
    if (agencyBtn) {
      event.preventDefault();
      event.stopPropagation();
      const agencyValue = String(agencyBtn.getAttribute("data-agency-filter") || "").trim();
      const agencyFilterEl = document.getElementById("agencyFilterUser");
      if (agencyFilterEl && agencyValue) {
        agencyFilterEl.value = agencyValue;
        const filterPanel = document.getElementById("filterPanel");
        if (filterPanel && window.bootstrap && window.bootstrap.Collapse) {
          const collapse = window.bootstrap.Collapse.getOrCreateInstance(filterPanel, {
            toggle: false,
          });
          collapse.show();
        }
        renderReports();
      }
      return;
    }

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
          const nextLiked = !isLiked;
          const nextCount = target ? Number(target.upvotes || 0) : Number(likeBtn.textContent || 0);
          likeBtn.classList.toggle("is-active", nextLiked);
          likeBtn.setAttribute("aria-label", nextLiked ? "Tarik dukungan" : "Dukung laporan");
          likeBtn.innerHTML = `<i class="bi ${
            nextLiked ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"
          }"></i>${nextCount}`;
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
