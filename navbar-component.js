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
    return "index";
  }

  function getNavbarConfig() {
    const key = getPageKey();
    const byPage = {
      index: {
        navClass: "navbar-dark bg-primary",
        brandText: "LaporAja",
        subtitle: "Laporkan masalah kota dengan cepat",
        rightHtml: `
          <a
            id="authActionBtn"
            href="/login.html"
            class="btn btn-sm d-inline-flex align-items-center gap-2 nav-plain-btn"
          >
            <img id="authUserAvatar" class="nav-avatar d-none" alt="Avatar user" />
            <span id="authActionText">Login</span>
          </a>
        `,
      },
      login: {
        navClass: "navbar-dark bg-primary",
        brandText: "LaporAja",
        subtitle: "Portal Masuk",
        rightHtml: "",
      },
      profile: {
        navClass: "navbar-dark bg-primary",
        brandText: "LaporAja",
        subtitle: "Profil Akun",
        rightHtml:
          '<button type="button" class="btn btn-sm nav-plain-btn" data-nav-back="1">Kembali</button>',
      },
      report: {
        navClass: "navbar-dark bg-primary",
        brandText: "LaporAja",
        subtitle: "Detail laporan warga",
        rightHtml:
          '<button type="button" class="btn btn-sm nav-plain-btn" data-nav-back="1">Kembali</button>',
      },
      user: {
        navClass: "navbar-dark bg-primary",
        brandText: "LaporAja",
        subtitle: "Profil Pelapor",
        rightHtml:
          '<button type="button" class="btn btn-sm nav-plain-btn" data-nav-back="1">Kembali</button>',
      },
      admin: {
        navClass: "navbar-dark bg-dark",
        brandText: "Admin LaporAja",
        subtitle: "Kelola status laporan warga",
        rightHtml: '<a href="/index.html" class="btn btn-sm nav-plain-btn">Ke Halaman User</a>',
      },
      "admin-report": {
        navClass: "navbar-dark bg-dark",
        brandText: "Admin LaporAja",
        subtitle: "Detail penanganan laporan",
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
            <div>
              <h1 class="h4 mb-0">
                <a href="/index.html" class="text-white text-decoration-none">__BRAND_TEXT__</a>
              </h1>
              <small class="text-white-50">__SUBTITLE__</small>
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
    document.dispatchEvent(new CustomEvent("navbar:ready"));
  }

  renderNavbar();
})();
