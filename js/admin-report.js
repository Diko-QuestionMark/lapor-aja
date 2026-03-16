const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const SESSION_KEY = "laporaja_session_v1";
const CLOUDINARY_CLOUD_NAME = "dpipyaboq";
const CLOUDINARY_UPLOAD_PRESET = "laporaja_unsigned";
const MAX_EVIDENCE_SIZE_MB = 5;

let activeReport = null;

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function requireAdminSession() {
  const session = readSession();
  const role = String(session && session.role ? session.role : "").toLowerCase();
  if (!session || !session.token || role !== "admin") {
    window.location.href = "/login.html";
    return null;
  }
  return session;
}

function getReportId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

function authHeaders() {
  const session = readSession();
  return session && session.token
    ? { Authorization: `Bearer ${session.token}` }
    : {};
}

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

function formatLocation(report) {
  const hasLocation = report.lat !== null && report.lat !== undefined;
  return hasLocation
    ? `${Number(report.lat).toFixed(5)}, ${Number(report.lng).toFixed(5)}`
    : "Lokasi tidak tersedia";
}

function setNotice(message, type) {
  const root = document.getElementById("handleNotice");
  root.className = `small mt-2 text-${type}`;
  root.textContent = message;
}

function validateEvidenceFile(file) {
  if (!file) {
    return "";
  }
  if (!String(file.type || "").startsWith("image/")) {
    return "File bukti harus berupa gambar.";
  }
  if (file.size > MAX_EVIDENCE_SIZE_MB * 1024 * 1024) {
    return `Ukuran bukti maksimal ${MAX_EVIDENCE_SIZE_MB}MB.`;
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
    throw new Error("Upload bukti ke Cloudinary gagal.");
  }
  const data = await response.json();
  if (!data.secure_url) {
    throw new Error("URL bukti tidak ditemukan.");
  }
  return data.secure_url;
}

function fillForm(report) {
  document.getElementById("statusInput").value = report.status || "Menunggu";
  document.getElementById("noteInput").value = String(report.admin_note || "");
}

function renderDetail(report) {
  const root = document.getElementById("adminReportDetail");
  const statusMeta = getStatusMeta(report.status);
  const imageUrls = Array.isArray(report.image_urls)
    ? report.image_urls
        .map(function (url) {
          return String(url || "").trim();
        })
        .filter(Boolean)
    : [];
  if (imageUrls.length === 0 && report.image_url) {
    imageUrls.push(String(report.image_url).trim());
  }
  const reporterName = escapeHtml(report.reporter_name || "Anonim");
  const reporterEmail = escapeHtml(report.reporter_email || "-");
  const reporterUserId = Number(report.reporter_user_id || 0);
  const hasLocation = report.lat !== null && report.lat !== undefined;
  const reporterBlock =
    reporterUserId > 0
      ? `<span class="meta-item"><i class="bi bi-person"></i>${reporterName} (<a href="/user.html?id=${reporterUserId}" class="meta-action-link">${reporterEmail}</a>)</span>`
      : `<span class="meta-item"><i class="bi bi-person"></i>${reporterName} (${reporterEmail})</span>`;
  const locationBlock = hasLocation
    ? `<a
        href="https://www.google.com/maps?q=${Number(report.lat)},${Number(report.lng)}"
        target="_blank"
        rel="noopener noreferrer"
        class="meta-item meta-action-link"
      ><i class="bi bi-geo-alt"></i>${escapeHtml(formatLocation(report))}</a>`
    : `<span class="meta-item"><i class="bi bi-geo-alt"></i>${escapeHtml(formatLocation(report))}</span>`;
  const adminNote = String(report.admin_note || "").trim();
  const adminEvidence = String(report.admin_evidence_url || "").trim();
  const galleryBlock =
    imageUrls.length === 0
      ? '<div class="detail-image rounded border mb-3 d-flex align-items-center justify-content-center text-secondary bg-light">Foto tidak tersedia</div>'
      : imageUrls.length === 1
      ? `
        <img
          src="${escapeHtml(imageUrls[0] || "")}"
          alt="Foto laporan"
          class="img-fluid rounded border mb-3 detail-image"
        />
      `
      : `
        <div class="mb-3">
          <div class="rounded border p-2 bg-light">
            <img
              id="adminReportGalleryMain"
              src="${escapeHtml(imageUrls[0])}"
              class="d-block w-100 detail-image rounded"
              alt="Foto laporan 1"
            />
          </div>
          <div class="d-flex align-items-center justify-content-between mt-2 gap-2">
            <button id="adminReportGalleryPrev" class="btn btn-sm btn-outline-primary" type="button">Prev</button>
            <div class="small text-secondary">
              <span id="adminReportGalleryIndex">1</span> / ${imageUrls.length} foto
            </div>
            <button id="adminReportGalleryNext" class="btn btn-sm btn-outline-primary" type="button">Next</button>
          </div>
        </div>
      `;
  root.innerHTML = `
    <div class="mb-3">
      <h2 class="h5 mb-1">${escapeHtml(report.title || "Tanpa Judul")}</h2>
      <div class="small text-secondary mb-1">Laporan #${report.id}</div>
      <div class="meta-item mb-1"><i class="bi bi-building"></i>${escapeHtml(report.agency || "Umum")}</div>
      <span class="badge status-badge ${statusMeta.className}">Status: ${statusMeta.label}</span>
    </div>
    ${galleryBlock}
    <p class="mb-3">${escapeHtml(report.desc || "Tidak ada deskripsi")}</p>
    <div class="report-meta-row mb-3">
      <span class="meta-main">
        ${reporterBlock}
        <span class="meta-sep" aria-hidden="true">&bull;</span>
        <span class="meta-item"><i class="bi bi-clock"></i>${report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "-"}</span>
        <span class="meta-sep" aria-hidden="true">&bull;</span>
        ${locationBlock}
      </span>
    </div>
    <div class="mb-3">
      <p class="small text-secondary mb-0">
        <i class="bi bi-hand-thumbs-up-fill"></i>
        Dukungan: ${Number(report.upvotes || 0)}
      </p>
    </div>
    <hr class="my-4" />
    <section>
      <h3 class="h6 mb-2">Respons Saat Ini</h3>
      <div class="border rounded p-3 bg-light">
        <p class="mb-2">${escapeHtml(adminNote || "Belum ada respons.")}</p>
        ${
          adminEvidence
            ? `
              <div class="evidence-preview">
                <img
                  src="${escapeHtml(adminEvidence)}"
                  alt="Bukti tindak lanjut instansi"
                  class="evidence-thumb"
                  loading="lazy"
                />
                <a href="${escapeHtml(adminEvidence)}" target="_blank" rel="noopener noreferrer" class="small">
                  Lihat ukuran penuh
                </a>
              </div>
            `
            : ""
        }
        <p class="small text-secondary mb-0">
          ${
            report.admin_updated_at
              ? `Diperbarui ${new Date(report.admin_updated_at).toLocaleString("id-ID")}`
              : "Belum ada waktu update"
          }
          ${report.admin_updated_by ? ` oleh ${escapeHtml(report.admin_updated_by)}` : ""}
        </p>
        ${!adminEvidence ? '<p class="small text-secondary mb-0 mt-2">Belum ada bukti foto.</p>' : ""}
      </div>
    </section>
  `;

  if (imageUrls.length > 1) {
    let activeIndex = 0;
    const main = document.getElementById("adminReportGalleryMain");
    const indexEl = document.getElementById("adminReportGalleryIndex");
    const prevBtn = document.getElementById("adminReportGalleryPrev");
    const nextBtn = document.getElementById("adminReportGalleryNext");

    function setActive(nextIndex) {
      const total = imageUrls.length;
      activeIndex = ((nextIndex % total) + total) % total;
      if (main) {
        main.src = imageUrls[activeIndex];
        main.alt = `Foto laporan ${activeIndex + 1}`;
      }
      if (indexEl) {
        indexEl.textContent = String(activeIndex + 1);
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        setActive(activeIndex - 1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        setActive(activeIndex + 1);
      });
    }
    setActive(0);
  }
}

