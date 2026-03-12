const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const CLOUDINARY_CLOUD_NAME = "dpipyaboq";
const CLOUDINARY_UPLOAD_PRESET = "laporaja_unsigned";
const MAX_FILE_SIZE_MB = 2;

let reports = [];
let latitude = null;
let longitude = null;
let isSubmitting = false;
let toastInstance = null;
let reportModal = null;

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

function updatePhotoPreview() {
  const file = document.getElementById("photo").files[0];
  const previewWrap = document.getElementById("photoPreviewWrap");
  const previewImg = document.getElementById("photoPreview");
  const submitBtn = document.getElementById("submitBtn");

  const validationMessage = validatePhoto(file);
  showPhotoError(validationMessage);
  submitBtn.disabled = Boolean(validationMessage) || isSubmitting;

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

  if (!navigator.geolocation) {
    locText.className = "small text-danger mb-0";
    locText.innerText = "Browser tidak mendukung lokasi";
    return;
  }

  locText.className = "small text-primary mb-0 d-flex align-items-center";
  locText.innerHTML =
    '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Mengambil lokasi...';

  navigator.geolocation.getCurrentPosition(
    function (position) {
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      locText.className = "small text-success mb-0";
      locText.innerText =
        "Lokasi: " + latitude.toFixed(6) + ", " + longitude.toFixed(6);
    },
    function () {
      latitude = null;
      longitude = null;
      locText.className = "small text-danger mb-0";
      locText.innerText = "Gagal mendapatkan lokasi";
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
  locText.className = "small text-secondary mb-0";
  locText.innerText = "Lokasi dimatikan";
}

function renderLoadingSkeleton() {
  const list = document.getElementById("reportList");
  list.innerHTML = `
    <div class="skeleton-item mb-3"></div>
    <div class="skeleton-item mb-3"></div>
    <div class="skeleton-item mb-0"></div>
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

  const desc = document.getElementById("desc").value.trim();
  const file = document.getElementById("photo").files[0];
  const submitBtn = document.getElementById("submitBtn");
  const validationMessage = validatePhoto(file);

  if (validationMessage) {
    showPhotoError(validationMessage);
    showToast(validationMessage, "error");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

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
    submitBtn.disabled = false;
    submitBtn.textContent = "Kirim Laporan";
  }
}

function getSortedReports() {
  const mode = document.getElementById("sortFilter").value;
  const sorted = reports.slice();
  sorted.sort(function (a, b) {
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return mode === "oldest" ? aDate - bDate : bDate - aDate;
  });
  return sorted;
}

function renderReports() {
  const list = document.getElementById("reportList");
  const sortedReports = getSortedReports();

  if (sortedReports.length === 0) {
    list.innerHTML = '<p class="text-secondary mb-0">Belum ada laporan.</p>';
    return;
  }

  list.innerHTML = "";

  sortedReports.forEach(function (r) {
    const hasLocation = r.lat !== null && r.lat !== undefined;
    const imageBlock =
      r.image_url && String(r.image_url).trim() !== ""
        ? `<img
            src="${escapeHtml(r.image_url)}"
            class="img-fluid rounded mb-2"
            style="max-width: 260px"
            alt="Foto laporan"
          />`
        : '<p class="small text-secondary mb-2">Foto tidak tersedia</p>';
    const html = `
      <div class="border-bottom pb-3 mb-3">
        ${imageBlock}
        <p class="mb-1">${escapeHtml(r.desc || "Tidak ada deskripsi")}</p>
        <p class="mb-1">Lokasi: ${
          hasLocation
            ? Number(r.lat).toFixed(4) + ", " + Number(r.lng).toFixed(4)
            : "tidak tersedia"
        }</p>
        <p class="small text-secondary mb-0">${
          r.created_at ? new Date(r.created_at).toLocaleString("id-ID") : ""
        }</p>
      </div>
    `;
    list.innerHTML += html;
  });
}

function initUi() {
  toastInstance = new bootstrap.Toast(document.getElementById("appToast"), {
    delay: 2600,
  });
  reportModal = bootstrap.Modal.getOrCreateInstance(
    document.getElementById("reportModal"),
  );

  document.getElementById("photo").addEventListener("change", updatePhotoPreview);
  document.getElementById("sortFilter").addEventListener("change", renderReports);
  document
    .getElementById("reportModal")
    .addEventListener("hidden.bs.modal", resetForm);
}

initUi();
resetForm();
loadReports();
