(function () {
  const API_BASE =
    window.LAPORAJA_API_BASE ||
    (window.location.protocol === "file:" ? "http://localhost:3000" : window.location.origin);
  const SESSION_KEY = "laporaja_session_v1";
  const NOTIFICATION_TYPE_FILTER = Object.freeze({
    all: "all",
    government: "government_update",
    comment: "comment",
  });
  let notifItems = [];
  let notifFilterMode = NOTIFICATION_TYPE_FILTER.all;

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

  function getById() {
    for (const id of arguments) {
      const element = document.getElementById(id);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function formatTimeAgo(value) {
    if (!value) {
      return "";
    }
    const ts = new Date(value).getTime();
    if (!ts || Number.isNaN(ts)) {
      return "";
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

  function getPageKey() {
    const path = (window.location.pathname || "/").toLowerCase();
    if (path === "/" || path.endsWith("/index.html")) return "index";
    if (path.endsWith("/login.html")) return "login";
    if (path.endsWith("/profile.html")) return "profile";
    if (path.endsWith("/report.html")) return "report";
    if (path.endsWith("/admin-report.html")) return "admin-report";
    if (path.endsWith("/user.html")) return "user";
    if (path.endsWith("/admin.html")) return "admin";
    if (path.endsWith("/rekap.html")) return "rekap";
    return "index";
  }

  function getNavbarConfig() {
    const key = getPageKey();
    const authRightHtml = `
      <a
        id="auth-action-btn"
        href="/login.html"
        class="btn btn-sm d-inline-flex align-items-center gap-2 nav-plain-btn"
      >
        <span id="nav-avatar-wrap" class="nav-avatar-wrap d-none">
          <img id="auth-user-avatar" class="nav-avatar" alt="Avatar user" />
        </span>
        <span id="auth-action-text" class="nav-auth-text">Login</span>
      </a>
    `;
    const userRightHtml = `
      <div class="d-flex align-items-center gap-2 nav-right-wrap">
        <button
          id="nav-search-toggle"
          type="button"
          class="btn btn-sm nav-plain-btn nav-search-toggle"
          aria-label="Cari laporan"
        >
          <i class="bi bi-search"></i>
        </button>
        <button
          id="nav-search-back"
          type="button"
          class="btn btn-sm nav-plain-btn nav-search-back"
          aria-label="Tutup pencarian"
        >
          <i class="bi bi-arrow-left"></i>
        </button>
        <div class="nav-search-wrap">
          <input
            id="search-input"
            type="search"
            class="form-control form-control-sm nav-search-input"
            placeholder="Cari laporan..."
            autocomplete="off"
          />
        </div>
        <button
          id="nav-filter-toggle"
          type="button"
          class="btn btn-sm nav-plain-btn nav-filter-toggle"
          aria-label="Filter laporan"
        >
          <i class="bi bi-funnel"></i>
        </button>
        <button
          id="create-report-btn"
          type="button"
          class="btn btn-sm btn-primary nav-create-btn"
          aria-label="Buat laporan"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Buat</span>
        </button>
        <button
          id="nav-notif-toggle"
          type="button"
          class="btn btn-sm nav-plain-btn nav-notif-toggle"
          aria-label="Notifikasi"
        >
          <i class="bi bi-bell"></i>
          <span id="nav-notif-badge" class="nav-notif-badge d-none">0</span>
        </button>
        ${authRightHtml}
      </div>
    `;
    const leftHamburger = `
      <button
        id="nav-menu-toggle"
        type="button"
        class="btn btn-sm nav-plain-btn nav-menu-toggle"
        aria-label="Buka menu"
      >
        <i class="bi bi-list"></i>
      </button>
    `;
    const byPage = {
      index: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Laporkan masalah kota dengan cepat",
        leftHtml: leftHamburger,
        rightHtml: userRightHtml,
      },
      login: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Portal Masuk",
        leftHtml: leftHamburger,
        rightHtml: userRightHtml,
      },
      profile: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Profil Akun",
        leftHtml: leftHamburger,
        rightHtml: userRightHtml,
      },
      report: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Detail laporan warga",
        leftHtml: leftHamburger,
        rightHtml: userRightHtml,
      },
      user: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Profil Pelapor",
        leftHtml: leftHamburger,
        rightHtml: userRightHtml,
      },
      admin: {
        navClass: "navbar-dark bg-dark",
        brandText: "Admin LaporAja",
        subtitle: "Kelola status laporan warga",
        leftHtml: "",
        rightHtml:
          '<a href="/index.html" class="btn btn-sm nav-plain-btn" data-confirm-user-dashboard="1">Ke Halaman User</a>',
      },
      "admin-report": {
        navClass: "navbar-dark bg-dark",
        brandText: "Admin LaporAja",
        subtitle: "Detail penanganan laporan",
        leftHtml: "",
        rightHtml: '<a href="/admin.html" class="btn btn-sm nav-plain-btn">Kembali</a>',
      },
      rekap: {
        navClass: "navbar-dark bg-dark",
        brandText: "Admin LaporAja",
        subtitle: "Rekap laporan warga",
        leftHtml: "",
        rightHtml: '<a href="/admin.html" class="btn btn-sm nav-plain-btn">Kembali</a>',
      },
    };
    return byPage[key] || byPage.index;
  }

  async function loadNavbarTemplate() {
    try {
      const response = await fetch("/components/navbar.html", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Gagal memuat komponen navbar");
      }
      return await response.text();
    } catch (_) {
      return `
        <nav class="navbar __NAV_CLASS__">
          <div class="container d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-2">
              __LEFT_SLOT__
              <h1 class="h4 mb-0">
                <a href="/index.html" class="text-white text-decoration-none">__BRAND_TEXT__</a>
              </h1>
            </div>
            __RIGHT_SLOT__
          </div>
        </nav>
      `;
    }
  }

  async function renderNavbar() {
    const mount = getById("navbar-mount", "navbarMount");
    if (!mount) return;

    const config = getNavbarConfig();
    const template = await loadNavbarTemplate();
    const html = template
      .replace("__NAV_CLASS__", escapeHtml(config.navClass))
      .replace("__BRAND_TEXT__", escapeHtml(config.brandText))
      .replace("__SUBTITLE__", escapeHtml(config.subtitle))
      .replace("__LEFT_SLOT__", config.leftHtml || "")
      .replace("__RIGHT_SLOT__", config.rightHtml || "");

    mount.innerHTML = html;
    if (!getById("nav-side-panel", "navSidePanel")) {
      const sideHtml = `
        <div id="nav-side-overlay" class="nav-side-overlay"></div>
        <aside id="nav-side-panel" class="nav-side-panel" aria-hidden="true">
          <div class="nav-side-header">
            <div class="nav-side-brand">
              <button id="nav-side-close" type="button" class="btn btn-sm nav-plain-btn nav-side-close" aria-label="Tutup menu">
                <i class="bi bi-list"></i>
              </button>
              <a href="/index.html" class="nav-brand-link nav-side-brand-link">
                <img src="/img/icon.png" alt="Logo" class="nav-brand-logo" />
                <span class="nav-brand-text">
                  <span class="nav-brand-title">LaporAja</span>
                </span>
              </a>
            </div>
          </div>
          <nav class="nav-side-links">
            <a href="/index.html"><i class="bi bi-house-door"></i><span>Beranda</span></a>
            <a href="/profile.html" data-nav-notif-link="1"><i class="bi bi-bell"></i><span>Notifikasi</span></a>
            <a id="nav-side-auth-link" href="/login.html">
              <i class="bi bi-box-arrow-in-right" id="nav-side-auth-icon"></i>
              <span id="nav-side-auth-label">Login</span>
            </a>
          </nav>
        </aside>
      `;
      mount.insertAdjacentHTML("beforeend", sideHtml);
    }
    if (!getById("nav-notif-modal", "navNotifModal")) {
      const notifHtml = `
        <div class="modal fade notif-modal" id="nav-notif-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h2 class="modal-title fs-6">Notifikasi</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary notif-filter-btn"
                    data-bs-toggle="collapse"
                    data-bs-target="#notif-filter-panel"
                    aria-expanded="false"
                    aria-controls="notif-filter-panel"
                  >
                    <i class="bi bi-funnel me-1"></i>
                    <span>Filter</span>
                  </button>
                </div>
                <div id="notif-filter-panel" class="collapse">
                  <div class="notif-filter-panel">
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="notifFilter"
                        id="notif-filter-all"
                        value="all"
                        checked
                      />
                      <label class="form-check-label" for="notif-filter-all">Semua notifikasi</label>
                    </div>
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="notifFilter"
                        id="notif-filter-government"
                        value="government_update"
                      />
                      <label class="form-check-label" for="notif-filter-government">Update Pemerintah</label>
                    </div>
                    <div class="form-check">
                      <input
                        class="form-check-input"
                        type="radio"
                        name="notifFilter"
                        id="notif-filter-comment"
                        value="comment"
                      />
                      <label class="form-check-label" for="notif-filter-comment">Komentar</label>
                    </div>
                  </div>
                </div>
                <div id="nav-notif-list" class="notif-list">
                  <p class="text-secondary small mb-0">Buka notifikasi untuk memuat data terbaru.</p>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Selesai</button>
              </div>
            </div>
          </div>
        </div>
      `;
      mount.insertAdjacentHTML("beforeend", notifHtml);
    }
    const backBtn = mount.querySelector("[data-nav-back='1']");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        window.location.href = "/index.html";
      });
    }
    const userDashBtn = mount.querySelector("[data-confirm-user-dashboard='1']");
    if (userDashBtn) {
      userDashBtn.addEventListener("click", function (event) {
        const ok = window.confirm(
          "Kembali ke dashboard user? Perubahan yang belum disimpan bisa hilang.",
        );
        if (!ok) {
          event.preventDefault();
        }
      });
    }
    document.dispatchEvent(new CustomEvent("navbar:ready"));
  }

  function getNotifListRoot() {
    return getById("nav-notif-list", "navNotifList");
  }

  function getFilteredNotifItems() {
    if (notifFilterMode === NOTIFICATION_TYPE_FILTER.all) {
      return notifItems.slice();
    }
    return notifItems.filter(function (item) {
      return String(item.type || "") === notifFilterMode;
    });
  }

  function getNotifTypeLabel(type) {
    const normalized = String(type || "");
    if (normalized === NOTIFICATION_TYPE_FILTER.government) {
      return "Update Pemerintah";
    }
    if (normalized === NOTIFICATION_TYPE_FILTER.comment) {
      return "Komentar";
    }
    return "Notifikasi";
  }

  function renderNotificationListState(message, extraClassName) {
    const list = getNotifListRoot();
    if (!list) {
      return;
    }
    const className = extraClassName ? ` ${extraClassName}` : "";
    list.innerHTML = `<p class="small mb-0${className}">${escapeHtml(message)}</p>`;
  }

  function renderNotificationListSkeleton() {
    const list = getNotifListRoot();
    if (!list) {
      return;
    }
    list.innerHTML = `
      <div class="notif-skeleton-item" aria-hidden="true">
        <div class="notif-skeleton-line w-75"></div>
        <div class="notif-skeleton-line w-100"></div>
        <div class="notif-skeleton-line notif-skeleton-line-sm w-50"></div>
      </div>
      <div class="notif-skeleton-item" aria-hidden="true">
        <div class="notif-skeleton-line w-100"></div>
        <div class="notif-skeleton-line w-75"></div>
        <div class="notif-skeleton-line notif-skeleton-line-sm w-25"></div>
      </div>
      <div class="notif-skeleton-item" aria-hidden="true">
        <div class="notif-skeleton-line w-75"></div>
        <div class="notif-skeleton-line w-100"></div>
        <div class="notif-skeleton-line notif-skeleton-line-sm w-50"></div>
      </div>
    `;
  }

  function renderNotificationList() {
    const list = getNotifListRoot();
    if (!list) {
      return;
    }
    const items = getFilteredNotifItems();
    if (items.length === 0) {
      renderNotificationListState("Belum ada notifikasi untuk filter ini.", " text-secondary");
      return;
    }
    list.innerHTML = items
      .map(function (item) {
        const reportId = Number(item.report_id || 0);
        const typeLabel = getNotifTypeLabel(item.type);
        const createdAtLabel = formatTimeAgo(item.created_at);
        const unreadClass = item.is_read ? "" : " is-unread";
        const titleClampClass =
          String(item.type || "") === NOTIFICATION_TYPE_FILTER.government ? " text-truncate-2" : "";
        return `
          <button
            type="button"
            class="notif-item notif-item-btn${unreadClass}"
            data-notif-id="${escapeHtml(item.id)}"
            data-notif-link="${escapeHtml(item.link || "")}"
          >
            <div class="d-flex align-items-start justify-content-between gap-2">
              <div>
                <div class="notif-title${titleClampClass}">${escapeHtml(item.message || "Ada update baru.")}</div>
                <div class="small text-secondary">${escapeHtml(item.title || "Laporan Warga")} (#${reportId})</div>
              </div>
              <span class="notif-type-badge">${escapeHtml(typeLabel)}</span>
            </div>
            <div class="notif-meta">${escapeHtml(createdAtLabel)}</div>
          </button>
        `;
      })
      .join("");
  }

  async function fetchNotifications() {
    const session = readSession();
    if (!session || !session.token) {
      notifItems = [];
      updateNotificationBadge(0);
      renderNotificationListState("Login untuk melihat notifikasi.", " text-secondary");
      return;
    }

    renderNotificationListSkeleton();
    const response = await fetch(`${API_BASE}/notifications?limit=50`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (response.status === 401) {
      notifItems = [];
      updateNotificationBadge(0);
      renderNotificationListState("Sesi habis. Silakan login ulang.", " text-danger");
      return;
    }
    if (!response.ok) {
      throw new Error("Gagal memuat notifikasi");
    }
    const payload = await response.json();
    notifItems = Array.isArray(payload.items) ? payload.items : [];
    updateNotificationBadge(Number(payload.unread_count || 0));
    renderNotificationList();
  }

  async function markNotificationRead(notificationId) {
    const session = readSession();
    if (!session || !session.token || !notificationId) {
      return null;
    }
    const response = await fetch(`${API_BASE}/notifications`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ id: notificationId }),
    });
    if (!response.ok) {
      return null;
    }
    return response.json().catch(function () {
      return null;
    });
  }

  async function refreshNotificationBadge() {
    const session = readSession();
    if (!session || !session.token) {
      updateNotificationBadge(0);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/notifications?limit=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      updateNotificationBadge(Number(payload.unread_count || 0));
    } catch (_) {
      // no-op: keep existing badge state
    }
  }

  function updateNotificationBadge(count) {
    const badge = getById("nav-notif-badge", "navNotifBadge");
    if (!badge) {
      return;
    }
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount <= 0) {
      badge.classList.add("d-none");
      return;
    }
    badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
    badge.classList.remove("d-none");
  }


  function initAuthNav() {
    const actionBtn = getById("auth-action-btn", "authActionBtn");
    const avatar = getById("auth-user-avatar", "authUserAvatar");
    const avatarWrap = getById("nav-avatar-wrap", "navAvatarWrap");
    const actionText = getById("auth-action-text", "authActionText");
    if (!actionBtn || !actionText || !avatar || !avatarWrap) {
      return;
    }
    const session = readSession();

    const sideAuthLink = getById("nav-side-auth-link", "navSideAuthLink");
    const sideAuthLabel = getById("nav-side-auth-label", "navSideAuthLabel");
    const sideAuthIcon = getById("nav-side-auth-icon", "navSideAuthIcon");
    if (!session || !session.email || !session.token) {
      document.body.classList.remove("nav-auth-logged-in");
      actionBtn.href = "/login.html";
      actionText.textContent = "Login";
      avatarWrap.classList.add("d-none");
      avatar.removeAttribute("src");
      if (sideAuthLink) {
        sideAuthLink.href = "/login.html";
        if (sideAuthLabel) {
          sideAuthLabel.textContent = "Login";
        }
        if (sideAuthIcon) {
          sideAuthIcon.className = "bi bi-box-arrow-in-right";
        }
      }
      return;
    }

    document.body.classList.add("nav-auth-logged-in");
    actionText.textContent = `Halo, ${session.name || session.email}`;
    actionBtn.href = "/profile.html";
    avatar.src = session.profile_image_url || "/img/defaultAvatar.jpg";
    avatarWrap.classList.remove("d-none");
    avatar.onerror = function () {
      avatar.src = "/img/defaultAvatar.jpg";
    };
    if (sideAuthLink) {
      sideAuthLink.href = "/profile.html";
      if (sideAuthLabel) {
        sideAuthLabel.textContent = "Profil";
      }
      if (sideAuthIcon) {
        sideAuthIcon.className = "bi bi-person-circle";
      }
    }
    refreshNotificationBadge();
  }

  renderNavbar();
  document.addEventListener("navbar:ready", initAuthNav);
  document.addEventListener("navbar:ready", function () {
    const toggleBtn = getById("nav-search-toggle", "navSearchToggle");
    const backBtn = getById("nav-search-back", "navSearchBack");
    const searchInput = getById("search-input", "searchInput");
    if (!toggleBtn || !searchInput || !backBtn) {
      return;
    }
    const pageKey = getPageKey();
    let suppressBlurClose = false;
    function openSearch() {
      document.body.classList.add("nav-search-active");
      searchInput.focus();
    }

    function closeSearch() {
      document.body.classList.remove("nav-search-active");
      toggleBtn.blur();
    }

    toggleBtn.addEventListener("click", function () {
      if (document.body.classList.contains("nav-search-active")) {
        closeSearch();
        return;
      }
      openSearch();
    });
    backBtn.addEventListener("click", function () {
      closeSearch();
    });

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
      if (event.key === "Enter") {
        const value = String(searchInput.value || "").trim();
        if (pageKey !== "index") {
          const target = value ? `/index.html?q=${encodeURIComponent(value)}` : "/index.html";
          window.location.href = target;
        }
      }
    });


    searchInput.addEventListener("blur", function () {
      if (suppressBlurClose) {
        return;
      }
      if (window.matchMedia("(max-width: 640px)").matches) {
        closeSearch();
      }
    });

    const filterBtn = getById("nav-filter-toggle", "navFilterToggle");
    if (filterBtn) {
      const suppress = function () {
        suppressBlurClose = true;
        window.setTimeout(function () {
          suppressBlurClose = false;
        }, 200);
      };
      filterBtn.addEventListener("mousedown", suppress);
      filterBtn.addEventListener("touchstart", suppress, { passive: true });
    }
  });
  document.addEventListener("navbar:ready", function () {
    const createBtn = getById("create-report-btn", "createReportBtn");
    if (!createBtn) {
      return;
    }
    const pageKey = getPageKey();
    if (pageKey === "index") {
      return;
    }
    createBtn.addEventListener("click", function () {
      window.location.href = "/index.html";
    });
  });
  document.addEventListener("navbar:ready", function () {
    const menuBtn = getById("nav-menu-toggle", "navMenuToggle");
    const overlay = getById("nav-side-overlay", "navSideOverlay");
    const panel = getById("nav-side-panel", "navSidePanel");
    const closeBtn = getById("nav-side-close", "navSideClose");
    if (!menuBtn || !overlay || !panel || !closeBtn) {
      return;
    }

    function openSide() {
      document.body.classList.add("nav-side-open");
      panel.setAttribute("aria-hidden", "false");
    }

    function closeSide() {
      document.body.classList.remove("nav-side-open");
      panel.setAttribute("aria-hidden", "true");
    }

    menuBtn.addEventListener("click", function () {
      if (document.body.classList.contains("nav-side-open")) {
        closeSide();
        return;
      }
      openSide();
    });
    overlay.addEventListener("click", closeSide);
    closeBtn.addEventListener("click", closeSide);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeSide();
      }
    });
  });
  document.addEventListener("navbar:ready", function () {
    const filterBtn = getById("nav-filter-toggle", "navFilterToggle");
    if (!filterBtn) {
      return;
    }
    const pageKey = getPageKey();
    filterBtn.addEventListener("click", function (event) {
      if (pageKey !== "index") {
        event.preventDefault();
        const target = "/index.html?filter=1";
        window.location.href = target;
        return;
      }
      if (window.bootstrap && window.bootstrap.Modal) {
        const modalEl = getById("filter-modal", "filterModal");
        if (modalEl) {
          const instance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
          instance.show();
        }
      }
    });
  });

  document.addEventListener("navbar:ready", function () {
    const notifBtn = getById("nav-notif-toggle", "navNotifToggle");
    const modalEl = getById("nav-notif-modal", "navNotifModal");
    if (modalEl && modalEl.dataset.bound !== "1") {
      modalEl.dataset.bound = "1";
      const panelEl = getById("notif-filter-panel");
      const allRadio = getById("notif-filter-all");
      const radioInputs = modalEl.querySelectorAll("input[name='notifFilter']");
      const list = getNotifListRoot();

      function resetNotifFilterState() {
        notifFilterMode = NOTIFICATION_TYPE_FILTER.all;
        if (allRadio) {
          allRadio.checked = true;
        }
        if (panelEl && window.bootstrap && window.bootstrap.Collapse) {
          const collapse = window.bootstrap.Collapse.getOrCreateInstance(panelEl, {
            toggle: false,
          });
          collapse.hide();
        }
        renderNotificationList();
      }

      radioInputs.forEach(function (input) {
        input.addEventListener("change", function () {
          notifFilterMode = String(input.value || NOTIFICATION_TYPE_FILTER.all);
          renderNotificationList();
        });
      });
      if (list) {
        list.addEventListener("click", function (event) {
          const btn = event.target.closest("[data-notif-id]");
          if (!btn) {
            return;
          }
          const notificationId = String(btn.getAttribute("data-notif-id") || "").trim();
          const targetLink = String(btn.getAttribute("data-notif-link") || "").trim();
          if (!notificationId || !targetLink) {
            return;
          }
          btn.disabled = true;
          markNotificationRead(notificationId)
            .then(function (payload) {
              const unreadCount = Number(payload && payload.unread_count ? payload.unread_count : NaN);
              notifItems = notifItems.map(function (item) {
                if (String(item.id || "") !== notificationId) {
                  return item;
                }
                return { ...item, is_read: true };
              });
              if (!Number.isNaN(unreadCount)) {
                updateNotificationBadge(unreadCount);
              } else {
                const fallbackUnread = notifItems.filter(function (item) {
                  return !item.is_read;
                }).length;
                updateNotificationBadge(fallbackUnread);
              }
            })
            .catch(function () {
              // no-op: fallback navigation still proceeds
            })
            .finally(function () {
              window.location.href = targetLink;
            });
        });
      }
      modalEl.addEventListener("show.bs.modal", function () {
        fetchNotifications().catch(function () {
          renderNotificationListState("Gagal memuat notifikasi.", " text-danger");
        });
      });
      modalEl.addEventListener("hidden.bs.modal", resetNotifFilterState);
    }
    if (!notifBtn) {
      return;
    }
    notifBtn.addEventListener("click", function () {
      if (!(window.bootstrap && window.bootstrap.Modal)) {
        return;
      }
      if (!modalEl) {
        return;
      }
      const instance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      instance.show();
    });
  });
})();
