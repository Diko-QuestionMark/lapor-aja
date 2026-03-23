const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const SESSION_KEY = "laporaja_session_v1";
const ADMIN_READ_KEY = "laporaja_admin_read_reports_v1";

let adminReports = [];
let sessionAgency = "";
let adminFeedbackInbox = { items: [], metrics: null };

function getAgencyFilter() {
  const el = document.getElementById("agencyFilter");
  return el ? String(el.value || "") : "";
}

function getSearchQuery() {
  const el = document.getElementById("search-input") || document.getElementById("adminSearchInput");
  return el ? String(el.value || "").trim().toLowerCase() : "";
}

function getSortMode() {
  const el = document.getElementById("adminSortFilter");
  return el ? String(el.value || "priority") : "priority";
}

function getTimeMode() {
  const el = document.getElementById("adminTimeFilter");
  return el ? String(el.value || "all") : "all";
}

function getStatusMode() {
  const el = document.getElementById("adminStatusFilter");
  return el ? String(el.value || "all") : "all";
}

function normalizeStatus(value) {
  return String(value || "Menunggu").trim().toLowerCase();
}

function isUnfinishedStatus(value) {
  return normalizeStatus(value) !== "selesai";
}

function getStatusMeta(status) {
  const label = String(status || "Menunggu").trim();
  const normalized = normalizeStatus(label);
  if (normalized === "diproses") {
    return { label: "Diproses", className: "status-diproses" };
  }
  if (normalized === "selesai") {
    return { label: "Selesai", className: "status-selesai" };
  }
  return { label: "Menunggu", className: "status-menunggu" };
}

