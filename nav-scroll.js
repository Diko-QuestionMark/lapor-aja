(function () {
  const body = document.body;
  const root = document.documentElement;
  const SCROLL_DELTA = 8;
  const TOP_LOCK = 24;
  let lastY = window.scrollY || 0;
  let ticking = false;

  function initNavScroll() {
    const navbar = document.querySelector("nav.navbar");
    if (!navbar || navbar.dataset.scrollReady === "1") return;

    function updateNavbarHeight() {
      const height = Math.ceil(navbar.getBoundingClientRect().height || 0);
      root.style.setProperty("--site-navbar-height", `${height}px`);
    }

    function showNavbar() {
      navbar.classList.remove("nav-hidden");
    }

    function hideNavbar() {
      navbar.classList.add("nav-hidden");
    }

    function handleScroll() {
      const currentY = window.scrollY || 0;
      const diff = currentY - lastY;

      if (currentY <= TOP_LOCK) {
        showNavbar();
      } else if (Math.abs(diff) > SCROLL_DELTA) {
        if (diff > 0) {
          hideNavbar();
        } else {
          showNavbar();
        }
      }

      lastY = currentY;
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(handleScroll);
    }

    navbar.classList.add("site-navbar");
    body.classList.add("has-fixed-navbar");
    navbar.dataset.scrollReady = "1";
    updateNavbarHeight();
    showNavbar();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateNavbarHeight);
    window.addEventListener("load", updateNavbarHeight);
    document.addEventListener("show.bs.modal", showNavbar);
  }

  initNavScroll();
  document.addEventListener("navbar:ready", initNavScroll);
})();
