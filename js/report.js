const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const UPVOTE_STORAGE_KEY = "laporaja_upvoted_ids";
const SESSION_KEY = "laporaja_session_v1";
const DEFAULT_AVATAR_URL = "/img/defaultAvatar.jpg";
const COMMENT_MAX_LENGTH = 300;

async function loadResponseFeedback(reportId) {
  const root = document.getElementById("responseFeedbackWrap");
  if (!root) {
    return;
  }

  root.innerHTML = '<p class="small text-secondary mb-0">Memuat penilaian respons...</p>';
  try {
    const session = readSession();
    const headers = session && session.token ? { Authorization: `Bearer ${session.token}` } : {};
    const response = await fetch(`${API_BASE}/report-feedback?report_id=${reportId}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error("Gagal memuat penilaian respons.");
    }
    const data = await response.json();
    const myVote = data.my_vote;
    const helpfulCount = Number(data.helpful_count || 0);
    const unhelpfulCount = Number(data.unhelpful_count || 0);

    root.innerHTML = `
      <div class="d-flex align-items-center flex-wrap gap-2">
        <button
          id="feedbackHelpfulBtn"
          type="button"
          class="btn btn-sm feedback-icon-btn ${myVote === true ? "is-active" : ""}"
          aria-label="Membantu (${helpfulCount})"
          title="Membantu"
        >
          <i class="bi ${myVote === true ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}" aria-hidden="true"></i>
          <span class="ms-1">${helpfulCount}</span>
        </button>
        <button
          id="feedbackUnhelpfulBtn"
          type="button"
          class="btn btn-sm feedback-icon-btn ${myVote === false ? "is-active" : ""}"
          aria-label="Tidak membantu (${unhelpfulCount})"
          title="Tidak membantu"
        >
          <i class="bi ${myVote === false ? "bi-hand-thumbs-down-fill" : "bi-hand-thumbs-down"}" aria-hidden="true"></i>
          <span class="ms-1">${unhelpfulCount}</span>
        </button>
      </div>
      <p id="feedbackHelpText" class="small text-secondary mb-0 mt-2"></p>
    `;

    const helpfulBtn = document.getElementById("feedbackHelpfulBtn");
    const unhelpfulBtn = document.getElementById("feedbackUnhelpfulBtn");
    const helpText = document.getElementById("feedbackHelpText");

    async function sendFeedback(helpful) {
      const currentSession = readSession();
      if (!currentSession || !currentSession.token) {
        window.location.href = "/login.html";
        return;
      }

      helpfulBtn.disabled = true;
      unhelpfulBtn.disabled = true;
      helpText.textContent = "Menyimpan penilaian...";
      try {
        const save = await fetch(`${API_BASE}/report-feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentSession.token}`,
          },
          body: JSON.stringify({ report_id: reportId, helpful }),
        });
        const payload = await save.json().catch(function () {
          return {};
        });
        if (save.status === 401) {
          window.location.href = "/login.html";
          return;
        }
        if (!save.ok) {
          throw new Error(payload.error || "Gagal menyimpan penilaian.");
        }
        helpText.textContent = "Penilaian tersimpan.";
        await loadResponseFeedback(reportId);
      } catch (error) {
        helpText.textContent = error.message || "Gagal menyimpan penilaian.";
      } finally {
        helpfulBtn.disabled = false;
        unhelpfulBtn.disabled = false;
      }
    }

    helpfulBtn.addEventListener("click", function () {
      sendFeedback(true);
    });
    unhelpfulBtn.addEventListener("click", function () {
      sendFeedback(false);
    });
  } catch (_) {
    root.innerHTML = '<p class="small text-danger mb-0">Penilaian respons tidak bisa dimuat.</p>';
  }
}

async function loadStatusHistory(reportId) {
  const root = document.getElementById("statusHistoryList");
  if (!root) {
    return;
  }

  root.innerHTML = '<p class="small text-secondary mb-0">Memuat histori...</p>';
  try {
    const session = readSession();
    const headers = session && session.token ? { Authorization: `Bearer ${session.token}` } : {};
    const response = await fetch(`${API_BASE}/report-status-history?report_id=${reportId}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error("Gagal memuat histori status.");
    }
    const items = await response.json();
    if (!Array.isArray(items) || items.length === 0) {
      root.innerHTML = '<p class="small text-secondary mb-0">Belum ada histori.</p>';
      return;
    }
    root.innerHTML = items
      .map(function (item) {
        const note = String(item.admin_note || "").trim();
        const evidence = String(item.admin_evidence_url || "").trim();
        return `
          <article class="status-history-item">
            <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap">
              <span class="badge status-badge ${getStatusMeta(item.status).className}">${item.status}</span>
              <span class="small text-secondary">${
                item.updated_at ? new Date(item.updated_at).toLocaleString("id-ID") : "-"
              }</span>
            </div>
            ${item.updated_by ? `<p class="small text-secondary mb-1">Oleh: ${escapeHtml(item.updated_by)}</p>` : ""}
            ${note ? `<p class="small mb-1">${escapeHtml(note)}</p>` : ""}
            ${
              evidence
                ? `<a class="small" href="${escapeHtml(evidence)}" target="_blank" rel="noopener noreferrer">Lihat bukti</a>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  } catch (_) {
    root.innerHTML = '<p class="small text-danger mb-0">Histori tidak bisa dimuat.</p>';
  }
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

function getResponsePanelClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "diproses") {
    return "response-panel-diproses";
  }
  if (normalized === "selesai") {
    return "response-panel-selesai";
  }
  return "response-panel-menunggu";
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

function renderDetailSkeleton() {
  const container = document.getElementById("detailContainer");
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="report-detail-layout detail-skeleton" aria-hidden="true">
      <section class="report-detail-block">
        <div class="report-title-row">
          <div class="report-title-main">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-subtitle"></div>
          </div>
          <div class="skeleton-pill skeleton-vote"></div>
        </div>
      </section>

      <section class="report-detail-block">
        <div class="report-photo-head">
          <div class="skeleton-line skeleton-section-title"></div>
          <div class="skeleton-pill skeleton-status"></div>
        </div>
        <div class="skeleton-image"></div>
        <div class="skeleton-gallery-row">
          <div class="skeleton-btn"></div>
          <div class="skeleton-line skeleton-gallery-index"></div>
          <div class="skeleton-btn"></div>
        </div>
      </section>

      <section class="report-detail-block">
        <div class="skeleton-line skeleton-section-title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line-short"></div>
      </section>

      <section class="report-detail-block">
        <div class="skeleton-line skeleton-section-title"></div>
        <div class="skeleton-panel">
          <div class="skeleton-line"></div>
          <div class="skeleton-line skeleton-line-short"></div>
          <div class="skeleton-line skeleton-meta-time"></div>
        </div>
        <div class="skeleton-feedback-row">
          <div class="skeleton-pill skeleton-feedback-pill"></div>
          <div class="skeleton-pill skeleton-feedback-pill"></div>
        </div>
      </section>

      <section class="report-detail-block">
        <div class="skeleton-line skeleton-section-title"></div>
        <div class="skeleton-meta-grid">
          <div class="skeleton-meta-item">
            <div class="skeleton-line skeleton-meta-label"></div>
            <div class="skeleton-line skeleton-meta-value"></div>
          </div>
          <div class="skeleton-meta-item">
            <div class="skeleton-line skeleton-meta-label"></div>
            <div class="skeleton-line skeleton-meta-value"></div>
          </div>
          <div class="skeleton-meta-item">
            <div class="skeleton-line skeleton-meta-label"></div>
            <div class="skeleton-line skeleton-meta-value"></div>
          </div>
          <div class="skeleton-meta-item">
            <div class="skeleton-line skeleton-meta-label"></div>
            <div class="skeleton-line skeleton-meta-value"></div>
          </div>
        </div>
      </section>

      <section class="report-detail-block">
        <div class="skeleton-line skeleton-section-title"></div>
        <div class="skeleton-comment-input"></div>
        <div class="skeleton-comment-form-row">
          <div class="skeleton-line skeleton-comment-help"></div>
          <div class="skeleton-pill skeleton-comment-btn"></div>
        </div>
        <div class="skeleton-comment-item">
          <div class="skeleton-comment-avatar"></div>
          <div class="skeleton-comment-main">
            <div class="skeleton-line skeleton-comment-head"></div>
            <div class="skeleton-line"></div>
          </div>
        </div>
        <div class="skeleton-comment-item">
          <div class="skeleton-comment-avatar"></div>
          <div class="skeleton-comment-main">
            <div class="skeleton-line skeleton-comment-head"></div>
            <div class="skeleton-line skeleton-line-short"></div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function formatLocation(report) {
  const label = String(report.location_label || "").trim();
  if (label) {
    return label;
  }
  const hasLocation = report.lat !== null && report.lat !== undefined;
  return hasLocation
    ? `${Number(report.lat).toFixed(5)}, ${Number(report.lng).toFixed(5)}`
    : "Lokasi tidak tersedia";
}

function renderComments(comments, isAdmin) {
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
      const isDeleted = Boolean(item.is_deleted);
      const deleteReason = String(item.delete_reason || "").trim();
      const commentBody = isDeleted
        ? `<em class="text-secondary">Komentar dihapus oleh admin${deleteReason ? `: ${escapeHtml(deleteReason)}` : "."}</em>`
        : escapeHtml(item.comment || "");
      const deleteBtn =
        isAdmin && !isDeleted
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-comment-delete="${Number(item.id)}">Hapus</button>`
          : "";
      return `
        <article class="report-comment-card">
          <div class="d-flex align-items-start gap-2">
            <img
              src="${escapeHtml(avatar)}"
              alt="Avatar komentar"
              class="report-author-avatar"
              onerror="this.src='${escapeHtml(DEFAULT_AVATAR_URL)}'"
            />
            <div class="flex-grow-1">
              <div class="report-comment-meta-row">
                <strong class="small">${escapeHtml(item.user_name || "Warga")}</strong>
                <span class="small text-secondary">${
                  item.created_at ? formatTimeAgo(item.created_at) : "-"
                }</span>
              </div>
              <p class="small mb-0">${commentBody}</p>
              ${deleteBtn ? `<div class="mt-2">${deleteBtn}</div>` : ""}
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
    const session = readSession();
    const isAdmin = Boolean(session && String(session.role || "").toLowerCase() === "admin");
    renderComments(comments, isAdmin);
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
  const responsePanelClass = getResponsePanelClass(report.status);
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
  const reporterText = `${reporterName} (${reporterEmail})`;
  const reporterMetaItem =
    reporterUserId > 0
      ? `
          <a
            class="report-detail-meta-item-link"
            href="/user.html?id=${reporterUserId}"
            aria-label="Lihat profil pelapor ${reporterName}"
          >
            <span class="report-detail-meta-label"><i class="bi bi-person"></i>Pelapor</span>
            <span class="report-detail-meta-value">${reporterText}</span>
          </a>
        `
      : `
          <span class="report-detail-meta-label"><i class="bi bi-person"></i>Pelapor</span>
          <span class="report-detail-meta-value">${reporterText}</span>
        `;
  const agencyLabel = String(report.agency || "Umum");
  const safeAgencyLabel = escapeHtml(agencyLabel);
  const locationText = escapeHtml(formatLocation(report));
  const agencyMetaItem = `
    <a
      class="report-detail-meta-item-link"
      href="/index.html?agency=${encodeURIComponent(agencyLabel)}"
      aria-label="Lihat laporan instansi ${safeAgencyLabel}"
    >
      <span class="report-detail-meta-label"><i class="bi bi-building"></i>Instansi</span>
      <span class="report-detail-meta-value">${safeAgencyLabel}</span>
    </a>
  `;
  const locationMetaItem = hasLocation
    ? `
        <a
          class="report-detail-meta-item-link"
          href="https://www.google.com/maps?q=${Number(report.lat)},${Number(report.lng)}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Buka lokasi laporan ${locationText}"
        >
          <span class="report-detail-meta-label"><i class="bi bi-geo-alt"></i>Lokasi</span>
          <span class="report-detail-meta-value">${locationText}</span>
        </a>
      `
    : `
        <span class="report-detail-meta-label"><i class="bi bi-geo-alt meta-icon-muted"></i>Lokasi</span>
        <span class="report-detail-meta-value">${locationText}</span>
      `;
  const adminNote = String(report.admin_note || "").trim();
  const adminEvidence = String(report.admin_evidence_url || "").trim();
  const hasAdminResponse = Boolean(adminNote || adminEvidence || report.admin_updated_at);
  const createdAtLabel = report.created_at ? new Date(report.created_at).toLocaleString("id-ID") : "-";
  const createdAtMetaLabel = report.created_at ? formatTimeAgo(report.created_at) : "-";
  const container = document.getElementById("detailContainer");
  const galleryId = `reportGallery${Number(report.id)}`;
  const galleryBlock =
    imageUrls.length === 0
      ? '<div class="detail-image report-detail-image-placeholder rounded border d-flex align-items-center justify-content-center text-secondary bg-light">Foto tidak tersedia</div>'
      : imageUrls.length === 1
      ? `<a href="${escapeHtml(imageUrls[0] || "")}" target="_blank" rel="noopener noreferrer" class="report-image-link">
          <img
            src="${escapeHtml(imageUrls[0] || "")}"
            alt="Foto laporan"
            class="img-fluid rounded border detail-image report-detail-main-image"
          />
        </a>`
      : `
        <div class="report-detail-gallery">
          <a
            id="${galleryId}Link"
            href="${escapeHtml(imageUrls[0])}"
            target="_blank"
            rel="noopener noreferrer"
            class="report-image-link"
          >
            <img
              id="${galleryId}Main"
              src="${escapeHtml(imageUrls[0])}"
              class="d-block w-100 detail-image rounded report-detail-main-image"
              alt="Foto laporan 1"
            />
          </a>
          <div class="d-flex align-items-center justify-content-between mt-2 gap-2">
            <button id="${galleryId}Prev" class="btn btn-sm btn-outline-primary report-gallery-nav-btn" type="button">Prev</button>
            <div class="small text-secondary">
              <span id="${galleryId}Index">1</span> / ${imageUrls.length} foto
            </div>
            <button id="${galleryId}Next" class="btn btn-sm btn-outline-primary report-gallery-nav-btn" type="button">Next</button>
          </div>
        </div>
      `;
  container.innerHTML = `
    <div class="report-detail-layout">
      <section class="report-detail-block report-detail-header-block">
        <div class="report-title-row">
          <div class="report-title-main">
            <h2 class="report-detail-title mb-0">${escapeHtml(report.title || "Tanpa Judul")}</h2>
            <p class="report-detail-subtitle mb-0">${createdAtLabel}</p>
          </div>
          <button id="detailVoteBtn" class="btn btn-sm support-btn ${voted ? "is-active" : ""}">
            <i class="bi ${voted ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}"></i>
            <span>${voted ? "Didukung" : "Dukung"}</span>
            <span class="support-count">${Number(report.upvotes || 0)}</span>
          </button>
        </div>
      </section>

      <section class="report-detail-block">
        <div class="report-photo-head">
          <h3 class="report-detail-section-title mb-0">Foto Laporan</h3>
          <span class="badge status-badge ${statusMeta.className}">${statusMeta.label}</span>
        </div>
        ${galleryBlock}
      </section>

      <section class="report-detail-block">
        <h3 class="report-detail-section-title">Deskripsi</h3>
        <p class="report-detail-description mb-0">${escapeHtml(report.desc || "Tidak ada deskripsi")}</p>
      </section>

      <section class="report-detail-block report-response-section">
        <h3 class="report-detail-section-title">Respons Instansi</h3>
        ${
          hasAdminResponse
            ? `
              <div class="response-panel ${responsePanelClass}">
                <p class="mb-2">${escapeHtml(adminNote || "Instansi sudah memberi update.")}</p>
                ${
                  adminEvidence
                    ? `
                      <div class="evidence-preview">
                        <a href="${escapeHtml(adminEvidence)}" target="_blank" rel="noopener noreferrer">
                          <img
                            src="${escapeHtml(adminEvidence)}"
                            alt="Bukti tindak lanjut instansi"
                            class="evidence-thumb"
                            loading="lazy"
                          />
                        </a>
                      </div>
                    `
                    : ""
                }
                <p class="small text-secondary mb-0 response-panel-meta">
                  ${
                    report.admin_updated_at
                      ? `Diperbarui ${new Date(report.admin_updated_at).toLocaleString("id-ID")}`
                      : "Belum ada waktu update"
                  }
                  ${report.admin_updated_by ? ` oleh ${escapeHtml(report.admin_updated_by)}` : ""}
                </p>
              </div>
              <div id="responseFeedbackWrap" class="mt-2"></div>
            `
            : '<div class="response-panel response-panel-empty"><p class="small text-secondary mb-0">Belum ada respons resmi dari instansi.</p></div>'
        }
      </section>

      <section class="report-detail-block">
        <h3 class="report-detail-section-title">Informasi Laporan</h3>
        <div class="report-detail-meta-grid">
          <div class="report-detail-meta-item">
            ${agencyMetaItem}
          </div>
          <div class="report-detail-meta-item">
            ${reporterMetaItem}
          </div>
          <div class="report-detail-meta-item">
            ${locationMetaItem}
          </div>
          <div class="report-detail-meta-item">
            <span class="report-detail-meta-label"><i class="bi bi-clock"></i>Waktu</span>
            <span class="report-detail-meta-value">${createdAtMetaLabel}</span>
          </div>
        </div>
      </section>

      <section class="report-detail-block">
        <h3 class="report-detail-section-title">Komentar</h3>
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
    </div>
  `;

  if (imageUrls.length > 1) {
    let activeIndex = 0;
    const main = document.getElementById(`${galleryId}Main`);
    const link = document.getElementById(`${galleryId}Link`);
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
      if (link) {
        link.href = imageUrls[activeIndex];
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
  if (hasAdminResponse) {
    loadResponseFeedback(report.id);
  }

  const commentList = document.getElementById("commentList");
  if (commentList) {
    commentList.addEventListener("click", async function (event) {
      const btn = event.target.closest("[data-comment-delete]");
      if (!btn) {
        return;
      }
      const commentId = Number(btn.getAttribute("data-comment-delete"));
      if (!commentId || Number.isNaN(commentId)) {
        return;
      }
      const reason = window.prompt("Alasan penghapusan komentar:");
      if (!reason || String(reason).trim().length < 3) {
        window.alert("Alasan minimal 3 karakter.");
        return;
      }
      const session = readSession();
      if (!session || !session.token) {
        window.location.href = "/login.html";
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/report-comments`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ id: commentId, reason: String(reason).trim() }),
        });
        const payload = await response.json().catch(function () {
          return {};
        });
        if (!response.ok) {
          throw new Error(payload.error || "Gagal menghapus komentar.");
        }
        await loadComments(report.id);
      } catch (error) {
        window.alert(error.message || "Gagal menghapus komentar.");
      }
    });
  }
}

async function init() {
  const id = getReportId();
  if (!id || Number.isNaN(id)) {
    renderNotFound("ID laporan tidak valid.");
    return;
  }

  const session = readSession();
  const role = String((session && session.role) || "").toLowerCase();
  if (session && session.token && role === "admin") {
    window.location.href = `/admin/report.html?id=${id}`;
    return;
  }

  renderDetailSkeleton();

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