function getReadReportIds() {
  try {
    const raw = localStorage.getItem(ADMIN_READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function hasReadReport(reportId) {
  return getReadReportIds().includes(reportId);
}

function getResponseToneClass(status) {
  const normalized = normalizeStatus(status || "menunggu");
  if (normalized === "selesai") {
    return "admin-response-selesai";
  }
  if (normalized === "diproses") {
    return "admin-response-diproses";
  }
  return "admin-response-menunggu";
}

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

function setupAgencyFilter(session) {
  const agency = String((session && session.agency) || "").trim();
  const agencyFilterEl = document.getElementById("agencyFilter");
  if (!agencyFilterEl) {
    return;
  }

  agencyFilterEl.innerHTML = "";
  const baseOption = document.createElement("option");
  baseOption.value = "agency";
  baseOption.textContent = agency || "Instansi";
  const generalOption = document.createElement("option");
  generalOption.value = "agency_general";
  generalOption.textContent = agency ? `${agency} + Umum` : "Instansi + Umum";
  agencyFilterEl.appendChild(baseOption);
  agencyFilterEl.appendChild(generalOption);
  agencyFilterEl.value = "agency";
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

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("id-ID");
}

function formatTimeAgo(value) {
  if (!value) {
    return "-";
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
    return "-";
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

function showError(message) {
  document.getElementById("adminList").innerHTML = `<p class="text-danger mb-0">${message}</p>`;
}

function renderAdminListSkeleton(count) {
  const total = Number(count || 3);
  const list = document.getElementById("adminList");
  if (!list) {
    return;
  }
  let html = "";
  for (let index = 0; index < total; index += 1) {
    html += `
      <article class="admin-skeleton-card" aria-hidden="true">
        <div class="admin-skeleton-grid">
          <div class="admin-skeleton-thumb"></div>
          <div class="admin-skeleton-main">
            <div class="admin-skeleton-head">
              <div class="admin-skeleton-line admin-skeleton-line-id"></div>
              <div class="admin-skeleton-line admin-skeleton-line-status"></div>
            </div>
            <div class="admin-skeleton-line admin-skeleton-line-title"></div>
            <div class="admin-skeleton-line admin-skeleton-line-meta"></div>
            <div class="admin-skeleton-line admin-skeleton-line-desc"></div>
            <div class="admin-skeleton-line admin-skeleton-line-desc-short"></div>
            <div class="admin-skeleton-panel"></div>
          </div>
        </div>
      </article>
    `;
  }
  list.innerHTML = html;
}

function renderLoading() {
  renderAdminListSkeleton(3);
}

async function loadAdminReports() {
  renderLoading();
  try {
    const response = await fetch(API_BASE + "/admin/reports", {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      showError("Akses admin tidak valid. Login sebagai admin.");
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal mengambil data admin");
    }

    adminReports = await response.json();
    renderAdminReports();
  } catch (error) {
    console.error(error);
    showError("Tidak bisa memuat data admin.");
  }
}

function renderAdminFeedbackInbox() {
  const summaryRoot = document.getElementById("adminFeedbackSummary");
  const listRoot = document.getElementById("adminFeedbackList");
  if (!summaryRoot || !listRoot) {
    return;
  }

  const metrics = adminFeedbackInbox.metrics || {};
  const items = Array.isArray(adminFeedbackInbox.items) ? adminFeedbackInbox.items : [];
  const topReasonsMonth = Array.isArray(metrics.top_reasons_this_month)
    ? metrics.top_reasons_this_month
    : [];
  const topReasonsText = topReasonsMonth
    .map(function (item) {
      return `${String(item.label || "Alasan lain")} (${Number(item.count || 0)})`;
    })
    .join(", ");

  summaryRoot.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="badge text-bg-light border">Approval: ${Number(metrics.approval_rate || 0).toFixed(1)}%</span>
      <span class="badge text-bg-light border">Perlu Revisi: ${Number(metrics.needs_revision_count || 0)}</span>
      <span class="badge text-bg-light border">Feedback: ${Number(metrics.total_count || 0)}</span>
      <span class="badge text-bg-light border">Rata-rata perbaikan: ${Number(metrics.avg_revision_hours || 0).toFixed(1)} jam</span>
    </div>
    ${
      topReasonsText
        ? `<p class="small text-secondary mb-0 mt-2">Alasan terbanyak bulan ini: ${escapeHtml(topReasonsText)}</p>`
        : ""
    }
  `;

  if (items.length === 0) {
    listRoot.innerHTML = '<p class="text-secondary mb-0">Belum ada feedback warga untuk dianalisis.</p>';
    return;
  }

  listRoot.innerHTML = items
    .map(function (item) {
      const reportId = Number(item.id || 0);
      const statusMeta = getStatusMeta(item.status);
      const topReasons = Array.isArray(item.top_reasons) ? item.top_reasons : [];
      const topReasonText = topReasons
        .map(function (reason) {
          return `${String(reason.label || "Alasan lain")} (${Number(reason.count || 0)})`;
        })
        .join(", ");
      const needsRevision = Boolean(item.feedback_needs_revision);
      return `
        <article class="admin-feedback-item border rounded p-2 mb-2 ${
          needsRevision ? "admin-feedback-item-urgent" : ""
        }">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div class="fw-semibold">${escapeHtml(item.title || "Laporan Warga")} (#${reportId})</div>
              <div class="small text-secondary">
                ${escapeHtml(String(item.agency || "Umum"))} - ${statusMeta.label}
              </div>
            </div>
            <span class="badge ${needsRevision ? "text-bg-warning" : "text-bg-light border"}">
              ${needsRevision ? "Perlu Revisi" : "Terpantau"}
            </span>
          </div>
          <div class="small text-secondary mt-2">
            Helpful ${Number(item.helpful_count || 0)} | Tidak membantu ${Number(item.unhelpful_count || 0)} | Approval ${Number(item.approval_rate || 0).toFixed(1)}%
          </div>
          ${
            topReasonText
              ? `<div class="small text-secondary mt-1">Alasan utama: ${escapeHtml(topReasonText)}</div>`
              : ""
          }
          <div class="mt-2 d-flex justify-content-end">
            <a href="/admin/report.html?id=${reportId}" class="btn btn-sm btn-outline-dark">Perbarui Respons</a>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadAdminFeedbackInbox() {
  const summaryRoot = document.getElementById("adminFeedbackSummary");
  const listRoot = document.getElementById("adminFeedbackList");
  if (!summaryRoot || !listRoot) {
    return;
  }
  summaryRoot.innerHTML = `
    <div class="admin-skeleton-metrics" aria-hidden="true">
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill"></div>
    </div>
  `;
  listRoot.innerHTML = `
    <article class="admin-skeleton-feedback-card" aria-hidden="true">
      <div class="admin-skeleton-line admin-skeleton-line-title"></div>
      <div class="admin-skeleton-line admin-skeleton-line-meta"></div>
    </article>
  `;
  try {
    const response = await fetch(`${API_BASE}/report-feedback?admin_inbox=1&limit=20`, {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      summaryRoot.innerHTML = '<span class="text-danger">Akses admin tidak valid.</span>';
      listRoot.innerHTML = '<span class="text-danger">Tidak bisa memuat feedback.</span>';
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal memuat feedback.");
    }
    const data = await response.json();
    adminFeedbackInbox = {
      items: Array.isArray(data.items) ? data.items : [],
      metrics: data.metrics || {},
    };
    renderAdminFeedbackInbox();
  } catch (error) {
    console.error(error);
    summaryRoot.innerHTML = '<span class="text-danger">Ringkasan feedback gagal dimuat.</span>';
    listRoot.innerHTML = '<span class="text-danger">Daftar feedback gagal dimuat.</span>';
  }
}

function renderAdminReports() {
  const list = document.getElementById("adminList");
  const topTitle = document.getElementById("adminSectionTitle");
  const agencyFilter = getAgencyFilter();
  const searchQuery = getSearchQuery();
  const sortMode = getSortMode();
  const timeMode = getTimeMode();
  const statusMode = getStatusMode();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeek = startOfDay - dayOfWeek * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filteredReports = adminReports.filter(function (report) {
    const reportAgency = String(report.agency || "Umum");
    const normalizedStatus = normalizeStatus(report.status);
    const agencyMatch =
      agencyFilter === "agency_general"
        ? reportAgency === sessionAgency || reportAgency === "Umum"
        : reportAgency === sessionAgency;
    if (!agencyMatch) {
      return false;
    }

    if (statusMode === "open" && normalizedStatus === "selesai") {
      return false;
    }
    if (statusMode === "waiting" && normalizedStatus !== "menunggu") {
      return false;
    }
    if (statusMode === "in_progress" && normalizedStatus !== "diproses") {
      return false;
    }
    if (statusMode === "done" && normalizedStatus !== "selesai") {
      return false;
    }

    const reportTime = new Date(report.created_at || 0).getTime();
    if (timeMode === "today" && reportTime < startOfDay) {
      return false;
    }
    if (timeMode === "week" && reportTime < startOfWeek) {
      return false;
    }
    if (timeMode === "month" && reportTime < startOfMonth) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const haystack = [
      report.id,
      report.title,
      report.desc,
      report.reporter_name,
      report.reporter_email,
      report.status,
      report.agency,
    ]
      .map(function (value) {
        return String(value || "").toLowerCase();
      })
      .join(" ");
    return haystack.includes(searchQuery);
  });

  const visibleReports = filteredReports.slice();
  visibleReports.sort(function (a, b) {
    const aStatus = normalizeStatus(a.status);
    const bStatus = normalizeStatus(b.status);
    const aNeedsRevision = Boolean(a.feedback_needs_revision);
    const bNeedsRevision = Boolean(b.feedback_needs_revision);
    const aUpvotes = Number(a.upvotes || 0);
    const bUpvotes = Number(b.upvotes || 0);
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    if (sortMode === "priority") {
      if (aNeedsRevision !== bNeedsRevision) {
        return aNeedsRevision ? -1 : 1;
      }
      const aUnfinished = isUnfinishedStatus(aStatus);
      const bUnfinished = isUnfinishedStatus(bStatus);
      if (aUnfinished !== bUnfinished) {
        return aUnfinished ? -1 : 1;
      }

      if (aUnfinished && bUnfinished) {
        const aToday = aDate >= startOfDay;
        const bToday = bDate >= startOfDay;
        if (aToday !== bToday) {
          return bToday ? 1 : -1;
        }
        if (bUpvotes !== aUpvotes) {
          return bUpvotes - aUpvotes;
        }
        const aWaiting = aStatus === "menunggu" ? 0 : 1;
        const bWaiting = bStatus === "menunggu" ? 0 : 1;
        if (aWaiting !== bWaiting) {
          return aWaiting - bWaiting;
        }
        return bDate - aDate;
      }

      if (bDate !== aDate) {
        return bDate - aDate;
      }
      return bUpvotes - aUpvotes;
    }
    if (sortMode === "oldest") {
      return aDate - bDate;
    }
    if (sortMode === "upvotes") {
      return bUpvotes - aUpvotes || bDate - aDate;
    }
    if (sortMode === "status_waiting") {
      const aPriority = aStatus === "menunggu" ? 0 : 1;
      const bPriority = bStatus === "menunggu" ? 0 : 1;
      return aPriority - bPriority || bDate - aDate;
    }
    if (sortMode === "status_done") {
      const aPriority = aStatus === "selesai" ? 0 : 1;
      const bPriority = bStatus === "selesai" ? 0 : 1;
      return aPriority - bPriority || bDate - aDate;
    }
    return bDate - aDate;
  });

  if (visibleReports.length === 0) {
    if (topTitle) {
      const timeLabels = {
        all: "Semua Waktu",
        today: "Hari Ini",
        week: "Minggu Ini",
        month: "Bulan Ini",
      };
      const timeLabel = timeLabels[timeMode] || "Semua Waktu";
      const agencyTitle =
        agencyFilter === "agency_general"
          ? `${sessionAgency} + Umum`
          : sessionAgency;
      topTitle.textContent = `Laporan ke Instansi: ${agencyTitle} - ${timeLabel}`;
    }
    list.innerHTML = '<p class="text-secondary mb-0">Belum ada laporan.</p>';
    return;
  }

  if (topTitle) {
    const timeLabels = {
      all: "Semua Waktu",
      today: "Hari Ini",
      week: "Minggu Ini",
      month: "Bulan Ini",
    };
    const timeLabel = timeLabels[timeMode] || "Semua Waktu";
    const agencyTitle =
      agencyFilter === "agency_general"
        ? `${sessionAgency} + Umum`
        : sessionAgency;
    topTitle.textContent = `Laporan ke Instansi: ${agencyTitle} - ${timeLabel}`;
  }

  list.innerHTML = "";
  visibleReports.forEach(function (report) {
    const statusMeta = getStatusMeta(report.status);
    const responseToneClass = getResponseToneClass(report.status);
    const agencyLabel = String(report.agency || "Umum");
    const imageUrl = String(report.image_url || "").trim();
    const reportTitle = String(report.title || "Tanpa Judul");
    const reporterName = String(report.reporter_name || "Anonim");
    const reporterEmail = String(report.reporter_email || "-");
    const createdAtLabel = formatTimeAgo(report.created_at);
    const isRead = hasReadReport(Number(report.id));
    const responseSummary = String(report.admin_note || "").trim()
      ? report.admin_note
      : "Belum ada respons instansi.";

    const row = document.createElement("div");
    row.className = "admin-report-card border rounded p-3 mb-3 report-card-clickable";
    row.setAttribute("data-report-id", String(Number(report.id)));
    row.setAttribute("role", "link");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `Lihat detail penanganan laporan ${Number(report.id)}`);
    row.innerHTML = `
      <div class="d-flex flex-column flex-md-row gap-3 align-items-start">
        <img
          src="${escapeHtml(imageUrl || "/img/defaultAvatar.jpg")}"
          alt="Foto laporan"
          class="admin-card-thumb rounded border img-lazy"
          loading="lazy"
          decoding="async"
          onload="this.classList.add('is-loaded')"
        />
        <div class="admin-card-content flex-grow-1 w-100">
          <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="admin-card-id">#${report.id}</span>
              <span class="badge status-badge ${statusMeta.className}">${statusMeta.label}</span>
            </div>
            <span class="admin-card-chevron d-flex align-items-center gap-2" aria-hidden="true">
              ${isRead ? "" : '<span class="admin-unread-dot" title="Belum dibaca"></span>'}
              <i class="bi bi-chevron-right"></i>
            </span>
          </div>
          <h3 class="admin-card-title mb-2">${escapeHtml(reportTitle)}</h3>
          <div class="admin-card-meta-row mb-2">
            <span class="admin-card-meta"><i class="bi bi-building"></i>${escapeHtml(agencyLabel)}</span>
            <span class="admin-card-meta"><i class="bi bi-person"></i>${escapeHtml(reporterName)} (${escapeHtml(reporterEmail)})</span>
            <span class="admin-card-meta"><i class="bi bi-clock"></i>${createdAtLabel}</span>
            <span class="admin-card-meta"><i class="bi bi-hand-thumbs-up"></i>${Number(report.upvotes || 0)} dukungan</span>
            ${
              report.feedback_needs_revision
                ? '<span class="admin-card-meta text-warning"><i class="bi bi-exclamation-circle"></i>Perlu revisi respons</span>'
                : ""
            }
          </div>
          <p class="admin-card-desc mb-2">
            <i class="bi bi-card-text"></i>
            <span>${escapeHtml(report.desc || "Tidak ada deskripsi")}</span>
          </p>
          <div class="admin-card-response ${responseToneClass}">
            <p class="admin-card-response-label mb-1">Ringkasan respons</p>
            <p class="admin-card-response-text mb-0">${escapeHtml(responseSummary)}</p>
          </div>
        </div>
      </div>
    `;
    row.addEventListener("click", function (event) {
      const interactiveTarget = event.target.closest("a, button, input, select, textarea, label");
      if (interactiveTarget) {
        return;
      }
      window.location.href = `/admin/report.html?id=${Number(report.id)}`;
    });
    row.addEventListener("keydown", function (event) {
      const key = event.key;
      if (key !== "Enter" && key !== " ") {
        return;
      }
      const interactiveTarget = event.target.closest("a, button, input, select, textarea, label");
      if (interactiveTarget) {
        return;
      }
      event.preventDefault();
      window.location.href = `/admin/report.html?id=${Number(report.id)}`;
    });
    list.appendChild(row);
  });
}

function wireEvents() {
  function bindSearchInput() {
    const searchInputEl =
      document.getElementById("search-input") || document.getElementById("adminSearchInput");
    if (!searchInputEl || searchInputEl.dataset.adminSearchBound === "1") {
      return;
    }
    searchInputEl.dataset.adminSearchBound = "1";
    searchInputEl.addEventListener("input", renderAdminReports);
  }

  const agencyFilterEl = document.getElementById("agencyFilter");
  if (agencyFilterEl) {
    agencyFilterEl.addEventListener("change", renderAdminReports);
  }
  bindSearchInput();
  document.addEventListener("navbar:ready", bindSearchInput);
  const sortFilterEl = document.getElementById("adminSortFilter");
  if (sortFilterEl) {
    sortFilterEl.addEventListener("change", renderAdminReports);
  }
  const timeFilterEl = document.getElementById("adminTimeFilter");
  if (timeFilterEl) {
    timeFilterEl.addEventListener("change", renderAdminReports);
  }
  const statusFilterEl = document.getElementById("adminStatusFilter");
  if (statusFilterEl) {
    statusFilterEl.addEventListener("change", renderAdminReports);
  }
  const resetBtn = document.getElementById("adminResetFilterBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      const agencyFilter = document.getElementById("agencyFilter");
      const searchInput =
        document.getElementById("search-input") || document.getElementById("adminSearchInput");
      const sortFilter = document.getElementById("adminSortFilter");
      const timeFilter = document.getElementById("adminTimeFilter");
      const statusFilter = document.getElementById("adminStatusFilter");
      if (agencyFilter) {
        agencyFilter.value = "agency";
      }
      if (searchInput) {
        searchInput.value = "";
      }
      if (sortFilter) {
        sortFilter.value = "priority";
      }
      if (timeFilter) {
        timeFilter.value = "all";
      }
      if (statusFilter) {
        statusFilter.value = "all";
      }
      const filterModal = document.getElementById("admin-filter-modal");
      if (filterModal && window.bootstrap && window.bootstrap.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(filterModal);
        modal.hide();
      }
      renderAdminReports();
    });
  }
}

function init() {
  const session = requireAdminSession();
  if (!session) {
    return;
  }
  sessionAgency = String(session.agency || "").trim();
  setupAgencyFilter(session);
  wireEvents();
  loadAdminReports();
}

init();