async function loadReport() {
  const reportId = getReportId();
  if (!reportId || Number.isNaN(reportId)) {
    document.getElementById("adminReportDetail").innerHTML =
      '<p class="text-danger mb-0">ID laporan tidak valid.</p>';
    return;
  }

  const response = await fetch(API_BASE + "/admin/reports", {
    headers: authHeaders(),
  });
  if (response.status === 401) {
    throw new Error("Akses admin tidak valid. Login sebagai admin.");
  }
  if (!response.ok) {
    throw new Error("Gagal memuat data admin.");
  }
  const reports = await response.json();
  const report = reports.find(function (item) {
    return Number(item.id) === reportId;
  });
  if (!report) {
    throw new Error("Laporan tidak ditemukan.");
  }

  activeReport = report;
  renderDetail(report);
  fillForm(report);
}

async function saveResponse(event) {
  event.preventDefault();
  if (!activeReport) {
    return;
  }

  const saveBtn = document.getElementById("saveHandleBtn");
  const status = document.getElementById("statusInput").value;
  const note = String(document.getElementById("noteInput").value || "").trim();
  const fileInput = document.getElementById("evidenceFileInput");
  let evidenceUrl = String(activeReport.admin_evidence_url || "").trim();
  const evidenceFile = fileInput.files ? fileInput.files[0] : null;

  const fileError = validateEvidenceFile(evidenceFile);
  if (fileError) {
    setNotice(fileError, "danger");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";
  setNotice("Menyimpan respons...", "secondary");
  try {
    if (evidenceFile) {
      saveBtn.textContent = "Upload bukti...";
      evidenceUrl = await uploadToCloudinary(evidenceFile);
    }

    const response = await fetch(API_BASE + "/admin/reports", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        id: Number(activeReport.id),
        status,
        admin_note: note,
        admin_evidence_url: evidenceUrl,
      }),
    });
    const payload = await response.json().catch(function () {
      return {};
    });
    if (response.status === 401) {
      throw new Error("Akses admin tidak valid.");
    }
    if (!response.ok) {
      throw new Error(payload.error || "Gagal menyimpan respons.");
    }

    setNotice("Respons instansi berhasil disimpan.", "success");
    await loadReport();
  } catch (error) {
    setNotice(error.message || "Gagal menyimpan respons.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Simpan Respons";
  }
}

function init() {
  const session = requireAdminSession();
  if (!session) {
    return;
  }
  document.getElementById("adminHandleForm").addEventListener("submit", saveResponse);

  loadReport().catch(function (error) {
    setNotice(error.message || "Gagal memuat data.", "danger");
    document.getElementById("adminReportDetail").innerHTML =
      '<p class="text-danger mb-0">Tidak bisa memuat laporan.</p>';
  });
}

init();
