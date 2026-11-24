(function () {
  var TAG_LABELS = {
    scrambling: "scrambling",
  };
  var GALLERY_MEASURE_TIMEOUT_MS = 3000;
  var GALLERY_GAP_RATIO = 0.03;
  var GALLERY_SIZES = "(max-width: 720px) 100vw, 360px";
  var GALLERY_EAGER_COUNT = 1;

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInline(escaped) {
    return escaped
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (_, text, href) {
        return (
          '<a href="' +
          href +
          '" target="_blank" rel="noopener noreferrer">' +
          text +
          "</a>"
        );
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  }

  function renderReport(src) {
    var text = String(src || "").replace(/\r\n/g, "\n").trim();
    if (!text) return "";
    var blocks = text.split(/\n{2,}/);
    var html = blocks
      .map(function (block) {
        var lines = block.split("\n");
        var isList =
          lines.length > 0 &&
          lines.every(function (line) {
            return /^\s*[-*]\s+/.test(line) || !line.trim();
          }) &&
          lines.some(function (line) {
            return /^\s*[-*]\s+/.test(line);
          });
        if (isList) {
          var items = lines
            .filter(function (line) {
              return /^\s*[-*]\s+/.test(line);
            })
            .map(function (line) {
              return (
                "<li>" +
                formatInline(escapeHtml(line.replace(/^\s*[-*]\s+/, ""))) +
                "</li>"
              );
            })
            .join("");
          return "<ul>" + items + "</ul>";
        }
        return (
          "<p>" +
          formatInline(escapeHtml(block)).replace(/\n/g, "<br>") +
          "</p>"
        );
      })
      .join("");
    return '<div class="trip-report">' + html + "</div>";
  }

  function monthIndex(month) {
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var i = months.findIndex(function (m) {
      return m.toLowerCase() === String(month || "").toLowerCase();
    });
    return i >= 0 ? i + 1 : 0;
  }

  function tripDateKey(trip) {
    if (trip && trip.date && /^\d{4}-\d{2}-\d{2}$/.test(trip.date)) return trip.date;
    var mi = monthIndex(trip && trip.month);
    if (trip && trip.year && mi) {
      return trip.year + "-" + String(mi).padStart(2, "0") + "-01";
    }
    return "0000-00-00";
  }

  function formatTripDate(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
    var parts = dateStr.split("-");
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var monthName = months[Number(parts[1]) - 1] || parts[1];
    return monthName + " " + Number(parts[2]) + ", " + parts[0];
  }

  function formatTripDateRange(start, end) {
    var startLabel = formatTripDate(start);
    if (!startLabel) return "";
    if (!end || end === start) return startLabel;
    var endLabel = formatTripDate(end);
    if (!endLabel) return startLabel;

    var sp = start.split("-");
    var ep = end.split("-");
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    // Same month+year: "June 24–26, 2026"
    if (sp[0] === ep[0] && sp[1] === ep[1]) {
      return (
        months[Number(sp[1]) - 1] +
        " " +
        Number(sp[2]) +
        "–" +
        Number(ep[2]) +
        ", " +
        sp[0]
      );
    }
    // Same year: "June 28 – July 1, 2026"
    if (sp[0] === ep[0]) {
      return (
        months[Number(sp[1]) - 1] +
        " " +
        Number(sp[2]) +
        " – " +
        months[Number(ep[1]) - 1] +
        " " +
        Number(ep[2]) +
        ", " +
        sp[0]
      );
    }
    return startLabel + " – " + endLabel;
  }

  function sortTrips(trips) {
    return trips.slice().sort(function (a, b) {
      var db = tripDateKey(b);
      var da = tripDateKey(a);
      if (db !== da) return db < da ? -1 : 1;
      return String(b.title || "").localeCompare(String(a.title || ""));
    });
  }

  function normalizeTrip(trip) {
    var date = tripDateKey(trip);
    var endDate =
      trip && trip.endDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.endDate)
        ? trip.endDate
        : date === "0000-00-00"
          ? trip.endDate
          : date;
    var parts = date.split("-");
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var year = Number(parts[0]) || trip.year;
    var month = months[Number(parts[1]) - 1] || trip.month;
    var photoCount = Number(trip && trip.photoCount);
    if (!isFinite(photoCount) || photoCount < 0) {
      photoCount = (trip && trip.photos && trip.photos.length) || 0;
    }
    return Object.assign({}, trip, {
      date: date === "0000-00-00" ? trip.date : date,
      endDate: endDate,
      year: year,
      month: month,
      photoCount: photoCount,
    });
  }

  function normalizeTag(tag) {
    var t = String(tag || "").trim();
    if (t === "mountaineering") return "scrambling";
    return t;
  }

  function formatTripDateRangeHtml(start, end) {
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return "";

    function monthName(iso) {
      return months[Number(iso.split("-")[1]) - 1] || "";
    }
    function dayNum(iso) {
      return Number(iso.split("-")[2]);
    }
    function yearNum(iso) {
      return iso.split("-")[0];
    }
    function mo(text) {
      return '<span class="trip-date-month">' + escapeHtml(text) + "</span>";
    }
    function rest(text) {
      return '<span class="trip-date-rest">' + escapeHtml(text) + "</span>";
    }

    if (!end || end === start) {
      return (
        mo(monthName(start)) +
        " " +
        rest(dayNum(start) + ", " + yearNum(start))
      );
    }

    var sp = start.split("-");
    var ep = end.split("-");
    // Same month+year: "June 24–26, 2026"
    if (sp[0] === ep[0] && sp[1] === ep[1]) {
      return (
        mo(monthName(start)) +
        " " +
        rest(dayNum(start) + "–" + dayNum(end) + ", " + yearNum(start))
      );
    }
    // Same year: "June 28 – July 1, 2026"
    if (sp[0] === ep[0]) {
      return (
        mo(monthName(start)) +
        " " +
        rest(dayNum(start) + " – ") +
        mo(monthName(end)) +
        " " +
        rest(dayNum(end) + ", " + yearNum(start))
      );
    }
    return (
      mo(monthName(start)) +
      " " +
      rest(dayNum(start) + ", " + yearNum(start) + " – ") +
      mo(monthName(end)) +
      " " +
      rest(dayNum(end) + ", " + yearNum(end))
    );
  }

  function renderTags(tags) {
    if (!tags || !tags.length) return "";
    var normalized = [];
    tags.forEach(function (tag) {
      var t = normalizeTag(tag);
      if (t && normalized.indexOf(t) < 0) normalized.push(t);
    });
    return (
      '<div class="trip-tags">' +
      normalized
        .map(function (tag) {
          var tip = TAG_LABELS[tag] || tag;
          return (
            '<span class="trip-tag ' +
            escapeHtml(tag) +
            '" title="' +
            escapeHtml(tip) +
            '"></span>'
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderTrip(trip, opts) {
    opts = opts || {};
    var titleTag = opts.detail ? "h1" : "div";
    var tagsHtml = renderTags(trip.tags);
    var dateHtml = formatTripDateRangeHtml(trip.date, trip.endDate);
    var mapBtn =
      trip.photos && trip.photos.length
        ? '<button type="button" class="trip-map-btn" data-trip-map="' +
          escapeHtml(trip.id || "") +
          '" aria-label="See this trip on the map">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21z"/>' +
          '<circle cx="12" cy="9.8" r="2.2"/>' +
          "</svg>" +
          '<span class="trip-map-btn-label">See on map</span>' +
          '<span class="trip-map-btn-arrow" aria-hidden="true">→</span>' +
          "</button>"
        : "";
    var metaLeft =
      tagsHtml || dateHtml
        ? '<div class="trip-meta-left">' +
          tagsHtml +
          (dateHtml ? '<div class="trip-date">' + dateHtml + "</div>" : "") +
          "</div>"
        : "";
    var meta =
      metaLeft || mapBtn
        ? '<div class="trip-meta">' + metaLeft + mapBtn + "</div>"
        : "";
    var report = trip.report ? renderReport(trip.report) : "";
    var eagerLeft = opts.eagerCount || 0;
    var imgTags = [];
    var ratios = [];
    var allDims = (trip.photos || []).length > 0;
    (trip.photos || []).forEach(function (photo, idx) {
      var orig = photoSrc(photo);
      var dims = photoDims(trip, orig);
      if (!dims) allDims = false;
      else ratios.push(dims.height / dims.width);
      var tag = photoImgHtml(trip, photo, {
        deferSrc: opts.deferSrc,
        eager: idx < eagerLeft,
      });
      if (tag) imgTags.push(tag);
    });
    var gallery = "";
    if (imgTags.length) {
      if (allDims) {
        var split = splitIndexForRatios(ratios);
        gallery =
          '<div class="trip-gallery">' +
          '<div class="trip-gallery-col">' +
          imgTags.slice(0, split).join("") +
          "</div>" +
          '<div class="trip-gallery-col">' +
          imgTags.slice(split).join("") +
          "</div>" +
          "</div>";
      } else {
        gallery =
          '<div class="trip-gallery is-measuring">' +
          '<div class="trip-gallery-col">' +
          imgTags.join("") +
          "</div>" +
          '<div class="trip-gallery-col"></div>' +
          "</div>";
      }
    }

    var idAttr = "";
    if (opts.monthId) {
      idAttr =
        ' id="' +
        escapeHtml(opts.monthId) +
        '"' +
        (opts.isChunkStart ? " data-trip-chunk-start" : "");
    } else if (opts.isChunkStart) {
      idAttr = ' id="trip-chunk-start"';
    }

    return (
      '<article class="trip-entry"' +
      idAttr +
      ">" +
      "<" +
      titleTag +
      ' class="trip-title">' +
      escapeHtml(trip.title) +
      "</" +
      titleTag +
      ">" +
      meta +
      report +
      gallery +
      "</article>"
    );
  }

  function tripDetailHref(trip) {
    return "/trips/" + encodeURIComponent(trip.id || "") + "/";
  }

  function tripCover(trip) {
    var photos = (trip && trip.photos) || [];
    var wanted = photoSrc(trip && trip.coverPhoto);
    if (wanted) {
      var normalized = normalizePhotoUrl(wanted);
      var match = photos.find(function (photo) {
        return normalizePhotoUrl(photoSrc(photo)) === normalized;
      });
      if (match) return match;
    }
    return photos[0] || "";
  }

  function renderTripCard(trip, opts) {
    opts = opts || {};
    var cover = tripCover(trip);
    var photoCount = tripPhotoCount(trip);
    var coverHtml = cover
      ? photoImgHtml(trip, cover, {
          eager: !!opts.eager,
          deferSrc: !!opts.deferSrc,
        })
      : '<span class="trip-card-cover-fallback" aria-hidden="true"></span>';
    var countHtml =
      photoCount > 0
        ? '<span class="trip-card-count" aria-hidden="true">' +
          photoCount +
          "</span>"
        : "";
    return (
      '<article class="trip-card"' +
      (opts.id ? ' id="' + escapeHtml(opts.id) + '"' : "") +
      (opts.isChunkStart ? " data-trip-chunk-start" : "") +
      ">" +
      '<a class="trip-card-link" href="' +
      escapeHtml(tripDetailHref(trip)) +
      '">' +
      '<div class="trip-card-cover">' +
      coverHtml +
      countHtml +
      "</div>" +
      '<div class="trip-card-body">' +
      '<h2 class="trip-card-title">' +
      escapeHtml(trip.title) +
      '<span class="trip-card-arrow" aria-hidden="true">→</span>' +
      "</h2>" +
      '<div class="trip-card-meta">' +
      (formatTripDateRangeHtml(trip.date, trip.endDate)
        ? '<div class="trip-date">' +
          formatTripDateRangeHtml(trip.date, trip.endDate) +
          "</div>"
        : "") +
      renderTags(trip.tags) +
      "</div>" +
      "</div></a></article>"
    );
  }

  function tripPhotoCount(trip) {
    var declared = Number(trip && trip.photoCount);
    if (isFinite(declared) && declared >= 0) return declared;
    return (trip && trip.photos && trip.photos.length) || 0;
  }

  function photoSrc(photo) {
    if (!photo) return "";
    if (typeof photo === "string") return photo;
    return photo.src || photo.url || "";
  }

  function normalizePhotoUrl(src) {
    try {
      var u = new URL(src);
      return u.origin + u.pathname;
    } catch (err) {
      return src;
    }
  }

  function photoDims(trip, src) {
    if (!trip || !src) return null;
    var map = trip.photoDimensions || {};
    var d = map[src] || map[normalizePhotoUrl(src)];
    if (d && d.width && d.height) {
      return { width: Number(d.width), height: Number(d.height) };
    }
    return null;
  }

  function photoDisplaySrc(photo, width) {
    var src = photoSrc(photo);
    var fn =
      (typeof window !== "undefined" &&
        window.NATURE_CONFIG &&
        window.NATURE_CONFIG.displayPhotoUrl) ||
      null;
    return fn ? fn(src, width || 800) : src;
  }

  function splitIndexForRatios(ratios) {
    var heights = ratios.map(function (r) {
      return r + GALLERY_GAP_RATIO;
    });
    var total = heights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var bestK = ratios.length;
    var bestTallest = Infinity;
    for (var k = ratios.length; k >= 0; k--) {
      var prefix = 0;
      for (var i = 0; i < k; i++) prefix += heights[i];
      var tallest = Math.max(prefix, total - prefix);
      if (tallest < bestTallest - 1e-9) {
        bestTallest = tallest;
        bestK = k;
      }
    }
    return bestK;
  }

  function photoImgHtml(trip, photo, opts) {
    opts = opts || {};
    var orig = photoSrc(photo);
    var src = photoDisplaySrc(photo, 800);
    if (!src) return "";
    var dims = photoDims(trip, orig);
    var cfg =
      (typeof window !== "undefined" && window.NATURE_CONFIG) || {};
    var attrs = ['alt=""', 'decoding="async"'];
    if (orig) attrs.push('data-full="' + escapeHtml(orig) + '"');
    if (dims) {
      attrs.push('width="' + dims.width + '"');
      attrs.push('height="' + dims.height + '"');
    }
    if (cfg.displayPhotoSrcset && orig) {
      attrs.push(
        'srcset="' + escapeHtml(cfg.displayPhotoSrcset(orig)) + '"'
      );
      attrs.push('sizes="' + GALLERY_SIZES + '"');
    }
    if (opts.eager) attrs.push('fetchpriority="high"');
    else attrs.push('loading="lazy"');
    if (opts.deferSrc) {
      return (
        "<img data-src=\"" +
        escapeHtml(src) +
        '" ' +
        attrs.join(" ") +
        ">"
      );
    }
    return (
      '<img src="' + escapeHtml(src) + '" ' + attrs.join(" ") + ">"
    );
  }

  function chunkTripsByPhotos(sorted, budget) {
    var chunks = [];
    for (var i = 0; i < sorted.length; i += budget) {
      var trips = sorted.slice(i, i + budget);
      chunks.push({
        trips: trips,
        photos: trips.reduce(function (sum, trip) {
          return sum + tripPhotoCount(trip);
        }, 0),
      });
    }
    return chunks;
  }

  function shortMonthYear(dateStr, fallbackYear, fallbackMonth) {
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      var parts = dateStr.split("-");
      var months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      return (months[Number(parts[1]) - 1] || parts[1]) + " " + parts[0];
    }
    if (fallbackMonth && fallbackYear) {
      return String(fallbackMonth).slice(0, 3) + " " + fallbackYear;
    }
    return "";
  }

  function chunkRangeLabel(chunk) {
    var trips = chunk.trips || [];
    if (!trips.length) return "";
    var newest = trips[0];
    var oldest = trips[trips.length - 1];
    var a = shortMonthYear(newest.date, newest.year, newest.month);
    var b = shortMonthYear(oldest.date, oldest.year, oldest.month);
    if (a && b && a !== b) return a + " – " + b;
    return a || b;
  }

  function chunkHref(index, baseHref) {
    if (
      !baseHref &&
      document.documentElement.hasAttribute("data-static-trip-page")
    ) {
      return index <= 0
        ? "/trip.html#trip-chunk-start"
        : "/trips/page/" + (index + 1) + "/#trip-chunk-start";
    }
    var url = new URL(baseHref || location.href);
    url.searchParams.delete("trip");
    url.searchParams.delete("chunk");
    if (index <= 0) url.searchParams.delete("page");
    else url.searchParams.set("page", String(index + 1));
    url.hash = "";
    // Land on the first trip of that chunk, not the page chrome.
    return url.pathname + url.search + "#trip-chunk-start";
  }

  function readChunkIndex(chunkCount) {
    var params = new URLSearchParams(location.search);
    var raw = params.get("page");
    var n = raw == null
      ? parseInt(params.get("chunk") || "0", 10)
      : parseInt(raw || "1", 10) - 1;
    if (!isFinite(n) || n < 0) n = 0;
    if (chunkCount > 0 && n >= chunkCount) n = chunkCount - 1;
    return n;
  }

  function tripMatchesHash(trip, hashId) {
    if (!hashId || !trip) return false;
    var mi = monthIndex(trip.month);
    var monthId =
      "trip-" + trip.year + "-" + String(mi || 0).padStart(2, "0");
    return hashId === monthId;
  }

  function findChunkIndexForHash(chunks, hashId) {
    if (!hashId) return -1;
    for (var i = 0; i < chunks.length; i++) {
      var trips = chunks[i].trips || [];
      for (var j = 0; j < trips.length; j++) {
        if (tripMatchesHash(trips[j], hashId)) return i;
      }
    }
    return -1;
  }

  function renderAll(trips, usedIds, lazyImages) {
    var sorted = sortTrips(trips.map(normalizeTrip));
    var html = "";
    var currentYear = null;
    var currentMonth = null;
    var toc = [];
    var isChunkStart = true;
    var eagerLeft = lazyImages ? 0 : GALLERY_EAGER_COUNT;

    sorted.forEach(function (trip) {
      var monthId = "";
      if (trip.year !== currentYear) {
        currentYear = trip.year;
        currentMonth = null;
        toc.push({ year: currentYear, months: [] });
      }
      if (trip.month !== currentMonth) {
        currentMonth = trip.month;
        var mi = monthIndex(currentMonth);
        monthId =
          "trip-" +
          currentYear +
          "-" +
          String(mi || 0).padStart(2, "0");
        if (usedIds) {
          if (usedIds[monthId]) {
            var dup = usedIds[monthId];
            usedIds[monthId] = dup + 1;
            monthId = monthId + "-" + dup;
          } else {
            usedIds[monthId] = 1;
          }
        }
        toc[toc.length - 1].months.push({
          name: currentMonth,
          id: monthId,
        });
      }
      html += renderTripCard(trip, {
        isChunkStart: isChunkStart,
        id: monthId || "",
        deferSrc: !!lazyImages,
        eager: eagerLeft > 0,
      });
      eagerLeft = Math.max(0, eagerLeft - 1);
      isChunkStart = false;
    });

    return {
      html: html,
      trips: sorted,
      toc: toc,
    };
  }

  function applyDisplayAttrs(img, origin) {
    var cfg = window.NATURE_CONFIG || {};
    var full = img.getAttribute("data-full");
    if (!full || !cfg.displayPhotoUrl) return;
    var src = cfg.displayPhotoUrl(full, 800, origin);
    if (cfg.displayPhotoSrcset) {
      img.setAttribute("srcset", cfg.displayPhotoSrcset(full, origin));
      img.setAttribute("sizes", GALLERY_SIZES);
    }
    if (img.hasAttribute("data-src")) img.setAttribute("data-src", src);
    if (!img.getAttribute("src") || origin) img.src = src;
  }

  function bindPhotoFallback(img) {
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = "1";
    img.addEventListener("error", function () {
      var cfg = window.NATURE_CONFIG || {};
      var full = img.getAttribute("data-full");
      var stage = img.dataset.cdnStage || "cdn";
      var cdn = cfg.photoCdnOrigin ? cfg.photoCdnOrigin() : "";
      var worker = cfg.workerOrigin ? cfg.workerOrigin() : "";
      if (stage === "cdn" && cdn && worker && cdn !== worker) {
        img.dataset.cdnStage = "worker";
        applyDisplayAttrs(img, worker);
        return;
      }
      if (full && img.getAttribute("src") !== full) {
        img.dataset.cdnStage = "full";
        img.removeAttribute("srcset");
        img.src = full;
        return;
      }
      img.dataset.failed = "1";
    });
  }

  function activateImages(root) {
    if (!root) return;
    root.querySelectorAll(".trip-gallery img, .trip-card-cover img").forEach(function (img) {
      bindPhotoFallback(img);
      if (img.hasAttribute("data-src") && !img.getAttribute("src")) {
        applyDisplayAttrs(img);
        img.src = img.getAttribute("data-src");
      }
    });
  }

  function visibleTripRoot(target, index) {
    if (!target) return null;
    var node = target.querySelector(
      '.trip-chunk[data-chunk="' + index + '"]'
    );
    return node || target;
  }

  function scrollToChunkStart() {
    var n = document.documentElement.getAttribute("data-trip-chunk") || "0";
    var root =
      document.querySelector(
        '#trips-list .trip-chunk[data-chunk="' + n + '"]'
      ) || document.getElementById("trips-list");
    var el =
      (root && root.querySelector("[data-trip-chunk-start]")) ||
      (root && root.querySelector(".trip-entry, .trip-card")) ||
      document.getElementById("trip-chunk-start");
    if (el) smoothScrollTo(el, "start");
  }

  function tocFromChunk(root) {
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var byYear = [];
    var yearIndex = Object.create(null);
    if (!root) return byYear;
    root.querySelectorAll(".trip-entry[id], .trip-card[id]").forEach(function (el) {
      var m = /^trip-(\d{4})-(\d{2})(?:-|$)/.exec(el.id || "");
      if (!m) return;
      var year = Number(m[1]);
      var monthName = months[Number(m[2]) - 1];
      if (!monthName) return;
      if (yearIndex[year] == null) {
        yearIndex[year] = byYear.length;
        byYear.push({ year: year, months: [] });
      }
      byYear[yearIndex[year]].months.push({ name: monthName, id: el.id });
    });
    return byYear;
  }

  function scrollToTripId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    smoothScrollTo(el, "start");
  }

  var scrollAnimationFrame = 0;

  function smoothScrollToPosition(targetTop) {
    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var destination = Math.max(0, Math.min(targetTop, maxTop));
    if (scrollAnimationFrame) cancelAnimationFrame(scrollAnimationFrame);
    if (reduceMotion) {
      document.documentElement.classList.remove("is-auto-scrolling");
      window.scrollTo(0, destination);
      return;
    }

    document.documentElement.classList.add("is-auto-scrolling");
    var start = window.scrollY;
    var distance = destination - start;
    var duration = 2500;
    var startedAt = performance.now();

    function tick(now) {
      var progress = Math.min(1, (now - startedAt) / duration);
      var eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) scrollAnimationFrame = requestAnimationFrame(tick);
      else {
        scrollAnimationFrame = 0;
        document.documentElement.classList.remove("is-auto-scrolling");
        window.dispatchEvent(new Event("tripscrollend"));
      }
    }
    scrollAnimationFrame = requestAnimationFrame(tick);
  }

  function smoothScrollTo(el, block) {
    var rect = el.getBoundingClientRect();
    var offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    var targetTop =
      block === "end"
        ? window.scrollY + rect.bottom - window.innerHeight
        : window.scrollY + rect.top - offset;
    smoothScrollToPosition(targetTop);
  }

  function mountChunkNav(chunks, index) {
    var nodes = document.querySelectorAll("[data-trip-chunk-nav]");
    if (!nodes.length) return;

    if (chunks.length <= 1) {
      nodes.forEach(function (el) {
        el.hidden = true;
        el.innerHTML = "";
      });
      return;
    }

    var label = escapeHtml(chunkRangeLabel(chunks[index] || { trips: [] }));
    var newer =
      index > 0
        ? '<a class="trip-chunk-link" href="' +
          escapeHtml(chunkHref(index - 1)) +
          '">Newer</a>'
        : '<span class="trip-chunk-link is-disabled">Newer</span>';
    var older =
      index < chunks.length - 1
        ? '<a class="trip-chunk-link" href="' +
          escapeHtml(chunkHref(index + 1)) +
          '">Older</a>'
        : '<span class="trip-chunk-link is-disabled">Older</span>';

    var html =
      '<div class="trip-chunk-bar">' +
      newer +
      '<span class="trip-chunk-label">' +
      label +
      "</span>" +
      older +
      "</div>";

    nodes.forEach(function (el) {
      el.hidden = false;
      el.innerHTML = html;
    });
  }

  function mountTripJumpNav(toc, opts) {
    opts = opts || {};
    var chunkIndex = opts.chunkIndex || 0;
    var chunkCount = opts.chunkCount || 1;
    var nav = document.getElementById("trip-jump");
    var panel = document.getElementById("trip-jump-panel");
    var toggle = document.getElementById("trip-jump-toggle");
    var topBtn = document.getElementById("trip-jump-top");
    var oldestBtn = document.getElementById("trip-jump-oldest");
    if (!nav || !panel || !toggle || !topBtn || !oldestBtn) return;

    var months = [];
    (toc || []).forEach(function (y) {
      (y.months || []).forEach(function (m) {
        months.push({
          id: m.id,
          label: String(m.name || "").slice(0, 3) + " " + y.year,
        });
      });
    });

    if (!months.length) {
      nav.hidden = true;
      panel.innerHTML = "";
      return;
    }

    nav.hidden = false;

    var html = "";
    if (chunkIndex > 0) {
      html +=
        '<a class="trip-jump-page trip-jump-newer" href="' +
        escapeHtml(chunkHref(chunkIndex - 1)) +
        '">Newer</a>';
    }
    html +=
      '<ul class="trip-jump-months">' +
      months
        .map(function (m) {
          return (
            '<li><button type="button" class="trip-jump-month" data-jump="' +
            escapeHtml(m.id) +
            '">' +
            escapeHtml(m.label) +
            "</button></li>"
          );
        })
        .join("") +
      "</ul>";

    if (chunkIndex < chunkCount - 1) {
      html +=
        '<a class="trip-jump-page trip-jump-older" href="' +
        escapeHtml(chunkHref(chunkIndex + 1)) +
        '">Older</a>';
    }
    panel.innerHTML = html;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
      nav.classList.toggle("is-open", open);
    }

    setOpen(false);

    toggle.onclick = function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    };

    topBtn.onclick = function () {
      setOpen(false);
      if (chunkIndex > 0) {
        location.href = chunkHref(0);
        return;
      }
      var first = document.querySelector("#trips-list .trip-entry, #trips-list .trip-card");
      if (first) smoothScrollTo(first, "start");
      else smoothScrollToPosition(0);
    };

    oldestBtn.onclick = function () {
      setOpen(false);
      if (chunkIndex < chunkCount - 1) {
        location.href = chunkHref(chunkCount - 1);
        return;
      }
      var cards = document.querySelectorAll(
        "#trips-list .trip-card, #trips-list .trip-entry"
      );
      var last = cards[cards.length - 1];
      if (last) smoothScrollTo(last, "end");
      else smoothScrollToPosition(document.body.scrollHeight);
    };

    if (!mountTripJumpNav.clickBound) {
      mountTripJumpNav.clickBound = true;
      document.addEventListener("click", function (e) {
        if (!nav.classList.contains("is-open") || nav.contains(e.target)) return;
        setOpen(false);
      });
    }

    panel.onclick = function (e) {
      var monthBtn = e.target.closest(".trip-jump-month");
      if (!monthBtn || !panel.contains(monthBtn)) return;
      setOpen(false);
      scrollToTripId(monthBtn.getAttribute("data-jump"));
    };

    if (!mountTripJumpNav.scrollBound) {
      mountTripJumpNav.scrollBound = true;
      window.addEventListener(
        "scroll",
        function () {
          var bar = document.getElementById("trip-jump");
          if (!bar || bar.hidden || !bar.classList.contains("is-open")) return;
          bar.classList.remove("is-open");
          var p = document.getElementById("trip-jump-panel");
          var t = document.getElementById("trip-jump-toggle");
          if (p) p.hidden = true;
          if (t) t.setAttribute("aria-expanded", "false");
        },
        { passive: true }
      );
    }
  }

  function initTips(root) {
    var types = [
      "casual",
      "hiking",
      "cycling",
      "camping",
      "backpacking",
      "scrambling",
      "climbing",
      "kayaking",
    ];
    root.querySelectorAll(".trip-tag").forEach(function (el) {
      var fromClass = types.find(function (t) {
        return el.classList.contains(t);
      });
      var label = el.getAttribute("title") || TAG_LABELS[fromClass] || fromClass;
      if (!label) return;
      el.dataset.tip = label;
      el.setAttribute("aria-label", label);
      el.removeAttribute("title");
    });
  }

  // CSS column-count re-balances every time a photo loads, reshuffling photos
  // between columns mid-scroll. Prefer stored width/height; otherwise wait until
  // naturalWidth is known, then split top-to-bottom into two columns once.
  function imgRatio(img) {
    var w = Number(img.getAttribute("width")) || img.naturalWidth;
    var h = Number(img.getAttribute("height")) || img.naturalHeight;
    if (w && h) return h / w;
    return 1;
  }

  function imgHasRatio(img) {
    if (Number(img.getAttribute("width")) && Number(img.getAttribute("height"))) {
      return true;
    }
    return img.naturalWidth > 0 || img.dataset.failed === "1";
  }

  function placeGallery(gallery, imgs) {
    var bestK = splitIndexForRatios(imgs.map(imgRatio));
    var cols = gallery.querySelectorAll(".trip-gallery-col");
    imgs.forEach(function (img, idx) {
      cols[idx < bestK ? 0 : 1].appendChild(img);
    });
    gallery.classList.remove("is-measuring");
  }

  function layoutGalleries(root) {
    var galleries = Array.prototype.slice.call(
      root.querySelectorAll(".trip-gallery.is-measuring")
    );
    if (!galleries.length) return;
    var start = Date.now();
    var pending = galleries.map(function (gallery) {
      var imgs = Array.prototype.slice.call(gallery.querySelectorAll("img"));
      imgs.forEach(bindPhotoFallback);
      return { gallery: gallery, imgs: imgs };
    });

    function tick() {
      var timedOut = Date.now() - start > GALLERY_MEASURE_TIMEOUT_MS;
      pending = pending.filter(function (item) {
        var ready = item.imgs.every(imgHasRatio);
        if (ready || timedOut) {
          placeGallery(item.gallery, item.imgs);
          return false;
        }
        return true;
      });
      if (pending.length) setTimeout(tick, 60);
    }
    tick();
  }

  async function fetchTrips(url) {
    var res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load " + url);
    return res.json();
  }

  async function loadTripsData(config) {
    var urls = [config.tripsUrl, config.tripsFallbackUrl].filter(Boolean);
    var lastErr;
    for (var i = 0; i < urls.length; i++) {
      try {
        return await fetchTrips(urls[i]);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("No trips source");
  }

  function hashTrips(trips) {
    var s = trips
      .map(function (t) {
        var photos = (t.photos || []).map(photoSrc).join("|");
        var tags = (t.tags || []).join(",");
        return [
          t.id,
          t.date,
          t.endDate,
          t.title,
          tags,
          t.report,
          t.coverPhoto || "",
          tripPhotoCount(t),
          photos,
        ].join("\u001f");
      })
      .join("\u001e");
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  function chunkBarHtml(chunks, index, baseHref) {
    var label = escapeHtml(chunkRangeLabel(chunks[index] || { trips: [] }));
    var newer =
      index > 0
        ? '<a class="trip-chunk-link" href="' +
          escapeHtml(chunkHref(index - 1, baseHref)) +
          '">Newer</a>'
        : '<span class="trip-chunk-link is-disabled">Newer</span>';
    var older =
      index < chunks.length - 1
        ? '<a class="trip-chunk-link" href="' +
          escapeHtml(chunkHref(index + 1, baseHref)) +
          '">Older</a>'
        : '<span class="trip-chunk-link is-disabled">Older</span>';
    return (
      '<div class="trip-chunk-bar">' +
      newer +
      '<span class="trip-chunk-label">' +
      label +
      "</span>" +
      older +
      "</div>"
    );
  }

  // Every chunk stays in the HTML. CSS shows one. Google can read the rest.
  function buildArchiveHtml(sorted, budget, baseHref) {
    var chunks = chunkTripsByPhotos(sorted, budget);
    var usedIds = Object.create(null);
    var list = chunks
      .map(function (chunk, i) {
        var rendered = renderAll(chunk.trips, usedIds, i > 0);
        return (
          '<div class="trip-chunk" data-chunk="' +
          i +
          '">' +
          rendered.html +
          "</div>"
        );
      })
      .join("");
    var nav = "";
    if (chunks.length > 1) {
      nav = chunks
        .map(function (_, i) {
          return (
            '<div class="trip-chunk-bar-set" data-chunk-nav="' +
            i +
            '">' +
            chunkBarHtml(chunks, i, baseHref) +
            "</div>"
          );
        })
        .join("");
    }
    return {
      listHtml: list,
      navHtml: nav,
      hash: hashTrips(sorted),
      chunkCount: chunks.length,
      chunks: chunks,
    };
  }

  function paintArchive(target, sorted, budget, index) {
    var built = buildArchiveHtml(sorted, budget);
    document.documentElement.setAttribute("data-trip-chunk", String(index));
    var same =
      target.getAttribute("data-trips-hash") === built.hash &&
      !!target.querySelector(".trip-chunk");
    if (!same) {
      target.innerHTML = built.listHtml;
      target.setAttribute("data-trips-hash", built.hash);
    }
    var visible = visibleTripRoot(target, index);
    activateImages(visible);
    layoutGalleries(visible);
    initTips(document);
    mountTripJumpNav(tocFromChunk(visible), {
      chunkIndex: index,
      chunkCount: built.chunkCount,
    });
    mountChunkNav(built.chunks, index);
    return visible;
  }

  window.NatureTripStatic = {
    sortTrips: sortTrips,
    normalizeTrip: normalizeTrip,
    buildArchiveHtml: buildArchiveHtml,
    renderTrip: renderTrip,
    renderAll: renderAll,
    hashTrips: hashTrips,
  };

  window.renderNatureTrips = async function (targetSelector) {
    var target = document.querySelector(targetSelector);
    if (!target) return;
    var config = window.NATURE_CONFIG || {};
    var budget = Number(config.tripPageSize);
    if (!isFinite(budget) || budget < 1) budget = 8;
    var params = new URLSearchParams(location.search);
    var detailId =
      params.get("trip") ||
      document.documentElement.getAttribute("data-static-trip-id") ||
      "";
    var requestedPage = Number(
      document.documentElement.getAttribute("data-static-trip-page") ||
      params.get("page") ||
      1
    );
    if (!isFinite(requestedPage) || requestedPage < 1) requestedPage = 1;
    var hasPrerender = !!target.querySelector(".trip-chunk, .trip-detail");

    function apiUrlForList() {
      var api = new URL(config.tripsUrl, location.href);
      api.searchParams.set("page", String(requestedPage));
      api.searchParams.set("limit", String(budget));
      return api.href;
    }

    function apiUrlForDetail(id) {
      return (
        String(config.tripsUrl || "").replace(/\/$/, "") +
        "/" +
        encodeURIComponent(id) +
        "?limit=" +
        encodeURIComponent(budget)
      );
    }

    function renderDetailPage(trip, archivePage) {
      document.documentElement.setAttribute("data-trip-view", "detail");
      mountTripJumpNav([]);
      mountChunkNav([], 0);
      if (!trip) {
        document.title = "Trip not found | Rongwu Xu";
        target.innerHTML =
          '<p class="trip-detail-back"><a href="/trip.html">← Back to trips</a></p>' +
          '<p class="trips-load-error">This trip could not be found.</p>';
        document.documentElement.setAttribute("data-trip-detail-ready", "");
        return;
      }

      trip = normalizeTrip(trip);
      var backPage = Math.max(1, Number(archivePage) || 1);
      var backHref =
        backPage <= 1
          ? "/trip.html#trip-chunk-start"
          : "/trips/page/" + backPage + "/#trip-chunk-start";
      document.title = (trip.title || "Trip") + " | Rongwu Xu";
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && !document.documentElement.hasAttribute("data-static-trip-id")) {
        canonical.href =
          "https://rongwuxu.com/trip.html?trip=" + encodeURIComponent(trip.id);
      }
      var description = document.querySelector('meta[name="description"]');
      if (description) {
        description.content =
          (trip.title || "Trip") + " — outdoor trip report by Rongwu Xu.";
      }
      target.innerHTML =
        '<p class="trip-detail-back"><a href="' +
        escapeHtml(backHref) +
        '">← Back to trips</a></p>' +
        '<div class="trip-detail">' +
        renderTrip(trip, {
          detail: true,
          eagerCount: GALLERY_EAGER_COUNT,
        }) +
        "</div>" +
        '<p class="trip-detail-back trip-detail-back-bottom"><a href="' +
        escapeHtml(backHref) +
        '">← Back to trips</a></p>';
      activateImages(target);
      layoutGalleries(target);
      initTips(target);
      if (typeof window.bindNatureMapButtons === "function") {
        var detailById = Object.create(null);
        detailById[trip.id] = trip;
        window.bindNatureMapButtons(target, detailById);
      }
      requestAnimationFrame(function () {
        document.documentElement.setAttribute("data-trip-detail-ready", "");
      });
    }

    function renderArchivePage(trips, pagination) {
      var sorted = sortTrips((trips || []).map(normalizeTrip));
      document.documentElement.setAttribute("data-trip-view", "archive");
      document.documentElement.setAttribute("data-trip-chunk", "0");
      if (!sorted.length) {
        target.innerHTML = '<p class="trips-load-error">No trips yet.</p>';
        mountTripJumpNav([]);
        mountChunkNav([], 0);
        return;
      }

      var rendered = renderAll(sorted, Object.create(null), requestedPage > 1);
      target.innerHTML =
        '<div class="trip-chunk" data-chunk="0">' + rendered.html + "</div>";
      target.setAttribute("data-trips-hash", hashTrips(sorted));
      var visible = target.querySelector(".trip-chunk");
      activateImages(visible);
      layoutGalleries(visible);
      initTips(document);

      var page = Number(pagination && pagination.page) || requestedPage;
      var pages = Number(pagination && pagination.pages) || 1;
      var navChunks = Array.from({ length: pages }, function () {
        return { trips: [] };
      });
      navChunks[page - 1] = { trips: sorted };
      mountTripJumpNav(tocFromChunk(visible), {
        chunkIndex: page - 1,
        chunkCount: pages,
      });
      mountChunkNav(navChunks, page - 1);

      var hashId = location.hash ? location.hash.slice(1) : "";
      if (hashId === "trip-chunk-start") {
        requestAnimationFrame(scrollToChunkStart);
      } else if (hashId && document.getElementById(hashId)) {
        requestAnimationFrame(function () {
          scrollToTripId(hashId);
        });
      } else if (page > 1) {
        requestAnimationFrame(scrollToChunkStart);
      }
    }

    try {
      if (detailId) {
        try {
          var detailPayload = await fetchTrips(apiUrlForDetail(detailId));
          renderDetailPage(detailPayload.trip, detailPayload.archivePage);
          return;
        } catch (detailErr) {
          var fallbackDetail = await fetchTrips(config.tripsFallbackUrl);
          var fallbackSorted = sortTrips(
            (fallbackDetail.trips || []).map(normalizeTrip)
          );
          var fallbackIndex = fallbackSorted.findIndex(function (trip) {
            return trip.id === detailId;
          });
          renderDetailPage(
            fallbackIndex >= 0 ? fallbackSorted[fallbackIndex] : null,
            fallbackIndex >= 0 ? Math.floor(fallbackIndex / budget) + 1 : 1
          );
          return;
        }
      }

      try {
        var pagePayload = await fetchTrips(apiUrlForList());
        renderArchivePage(pagePayload.trips, pagePayload.pagination);
      } catch (pageErr) {
        var fallback = await fetchTrips(config.tripsFallbackUrl);
        var all = sortTrips((fallback.trips || []).map(normalizeTrip));
        var start = (requestedPage - 1) * budget;
        renderArchivePage(all.slice(start, start + budget), {
          page: requestedPage,
          limit: budget,
          total: all.length,
          pages: Math.max(1, Math.ceil(all.length / budget)),
        });
      }
    } catch (err) {
      if (!hasPrerender) {
        target.innerHTML =
          '<p class="trips-load-error">Could not load trips. Please try again.</p>';
        mountTripJumpNav([]);
        mountChunkNav([], 0);
      }
      console.error(err);
    }
  };
})();
