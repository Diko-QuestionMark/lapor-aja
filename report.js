const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const UPVOTE_STORAGE_KEY = "laporaja_upvoted_ids";
const SESSION_KEY = "laporaja_session_v1";
const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";
const COMMENT_MAX_LENGTH = 300;

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

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
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

function renderComments(comments) {
  const list = document.getElementById("commentList");
  if (!list) {
    return;
  }

  if (!Array.isArray(comments) || comments.length === 0) {
    list.innerHTML = '<p class="text-secondary small mb-0">Belum ada komentar.</p>';
    return;
  }

  list.innerHTML = comments
    .map(function (item) {
      const avatar = item.user_avatar_url || DEFAULT_AVATAR_URL;
      return `
        <article class="border rounded p-2 mb-2">
          <div class="d-flex align-items-start gap-2">
            <img
              src="${escapeHtml(avatar)}"
              alt="Avatar komentar"
              class="report-author-avatar"
              onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
            />
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <strong class="small">${escapeHtml(item.user_name || "Warga")}</strong>
                <span class="small text-secondary">${
                  item.created_at ? new Date(item.created_at).toLocaleString("id-ID") : "-"
                }</span>
              </div>
              <p class="small mb-0">${escapeHtml(item.comment || "")}</p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadComments(reportId) {
  const list = document.getElementById("commentList");
  if (!list) {
    return;
  }
  list.innerHTML = '<p class="text-secondary small mb-0">Memuat komentar...</p>';

  try {
    const response = await fetch(`${API_BASE}/report-comments?report_id=${reportId}`);
    if (!response.ok) {
      throw new Error("Gagal memuat komentar");
    }
    const comments = await response.json();
    renderComments(comments);
  } catch (_) {
    list.innerHTML = '<p class="text-danger small mb-0">Komentar gagal dimuat.</p>';
  }
}

function wireCommentForm(reportId) {
  const form = document.getElementById("commentForm");
  const input = document.getElementById("commentInput");
  const help = document.getElementById("commentHelp");
  const submitBtn = document.getElementById("commentSubmitBtn");
  if (!form || !input || !help || !submitBtn) {
    return;
  }

  const session = readSession();
  if (!session || !session.token) {
    input.disabled = true;
    submitBtn.disabled = true;
    help.className = "small text-secondary";
    help.innerHTML = 'Login dulu untuk berkomentar. <a href="/login.html">Masuk</a>';
    return;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const content = String(input.value || "").trim();
    if (!content) {
      help.className = "small text-danger";
      help.textContent = "Komentar tidak boleh kosong.";
      return;
    }
    if (content.length > COMMENT_MAX_LENGTH) {
      help.className = "small text-danger";
      help.textContent = `Komentar maksimal ${COMMENT_MAX_LENGTH} karakter.`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Mengirim...";
    help.className = "small text-secondary";
    help.textContent = "Menyimpan komentar...";

    try {
      const response = await fetch(`${API_BASE}/report-comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          report_id: reportId,
          comment: content,
        }),
      });
      const data = await response.json().catch(function () {
        return {};
      });
      if (response.status === 401) {
        help.className = "small text-danger";
        help.innerHTML = 'Sesi habis. <a href="/login.html">Login lagi</a>.';
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || "Komentar gagal dikirim.");
      }

      input.value = "";
      help.className = "small text-success";
      help.textContent = "Komentar berhasil dikirim.";
      await loadComments(reportId);
    } catch (error) {
      help.className = "small text-danger";
      help.textContent = error.message || "Komentar gagal dikirim.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Kirim Komentar";
    }
  });
}

function renderDetail(report) {
  const voted = hasUpvoted(report.id);
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
  const container = document.getElementById("detailContainer");
  const galleryId = `reportGallery${Number(report.id)}`;
  const galleryBlock =
    imageUrls.length === 0
      ? '<div class="detail-image rounded border mb-3 d-flex align-items-center justify-content-center text-secondary bg-light">Foto tidak tersedia</div>'
      : imageUrls.length === 1
      ? `<img
          src="${escapeHtml(imageUrls[0] || "")}"
          alt="Foto laporan"
          class="img-fluid rounded border mb-3 detail-image"
        />`
      : `
        <div class="mb-3">
          <div class="rounded border p-2 bg-light">
            <img
              id="${galleryId}Main"
              src="${escapeHtml(imageUrls[0])}"
              class="d-block w-100 detail-image rounded"
              alt="Foto laporan 1"
            />
          </div>
          <div class="d-flex align-items-center justify-content-between mt-2 gap-2">
            <button id="${galleryId}Prev" class="btn btn-sm btn-outline-primary" type="button">Prev</button>
            <div class="small text-secondary">
              <span id="${galleryId}Index">1</span> / ${imageUrls.length} foto
            </div>
            <button id="${galleryId}Next" class="btn btn-sm btn-outline-primary" type="button">Next</button>
          </div>
        </div>
      `;
  container.innerHTML = `
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
      <button id="detailVoteBtn" class="btn btn-sm support-btn ${voted ? "is-active" : ""}">
      <i class="bi ${voted ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}"></i>
      <span>${voted ? "Didukung" : "Dukung"}</span>
      <span class="support-count">${Number(report.upvotes || 0)}</span>
      </button>
    </div>

    <hr class="my-4" />
    <section>
      <h3 class="h6 mb-3">Komentar</h3>
      <form id="commentForm" class="mb-3">
        <div class="mb-2">
          <textarea
            id="commentInput"
            class="form-control"
            rows="3"
            maxlength="${COMMENT_MAX_LENGTH}"
            placeholder="Tulis komentar..."
          ></textarea>
        </div>
        <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <small id="commentHelp" class="text-secondary">Maksimal ${COMMENT_MAX_LENGTH} karakter.</small>
          <button id="commentSubmitBtn" class="btn btn-sm btn-primary" type="submit">
            Kirim Komentar
          </button>
        </div>
      </form>
      <div id="commentList"></div>
    </section>
  `;

  if (imageUrls.length > 1) {
    let activeIndex = 0;
    const main = document.getElementById(`${galleryId}Main`);
    const indexEl = document.getElementById(`${galleryId}Index`);
    const prevBtn = document.getElementById(`${galleryId}Prev`);
    const nextBtn = document.getElementById(`${galleryId}Next`);

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
      const nextUpvotes = currentlyVoted
        ? Math.max(Number(report.upvotes || 0) - 1, 0)
        : Number(report.upvotes || 0) + 1;
      report.upvotes = nextUpvotes;
      const nextVoted = !currentlyVoted;
      btn.classList.toggle("is-active", nextVoted);
      btn.innerHTML = `
        <i class="bi ${nextVoted ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}"></i>
        <span>${nextVoted ? "Didukung" : "Dukung"}</span>
        <span class="support-count">${nextUpvotes}</span>
      `;
    } catch (_) {
      btn.innerHTML = "Gagal, coba lagi";
      setTimeout(function () {
        btn.classList.toggle("is-active", currentlyVoted);
        btn.innerHTML = `
          <i class="bi ${currentlyVoted ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}"></i>
          <span>${currentlyVoted ? "Didukung" : "Dukung"}</span>
          <span class="support-count">${Number(report.upvotes || 0)}</span>
        `;
      }, 800);
    } finally {
      btn.disabled = false;
    }
  });

  wireCommentForm(report.id);
  loadComments(report.id);
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
