const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const SESSION_KEY = "laporaja_session_v1";

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

function getStatusLabel(status) {
  const normalized = String(status || "Menunggu").toLowerCase();
  if (normalized === "diproses") return "Diproses";
  if (normalized === "selesai") return "Selesai";
  return "Menunggu";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("id-ID");
}

function getFilterState() {
  const timeMode = String(
    (document.getElementById("rekapTimeFilter") || { value: "all" }).value || "all",
  );
  const statusMode = String(
    (document.getElementById("rekapStatusFilter") || { value: "all" }).value || "all",
  );
  const agencyMode = String(
    (document.getElementById("rekapAgencyFilter") || { value: "all" }).value || "all",
  );
  const limitRaw = Number(
    (document.getElementById("rekapLimitInput") || { value: 50 }).value,
  );
  const limit = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  return { timeMode, statusMode, agencyMode, limit };
}

function applyFilters(reports, filters) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeek = startOfDay - dayOfWeek * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  return reports.filter(function (item) {
    const statusLabel = getStatusLabel(item.status);
    if (filters.statusMode !== "all" && statusLabel !== filters.statusMode) {
      return false;
    }
    const agencyLabel = String(item.agency || "Umum");
    if (filters.agencyMode !== "all" && agencyLabel !== filters.agencyMode) {
      return false;
    }
    const ts = new Date(item.created_at || 0).getTime();
    if (filters.timeMode === "today" && ts < startOfDay) {
      return false;
    }
    if (filters.timeMode === "week" && ts < startOfWeek) {
      return false;
    }
    if (filters.timeMode === "month" && ts < startOfMonth) {
      return false;
    }
    return true;
  });
}

function renderSummary(reports) {
  const root = document.getElementById("rekapSummary");
  const totalBadge = document.getElementById("rekapTotalBadge");
  const total = reports.length;
  if (totalBadge) {
    totalBadge.textContent = String(total);
  }

  const counts = reports.reduce(
    function (acc, item) {
      const status = getStatusLabel(item.status);
      acc.total += 1;
      acc.status[status] = (acc.status[status] || 0) + 1;
      const agency = String(item.agency || "Umum");
      acc.agency[agency] = (acc.agency[agency] || 0) + 1;
      return acc;
    },
    { total: 0, status: {}, agency: {} },
  );

  const summaryCards = [
    { label: "Total Laporan", value: counts.total, icon: "bi-collection" },
    { label: "Menunggu", value: counts.status.Menunggu || 0, icon: "bi-hourglass-split" },
    { label: "Diproses", value: counts.status.Diproses || 0, icon: "bi-gear" },
    { label: "Selesai", value: counts.status.Selesai || 0, icon: "bi-check-circle" },
  ];

  root.innerHTML = summaryCards
    .map(function (item) {
      return `
        <div class="col-6 col-lg-3">
          <div class="border rounded p-3 h-100 bg-light">
            <div class="small text-secondary d-flex align-items-center gap-2">
              <i class="bi ${item.icon}"></i>
              <span>${escapeHtml(item.label)}</span>
            </div>
            <div class="fs-4 fw-semibold">${item.value}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderList(reports, limit) {
  const root = document.getElementById("rekapList");
  if (!reports.length) {
    root.innerHTML = '<p class="text-secondary mb-0">Belum ada laporan.</p>';
    return;
  }

  const rows = reports
    .slice()
    .sort(function (a, b) {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    })
    .slice(0, limit)
    .map(function (item) {
      return `
        <tr>
          <td>#${Number(item.id)}</td>
          <td>${escapeHtml(item.title || "Tanpa Judul")}</td>
          <td>${escapeHtml(item.agency || "Umum")}</td>
          <td>${escapeHtml(getStatusLabel(item.status))}</td>
          <td>${formatDateTime(item.created_at)}</td>
        </tr>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>ID</th>
            <th>Judul</th>
            <th>Instansi</th>
            <th>Status</th>
            <th>Tanggal</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <div class="small text-secondary">Menampilkan ${limit} laporan terbaru.</div>
  `;
}

async function loadRekap() {
  const subtitle = document.getElementById("rekapSubtitle");
  if (subtitle) {
    subtitle.textContent = "Semua Waktu";
  }
  try {
    const response = await fetch(API_BASE + "/admin/reports", {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal memuat rekap.");
    }
    const reports = await response.json();
    const filters = getFilterState();
    const filtered = applyFilters(reports, filters);
    const timeLabels = {
      all: "Semua Waktu",
      today: "Hari Ini",
      week: "Minggu Ini",
      month: "Bulan Ini",
    };
    if (subtitle) {
      subtitle.textContent = timeLabels[filters.timeMode] || "Semua Waktu";
    }
    renderSummary(filtered);
    renderList(filtered, filters.limit);
  } catch (error) {
    document.getElementById("rekapSummary").innerHTML =
      '<p class="text-danger mb-0">Rekap tidak bisa dimuat.</p>';
    document.getElementById("rekapList").innerHTML =
      '<p class="text-danger mb-0">Daftar tidak bisa dimuat.</p>';
  }
}

function wireActions() {
  const modalEl = document.getElementById("rekapFilterModal");
  const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
  const printBtn = document.getElementById("printRekapBtn");
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      if (modal) {
        modal.show();
      }
    });
  }
  const applyBtn = document.getElementById("rekapApplyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", function () {
      const defaultText = applyBtn.dataset.defaultText || applyBtn.textContent || "";
      if (!applyBtn.dataset.defaultText) {
        applyBtn.dataset.defaultText = defaultText;
      }
      applyBtn.disabled = true;
      applyBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Memuat...';
      loadRekap().then(function () {
        if (modal) {
          modal.hide();
        }
        applyBtn.disabled = false;
        applyBtn.textContent = applyBtn.dataset.defaultText || "Terapkan & Cetak";
        window.print();
      }).catch(function () {
        applyBtn.disabled = false;
        applyBtn.textContent = applyBtn.dataset.defaultText || "Terapkan & Cetak";
      });
    });
  }
}

function init() {
  const session = requireAdminSession();
  if (!session) {
    return;
  }
  wireActions();
  loadRekap();
}

init();
