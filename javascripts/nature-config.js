// Nature trips config — edit after Worker deploy
window.NATURE_CONFIG = {
  // Primary: Worker API (CORS-safe; reads live trips.json from R2)
  tripsUrl: "https://nature-trip-uploader.nature-trip-uploader.workers.dev/api/trips",
  // Fallback if Worker is down
  tripsFallbackUrl: "./data/trips.json",
  // Cloudflare Worker for admin upload/edit
  workerUrl: "https://nature-trip-uploader.nature-trip-uploader.workers.dev",
  // Display host for resized photos.
  photoCdnUrl: "https://photos.rongwuxu.com",
  useCustomPhotoDomain: true,
  // Max photos per archive page (trips stay whole; Newer/Older when over)
  photoChunk: 60,
};

(function (cfg) {
  var WIDTHS = [400, 800, 1280];

  function originOf(name) {
    return String(cfg[name] || "").replace(/\/$/, "");
  }

  cfg.photoCdnOrigin = function () {
    if (cfg.useCustomPhotoDomain && originOf("photoCdnUrl")) {
      return originOf("photoCdnUrl");
    }
    return originOf("workerUrl");
  };

  cfg.workerOrigin = function () {
    return originOf("workerUrl");
  };

  cfg.displayPhotoUrl = function (src, width, origin) {
    if (!src) return "";
    var host = String(origin || cfg.photoCdnOrigin() || "").replace(/\/$/, "");
    if (!host) return src;
    try {
      var u = new URL(src, host);
      if (u.pathname.indexOf("/img/") === 0) return src;
      var hostname = u.hostname || "";
      if (!/\.r2\.dev$/i.test(hostname) && !/\.r2\./i.test(hostname)) return src;
      var key = decodeURIComponent(u.pathname.replace(/^\//, ""));
      if (!key || key === "trips.json" || key.indexOf("..") !== -1) return src;
      var w = Number(width);
      if (WIDTHS.indexOf(w) < 0) w = 800;
      return (
        host +
        "/img/" +
        key
          .split("/")
          .map(encodeURIComponent)
          .join("/") +
        "?w=" +
        w
      );
    } catch (err) {
      return src;
    }
  };

  cfg.displayPhotoSrcset = function (src, origin) {
    if (!src) return "";
    return WIDTHS.map(function (w) {
      return cfg.displayPhotoUrl(src, w, origin) + " " + w + "w";
    }).join(", ");
  };
})(window.NATURE_CONFIG);
