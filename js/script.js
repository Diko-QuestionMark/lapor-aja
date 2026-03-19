(function () {
  if (window.__laporAjaIndexEntryLoaded) {
    return;
  }
  window.__laporAjaIndexEntryLoaded = true;

  const script = document.createElement("script");
  script.src = "/js/index-page.js";
  script.defer = true;
  document.head.appendChild(script);
})();
