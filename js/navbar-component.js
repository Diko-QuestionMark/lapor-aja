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
        id="authActionBtn"
        href="/login.html"
        class="btn btn-sm d-inline-flex align-items-center gap-2 nav-plain-btn"
      >
        <span id="navAvatarWrap" class="nav-avatar-wrap d-none">
          <img id="authUserAvatar" class="nav-avatar" alt="Avatar user" />
          <span id="navNotifBadge" class="nav-avatar-badge d-none">0</span>
        </span>
        <span id="authActionText" class="nav-auth-text">Login</span>
      </a>
    `;
    const indexRightHtml = `
      <div class="d-flex align-items-center gap-2 nav-right-wrap">
        <button
          id="navSearchToggle"
          type="button"
          class="btn btn-sm nav-plain-btn nav-search-toggle"
          aria-label="Cari laporan"
        >
          <i class="bi bi-search"></i>
        </button>
        <button
          id="navNotifToggle"
          type="button"
          class="btn btn-sm nav-plain-btn nav-notif-toggle"
          aria-label="Notifikasi"
        >
          <i class="bi bi-bell"></i>
        </button>
        <button
          id="createReportBtn"
          type="button"
          class="btn btn-sm btn-primary nav-create-btn"
          aria-label="Buat laporan"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Buat</span>
        </button>
        <input
          id="searchInput"
          type="search"
          class="form-control form-control-sm nav-search-input"
          placeholder="Cari laporan..."
          autocomplete="off"
        />
        ${authRightHtml}
      </div>
    `;
    const byPage = {
      index: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Laporkan masalah kota dengan cepat",
        leftHtml: "",
        rightHtml: indexRightHtml,
      },
      login: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Portal Masuk",
        leftHtml: "",
        rightHtml: authRightHtml,
      },
      profile: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Profil Akun",
        leftHtml: "",
        rightHtml: authRightHtml,
      },
      report: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Detail laporan warga",
        leftHtml: "",
        rightHtml: authRightHtml,
      },
      user: {
        navClass: "navbar-light bg-white",
        brandText: "LaporAja",
        subtitle: "Profil Pelapor",
        leftHtml: "",
        rightHtml: authRightHtml,
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
    const mount = document.getElementById("navbarMount");
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
    const badge = document.getElementById("navNotifBadge");
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
    const actionBtn = document.getElementById("authActionBtn");
    const avatar = document.getElementById("authUserAvatar");
    const avatarWrap = document.getElementById("navAvatarWrap");
    const actionText = document.getElementById("authActionText");
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

    if (!session || !session.email || !session.token) {
      actionBtn.href = "/login.html";
      actionText.textContent = "Login";
      avatarWrap.classList.add("d-none");
      avatar.removeAttribute("src");
      return;
    }

    actionText.textContent = `Halo, ${session.name || session.email}`;
    actionBtn.href = "/profile.html";
    avatar.src = session.profile_image_url || "/img/defaultAvatar.jpg";
    avatarWrap.classList.remove("d-none");
    avatar.onerror = function () {
      avatar.src = "/img/defaultAvatar.jpg";
    };
  }

  renderNavbar();
  document.addEventListener("navbar:ready", initAuthNav);
  document.addEventListener("navbar:ready", function () {
    const toggleBtn = document.getElementById("navSearchToggle");
    const searchInput = document.getElementById("searchInput");
    if (!toggleBtn || !searchInput) {
      return;
    }

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

    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    });

    searchInput.addEventListener("blur", function () {
      if (window.matchMedia("(max-width: 640px)").matches) {
        closeSearch();
      }
    });
  });
})();
