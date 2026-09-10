(function () {
  var ORIGIN = "https://rongwuxu.com";
  var LOGO = ORIGIN + "/images/logo-512.png";

  var PAGE = {
    "/": {
      description: "Rongwu Xu — PhD student at the University of Washington Allen School.",
    },
    "/index.html": {
      description: "Rongwu Xu — PhD student at the University of Washington Allen School.",
    },
    "/misc.html": {
      description: "Interests, music, and miscellany — Rongwu Xu.",
    },
    "/trip.html": {
      description: "Trip archive — outdoor adventures by Rongwu Xu.",
    },
    "/pickle-juice.html": {
      description: "Don't pour the dill pickle juice away — leftover brine and pickled eggs.",
    },
  };

  function pathKey() {
    var p = location.pathname || "/";
    if (p === "/" || p.endsWith("/")) return "/";
    var parts = p.split("/");
    return "/" + (parts[parts.length - 1] || "index.html");
  }

  function ensureMeta(attr, key, value) {
    if (!value) return;
    var sel = "meta[" + attr + '="' + key + '"]';
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute("content", value);
  }

  function applyBrand() {
    var key = pathKey();
    var info = PAGE[key] || {};
    var title = document.title || "Rongwu Xu";
    var description = info.description || title;
    var url = ORIGIN + (key === "/" ? "/" : key);

    ensureMeta("name", "theme-color", "#1a3a42");
    ensureMeta("name", "description", description);
    ensureMeta("property", "og:type", "website");
    ensureMeta("property", "og:site_name", "Rongwu Xu");
    ensureMeta("property", "og:title", title);
    ensureMeta("property", "og:description", description);
    ensureMeta("property", "og:url", url);
    ensureMeta("property", "og:image", LOGO);
    ensureMeta("name", "twitter:card", "summary");
    ensureMeta("name", "twitter:title", title);
    ensureMeta("name", "twitter:image", LOGO);
  }

  function applyNav() {
    if (window.SITE_NO_NAV) return;
    var key = pathKey();
    if (key === "/admin.html") return;

    var navbar =
      '<nav class="navbar">' +
      '<div class="nav-content">' +
      '<a href="./index.html">home</a>' +
      '<a href="./misc.html">misc</a>' +
      '<a href="./trip.html">trip archive</a>' +
      "</div>" +
      "</nav>";

    function inject() {
      if (!document.body) return;
      if (document.querySelector("nav.navbar")) return;
      document.body.insertAdjacentHTML("afterbegin", navbar);
    }

    if (document.body) inject();
    else document.addEventListener("DOMContentLoaded", inject);
  }

  function applyFooter() {
    if (window.SITE_NO_FOOTER) return;
    var key = pathKey();
    if (key === "/admin.html") return;

    var copy =
      '<p class="site-copyright">© Copyright 2022-2026 Rongwu Xu.</p>';

    function inject() {
      if (!document.body) return;
      if (document.querySelector(".site-copyright")) return;

      var footer = document.querySelector("footer");
      if (footer) {
        if (/Copyright/i.test(footer.textContent || "")) return;
        footer.insertAdjacentHTML("beforeend", copy);
        return;
      }

      var host =
        document.querySelector(".fun-wrapper .nature-content") ||
        document.querySelector("main.fun-wrapper") ||
        document.querySelector(".fun-wrapper") ||
        document.body;
      host.insertAdjacentHTML(
        "beforeend",
        '<footer class="site-footer">' + copy + "</footer>"
      );
    }

    if (document.body) inject();
    else document.addEventListener("DOMContentLoaded", inject);
  }

  applyBrand();
  applyNav();
  applyFooter();
})();
