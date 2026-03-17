(function () {
  const body = document.body;
  const root = document.documentElement;
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

    navbar.classList.add("site-navbar");
    body.classList.add("has-fixed-navbar");
    navbar.dataset.scrollReady = "1";
    updateNavbarHeight();
    showNavbar();
    window.addEventListener("resize", updateNavbarHeight);
    window.addEventListener("load", updateNavbarHeight);
    document.addEventListener("show.bs.modal", showNavbar);
  }

  initNavScroll();
  document.addEventListener("navbar:ready", initNavScroll);
})();
