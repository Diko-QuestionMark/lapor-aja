const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const UPVOTE_STORAGE_KEY = "laporaja_upvoted_ids";

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

function getReportId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
}

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

function renderNotFound(message) {
  document.getElementById("detailContainer").innerHTML =
    `<p class="text-danger mb-0">${message}</p>`;
}

function formatLocation(report) {
  const hasLocation = report.lat !== null && report.lat !== undefined;
  return hasLocation
    ? `${Number(report.lat).toFixed(5)}, ${Number(report.lng).toFixed(5)}`
    : "Lokasi tidak tersedia";
}

function renderDetail(report) {
  const voted = hasUpvoted(report.id);
  const statusMeta = getStatusMeta(report.status);
  const container = document.getElementById("detailContainer");
  container.innerHTML = `
    <div class="mb-3">
      <h2 class="h5 mb-1">Laporan #${report.id}</h2>
      <span class="badge status-badge ${statusMeta.className}">Status: ${statusMeta.label}</span>
    </div>
    <img src="${report.image_url}" alt="Foto laporan" class="img-fluid rounded border mb-3 detail-image" />
    <p class="mb-3">${report.desc || "Tidak ada deskripsi"}</p>
    <div class="small text-secondary mb-1">Waktu: ${report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "-"}</div>
    <div class="small text-secondary mb-3">Lokasi: ${formatLocation(report)}</div>
    <button id="detailVoteBtn" class="btn btn-sm ${voted ? "btn-outline-danger" : "btn-outline-primary"}">
      ${voted ? "Tarik Dukungan" : "Dukung 👍"} (${Number(report.upvotes || 0)})
    </button>
  `;

  document.getElementById("detailVoteBtn").addEventListener("click", async function () {
    const currentlyVoted = hasUpvoted(report.id);
    const btn = this;
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
    try {
      await voteReport(report.id, currentlyVoted ? "downvote" : "upvote");
      if (currentlyVoted) {
        unmarkUpvoted(report.id);
      } else {
        markUpvoted(report.id);
      }
      window.location.reload();
    } catch (_) {
      btn.disabled = false;
      btn.textContent = "Gagal, coba lagi";
    }
  });
}

async function init() {
  const id = getReportId();
  if (!id || Number.isNaN(id)) {
    renderNotFound("ID laporan tidak valid.");
    return;
  }

  try {
    const response = await fetch(API_BASE + "/reports");
    if (!response.ok) {
      throw new Error();
    }
    const reports = await response.json();
    const report = reports.find(function (item) {
      return Number(item.id) === id;
    });
    if (!report) {
      renderNotFound("Laporan tidak ditemukan.");
      return;
    }
    renderDetail(report);
  } catch (_) {
    renderNotFound("Tidak bisa memuat detail laporan.");
  }
}

init();
