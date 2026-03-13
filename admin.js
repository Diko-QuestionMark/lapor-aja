const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);

const ADMIN_KEY_STORAGE = "laporaja_admin_key";
const STATUS_OPTIONS = ["Menunggu", "Diproses", "Selesai"];

let adminReports = [];

function getAdminKey() {
  return localStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

function setAdminKey(value) {
  localStorage.setItem(ADMIN_KEY_STORAGE, value);
}

function authHeaders() {
  const key = getAdminKey();
  return key ? { "X-Admin-Key": key } : {};
}

function showError(message) {
  document.getElementById("adminList").innerHTML = `<p class="text-danger mb-0">${message}</p>`;
}

function renderLoading() {
  document.getElementById("adminList").innerHTML =
    '<p class="text-secondary mb-0">Memuat data admin...</p>';
}

async function loadAdminReports() {
  renderLoading();
  try {
    const response = await fetch(API_BASE + "/admin/reports", {
      headers: authHeaders(),
    });
    if (response.status === 401) {
      showError("Admin key salah atau belum diisi.");
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

function renderAdminReports() {
  const list = document.getElementById("adminList");
  if (adminReports.length === 0) {
    list.innerHTML = '<p class="text-secondary mb-0">Belum ada laporan.</p>';
    return;
  }

  list.innerHTML = "";
  adminReports.forEach(function (report) {
    const selectOptions = STATUS_OPTIONS.map(function (item) {
      const selected = item === report.status ? "selected" : "";
      return `<option value="${item}" ${selected}>${item}</option>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "border rounded p-3 mb-3";
    row.innerHTML = `
      <div class="d-flex flex-column flex-md-row gap-3">
        <img src="${report.image_url || ""}" alt="Foto laporan" class="admin-thumb rounded border" />
        <div class="flex-grow-1">
          <p class="mb-1"><strong>#${report.id}</strong> - ${report.desc || "Tidak ada deskripsi"}</p>
          <p class="small text-secondary mb-2">${report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : ""}</p>
          <div class="row g-2 align-items-center">
            <div class="col-sm-6 col-md-4">
              <select class="form-select form-select-sm admin-status-select" data-id="${report.id}">
                ${selectOptions}
              </select>
            </div>
            <div class="col-sm-6 col-md-auto">
              <button class="btn btn-sm btn-dark admin-save-status" data-id="${report.id}">Simpan Status</button>
            </div>
          </div>
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

async function updateStatus(id, status) {
  const response = await fetch(API_BASE + "/admin/reports", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ id, status }),
  });

  if (response.status === 401) {
    throw new Error("Admin key salah.");
  }
  if (!response.ok) {
    throw new Error("Gagal update status.");
  }
}

function wireEvents() {
  document.getElementById("saveKeyBtn").addEventListener("click", function () {
    const value = document.getElementById("adminKey").value.trim();
    setAdminKey(value);
    loadAdminReports();
  });

  document.getElementById("adminList").addEventListener("click", async function (event) {
    const button = event.target.closest(".admin-save-status");
    if (!button) {
      return;
    }

    const reportId = Number(button.getAttribute("data-id"));
    const select = document.querySelector(
      `.admin-status-select[data-id="${reportId}"]`,
    );
    const nextStatus = select.value;

    button.disabled = true;
    button.textContent = "Menyimpan...";
    try {
      await updateStatus(reportId, nextStatus);
      button.textContent = "Tersimpan";
      await loadAdminReports();
    } catch (error) {
      console.error(error);
      button.textContent = "Gagal";
      alert(error.message);
    } finally {
      setTimeout(function () {
        button.disabled = false;
        button.textContent = "Simpan Status";
      }, 700);
    }
  });
}

function init() {
  const key = getAdminKey();
  document.getElementById("adminKey").value = key;
  wireEvents();
  if (key) {
    loadAdminReports();
  } else {
    showError("Masukkan admin key dulu untuk memuat laporan.");
  }
}

init();
