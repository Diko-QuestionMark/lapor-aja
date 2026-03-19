(function () {
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
          <span id="nav-notif-badge" class="nav-avatar-badge d-none">0</span>
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
        <div class="modal fade" id="nav-notif-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h2 class="modal-title fs-6">Notifikasi</h2>
                <div class="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-sm nav-plain-btn notif-filter-btn"
                    data-bs-toggle="collapse"
                    data-bs-target="#notif-filter-panel"
                    aria-expanded="false"
                    aria-controls="notif-filter-panel"
                  >
                    <i class="bi bi-funnel"></i>
                    <span>Filter</span>
                  </button>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
              </div>
              <div class="modal-body">
                <div id="notif-filter-panel" class="collapse">
                  <div class="notif-filter-panel">
                    <div class="form-check">
                      <input class="form-check-input" type="radio" name="notifFilter" id="notif-filter-all" checked />
                      <label class="form-check-label" for="notif-filter-all">Semua notifikasi</label>
                    </div>
                    <div class="form-check">
                      <input class="form-check-input" type="radio" name="notifFilter" id="notif-filter-status" />
                      <label class="form-check-label" for="notif-filter-status">Update status</label>
                    </div>
                    <div class="form-check">
                      <input class="form-check-input" type="radio" name="notifFilter" id="notif-filter-response" />
                      <label class="form-check-label" for="notif-filter-response">Respons instansi</label>
                    </div>
                    <div class="form-check">
                      <input class="form-check-input" type="radio" name="notifFilter" id="notif-filter-mentions" />
                      <label class="form-check-label" for="notif-filter-mentions">Laporan saya</label>
                    </div>
                  </div>
                </div>
                <div class="notif-list">
                  <div class="notif-item">
                    <div class="notif-title">Laporan #128 diterima oleh instansi</div>
                    <div class="notif-meta">2 menit lalu</div>
                  </div>
                  <div class="notif-item">
                    <div class="notif-title">Status laporan #127 berubah jadi Diproses</div>
                    <div class="notif-meta">15 menit lalu</div>
                  </div>
                  <div class="notif-item">
                    <div class="notif-title">Respons instansi masuk untuk laporan #120</div>
                    <div class="notif-meta">1 jam lalu</div>
                  </div>
                  <div class="notif-item">
                    <div class="notif-title">Laporan #118 selesai ditangani</div>
                    <div class="notif-meta">Kemarin</div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Tutup</button>
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
    let session = null;
    try {
      const raw = localStorage.getItem("laporaja_session_v1");
      session = raw ? JSON.parse(raw) : null;
    } catch (_) {
      session = null;
    }
    const notifRaw = localStorage.getItem("laporaja_notification_unread_v1");
    updateNotificationBadge(notifRaw ? Number(notifRaw) : 0);

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
    if (!notifBtn) {
      return;
    }
    notifBtn.addEventListener("click", function () {
      if (!(window.bootstrap && window.bootstrap.Modal)) {
        return;
      }
      const modalEl = getById("nav-notif-modal", "navNotifModal");
      if (!modalEl) {
        return;
      }
      const instance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      instance.show();
    });
  });
})();
