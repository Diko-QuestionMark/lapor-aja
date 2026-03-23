const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const SESSION_KEY = "laporaja_session_v1";

let feedbackItems = [];
let feedbackMetrics = {};

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
  const role = String((session && session.role) || "").toLowerCase();
  if (!session || !session.token || role !== "admin") {
    window.location.href = "/login.html";
    return null;
  }
  return session;
}

function authHeaders() {
  const session = readSession();
  return session && session.token ? { Authorization: `Bearer ${session.token}` } : {};
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

function normalizeStatus(value) {
  return String(value || "Menunggu").trim().toLowerCase();
}

function getStatusMeta(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "diproses") {
    return { label: "Diproses", className: "status-diproses" };
  }
  if (normalized === "selesai") {
    return { label: "Selesai", className: "status-selesai" };
  }
  return { label: "Menunggu", className: "status-menunggu" };
}

function formatTimeAgo(value) {
  if (!value) {
    return "-";
  }
  const ts = new Date(value).getTime();
  if (!ts || Number.isNaN(ts)) {
    return "-";
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
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
  return new Date(ts).toLocaleString("id-ID");
}

function getSearchQuery() {
  const el = document.getElementById("feedbackSearchInput");
  return el ? String(el.value || "").trim().toLowerCase() : "";
}

function getRevisionFilter() {
  const el = document.getElementById("feedbackRevisionFilter");
  return el ? String(el.value || "all") : "all";
}

function getStatusFilter() {
  const el = document.getElementById("feedbackStatusFilter");
  return el ? String(el.value || "all") : "all";
}

function getSortMode() {
  const el = document.getElementById("feedbackSortFilter");
  return el ? String(el.value || "priority") : "priority";
}

function renderMetrics() {
  const root = document.getElementById("feedbackMetrics");
  if (!root) {
    return;
  }
  const metrics = feedbackMetrics || {};
  const topReasons = Array.isArray(metrics.top_reasons_this_month)
    ? metrics.top_reasons_this_month
    : [];
  const topReasonText = topReasons
    .map(function (item) {
      return `${String(item.label || "Alasan lain")} (${Number(item.count || 0)})`;
    })
    .join(", ");

  root.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <span class="badge text-bg-light border">Approval: ${Number(metrics.approval_rate || 0).toFixed(1)}%</span>
      <span class="badge text-bg-light border">Perlu Revisi: ${Number(metrics.needs_revision_count || 0)}</span>
      <span class="badge text-bg-light border">Helpful: ${Number(metrics.helpful_count || 0)}</span>
      <span class="badge text-bg-light border">Tidak Membantu: ${Number(metrics.unhelpful_count || 0)}</span>
      <span class="badge text-bg-light border">Rata-rata perbaikan: ${Number(metrics.avg_revision_hours || 0).toFixed(1)} jam</span>
    </div>
    ${
      topReasonText
        ? `<p class="small text-secondary mb-0 mt-2">Alasan terbanyak bulan ini: ${escapeHtml(topReasonText)}</p>`
        : ""
    }
  `;
}

function renderMetricsSkeleton() {
  const root = document.getElementById("feedbackMetrics");
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div class="admin-skeleton-metrics" aria-hidden="true">
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill"></div>
      <div class="admin-skeleton-pill admin-skeleton-pill-wide"></div>
    </div>
    <div class="admin-skeleton-line admin-skeleton-line-meta mt-2"></div>
  `;
}

function renderFeedbackListSkeleton(count) {
  const root = document.getElementById("feedbackList");
  if (!root) {
    return;
  }
  const total = Number(count || 4);
  let html = "";
  for (let index = 0; index < total; index += 1) {
    html += `
      <article class="admin-skeleton-feedback-card" aria-hidden="true">
        <div class="admin-skeleton-head">
          <div class="admin-skeleton-line admin-skeleton-line-title"></div>
          <div class="admin-skeleton-line admin-skeleton-line-status"></div>
        </div>
        <div class="admin-skeleton-line admin-skeleton-feedback-meta"></div>
        <div class="admin-skeleton-line admin-skeleton-line-meta"></div>
        <div class="admin-skeleton-line admin-skeleton-line-desc-short"></div>
        <div class="d-flex justify-content-end mt-2">
          <div class="admin-skeleton-pill"></div>
        </div>
      </article>
    `;
  }
  root.innerHTML = html;
}

function renderList() {
  const root = document.getElementById("feedbackList");
  if (!root) {
    return;
  }

  const revisionFilter = getRevisionFilter();
  const statusFilter = getStatusFilter();
  const sortMode = getSortMode();
  const query = getSearchQuery();

  const filtered = feedbackItems.filter(function (item) {
    const needsRevision = Boolean(item.feedback_needs_revision);
    const status = normalizeStatus(item.status);
    if (revisionFilter === "need" && !needsRevision) {
      return false;
    }
    if (statusFilter === "waiting" && status !== "menunggu") {
      return false;
    }
    if (statusFilter === "in_progress" && status !== "diproses") {
      return false;
    }
    if (statusFilter === "done" && status !== "selesai") {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      item.id,
      item.title,
      item.agency,
      item.status,
      (item.top_reasons || []).map(function (reason) {
        return reason.label;
      }),
    ]
      .flat()
      .map(function (value) {
        return String(value || "").toLowerCase();
      })
      .join(" ");
    return haystack.includes(query);
  });

  filtered.sort(function (a, b) {
    const aNeedsRevision = Boolean(a.feedback_needs_revision);
    const bNeedsRevision = Boolean(b.feedback_needs_revision);
    const aUnhelpful = Number(a.unhelpful_count || 0);
    const bUnhelpful = Number(b.unhelpful_count || 0);
    const aApproval = Number(a.approval_rate || 0);
    const bApproval = Number(b.approval_rate || 0);
    const aTime = new Date(a.admin_updated_at || 0).getTime();
    const bTime = new Date(b.admin_updated_at || 0).getTime();

    if (sortMode === "unhelpful") {
      return bUnhelpful - aUnhelpful || aApproval - bApproval || bTime - aTime;
    }
    if (sortMode === "approval_low") {
      return aApproval - bApproval || bUnhelpful - aUnhelpful || bTime - aTime;
    }
    if (sortMode === "newest") {
      return bTime - aTime;
    }

    if (aNeedsRevision !== bNeedsRevision) {
      return aNeedsRevision ? -1 : 1;
    }
    return bUnhelpful - aUnhelpful || aApproval - bApproval || bTime - aTime;
  });

  if (filtered.length === 0) {
    root.innerHTML = '<p class="text-secondary mb-0">Tidak ada feedback sesuai filter.</p>';
    return;
  }

  root.innerHTML = filtered
    .map(function (item) {
      const reportId = Number(item.id || 0);
      const statusMeta = getStatusMeta(item.status);
      const needsRevision = Boolean(item.feedback_needs_revision);
      const reasons = Array.isArray(item.top_reasons) ? item.top_reasons : [];
      const reasonsText = reasons
        .map(function (reason) {
          return `${String(reason.label || "Alasan lain")} (${Number(reason.count || 0)})`;
        })
        .join(", ");
      return `
        <article class="admin-feedback-item border rounded p-3 mb-3 ${
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
            reasonsText
              ? `<div class="small text-secondary mt-1">Alasan utama: ${escapeHtml(reasonsText)}</div>`
              : ""
          }
          <div class="small text-secondary mt-1">
            Update respons: ${formatTimeAgo(item.admin_updated_at)}
          </div>
          <div class="mt-2 d-flex justify-content-end">
            <a href="/admin/report.html?id=${reportId}" class="btn btn-sm btn-outline-dark">Buka Detail</a>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadFeedback() {
  const list = document.getElementById("feedbackList");
  const metrics = document.getElementById("feedbackMetrics");
  renderMetricsSkeleton();
  renderFeedbackListSkeleton(4);
  try {
    const response = await fetch(`${API_BASE}/report-feedback?admin_inbox=1&limit=80`, {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal memuat feedback.");
    }
    const payload = await response.json();
    feedbackItems = Array.isArray(payload.items) ? payload.items : [];
    feedbackMetrics = payload.metrics || {};
    renderMetrics();
    renderList();
  } catch (error) {
    if (metrics) {
      metrics.innerHTML = '<span class="text-danger">Ringkasan feedback gagal dimuat.</span>';
    }
    if (list) {
      list.innerHTML = `<span class="text-danger">${escapeHtml(error.message || "Daftar feedback gagal dimuat.")}</span>`;
    }
  }
}

function wireEvents() {
  const search = document.getElementById("feedbackSearchInput");
  const revision = document.getElementById("feedbackRevisionFilter");
  const status = document.getElementById("feedbackStatusFilter");
  const sort = document.getElementById("feedbackSortFilter");
  if (search) {
    search.addEventListener("input", renderList);
  }
  if (revision) {
    revision.addEventListener("change", renderList);
  }
  if (status) {
    status.addEventListener("change", renderList);
  }
  if (sort) {
    sort.addEventListener("change", renderList);
  }
}

function init() {
  const session = requireAdminSession();
  if (!session) {
    return;
  }
  wireEvents();
  loadFeedback();
}

init();
