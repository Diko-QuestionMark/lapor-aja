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

let reports = [];
let latitude = null;
let longitude = null;
let isLocating = false;
let isSubmitting = false;
let toastInstance = null;
let reportModal = null;
let imageInspectModal = null;

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

function updateSubmitState() {
  const submitBtn = document.getElementById("submitBtn");
  if (!submitBtn) {
    return;
  }

  const file = document.getElementById("photo").files[0];
  const useLocation = document.getElementById("useLocation").checked;
  const photoError = validatePhoto(file);
  const locationReady = latitude !== null && longitude !== null;
  const locationBlocked = useLocation && (!locationReady || isLocating);

  submitBtn.disabled = Boolean(photoError) || isSubmitting || locationBlocked;
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
  document.getElementById("desc").value = "";
  document.getElementById("photo").value = "";
  document.getElementById("useLocation").checked = false;
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

  const desc = document.getElementById("desc").value.trim();
  const file = document.getElementById("photo").files[0];
  const useLocation = document.getElementById("useLocation").checked;
  const hasLocation = latitude !== null && longitude !== null;
  const submitBtn = document.getElementById("submitBtn");
  const validationMessage = validatePhoto(file);

  if (validationMessage) {
    showPhotoError(validationMessage);
    showToast(validationMessage, "error");
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
      desc: desc,
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
      item.desc,
      item.reporter_name,
      item.reporter_email,
      item.status,
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
    const hasLocation = r.lat !== null && r.lat !== undefined;
    const statusMeta = getStatusMeta(r.status);
    const reporterName = String(r.reporter_name || "Anonim");
    const imageBlock =
      r.image_url && String(r.image_url).trim() !== ""
        ? `<img
            src="${escapeHtml(r.image_url)}"
            class="img-fluid rounded mb-2 inspect-image report-thumb"
            alt="Foto laporan"
            title="Klik untuk lihat detail"
            data-inspect-src="${escapeHtml(r.image_url)}"
            data-inspect-title="${escapeHtml(r.desc || "Detail Foto Laporan")}"
          />`
        : '<p class="small text-secondary mb-2">Foto tidak tersedia</p>';
    const html = `
      <article class="report-card report-card-clickable" data-report-id="${reportId}">
        ${imageBlock}
        <div>
          <p class="mb-1 report-desc text-truncate-2">${escapeHtml(r.desc || "Tidak ada deskripsi")}</p>
          <div class="report-meta-row mb-1">
            <span class="report-meta">Pelapor: ${escapeHtml(reporterName)}</span>
          </div>
          <div class="report-meta-row mb-1">
            <span class="badge status-badge ${statusMeta.className}">Status: ${statusMeta.label}</span>
            <span class="report-meta">${
              r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : ""
            }</span>
          </div>
          <div class="report-meta-row">
            <span class="badge text-bg-light border">Dukungan: ${Number(r.upvotes || 0)}</span>
          </div>
          <div class="report-meta-row mt-1">
            <span class="report-meta">${hasLocation
              ? Number(r.lat).toFixed(4) + ", " + Number(r.lng).toFixed(4)
              : "Lokasi tidak tersedia"}</span>
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
    const reportCard = event.target.closest(".report-card-clickable");
    if (reportCard) {
      const reportId = Number(reportCard.getAttribute("data-report-id"));
      if (reportId) {
        window.location.href = `/report.html?id=${reportId}`;
      }
      return;
    }

    const image = event.target.closest(".inspect-image");
    if (!image) {
      return;
    }
    openImageInspect(
      image.getAttribute("data-inspect-src"),
      image.getAttribute("data-inspect-title"),
    );
  });
  document
    .getElementById("reportModal")
    .addEventListener("hidden.bs.modal", resetForm);
}

initUi();
renderAuthNav();
resetForm();
loadReports();
