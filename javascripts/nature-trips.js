(function () {
  var TAG_LABELS = {
    scrambling: "scrambling",
  };
  var GALLERY_MEASURE_TIMEOUT_MS = 3000;
  var GALLERY_GAP_RATIO = 0.03;
  var GALLERY_SIZES = "(max-width: 720px) 100vw, 360px";
  var GALLERY_EAGER_COUNT = 6;

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
    return Object.assign({}, trip, {
      date: date === "0000-00-00" ? trip.date : date,
      endDate: endDate,
      year: year,
      month: month,
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
      '<div class="trip-title">' +
      escapeHtml(trip.title) +
      "</div>" +
      meta +
      report +
      gallery +
      "</article>"
    );
  }

  function tripPhotoCount(trip) {
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
    var current = [];
    var count = 0;
    sorted.forEach(function (trip) {
      var n = tripPhotoCount(trip);
      if (current.length && count + n > budget) {
        chunks.push({ trips: current, photos: count });
        current = [];
        count = 0;
      }
      current.push(trip);
      count += n;
    });
    if (current.length) chunks.push({ trips: current, photos: count });
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
    var url = new URL(baseHref || location.href);
    if (index <= 0) url.searchParams.delete("chunk");
    else url.searchParams.set("chunk", String(index));
    url.hash = "";
    // Land on the first trip of that chunk, not the page chrome.
    return url.pathname + url.search + "#trip-chunk-start";
  }

  function readChunkIndex(chunkCount) {
    var raw = new URLSearchParams(location.search).get("chunk");
    var n = parseInt(raw || "0", 10);
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
      html += renderTrip(trip, {
        isChunkStart: isChunkStart,
        monthId: monthId || "",
        deferSrc: !!lazyImages,
        eagerCount: lazyImages ? 0 : eagerLeft,
      });
      eagerLeft = Math.max(0, eagerLeft - tripPhotoCount(trip));
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
    root.querySelectorAll(".trip-gallery img").forEach(function (img) {
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
      (root && root.querySelector(".trip-entry")) ||
      document.getElementById("trip-chunk-start");
    if (el) el.scrollIntoView(true);
  }

  function tocFromChunk(root) {
    var months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    var byYear = [];
    var yearIndex = Object.create(null);
    if (!root) return byYear;
    root.querySelectorAll(".trip-entry[id]").forEach(function (el) {
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
    el.scrollIntoView(true);
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
    if (!nav || !panel || !toggle || !topBtn) return;

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

    var html =
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
        '<a class="trip-jump-older" href="' +
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
      var first = document.querySelector("#trips-list .trip-entry");
      if (first) first.scrollIntoView(true);
      else window.scrollTo(0, 0);
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
        return [t.id, t.date, t.endDate, t.title, tags, t.report, photos].join(
          "\u001f"
        );
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
  };

  window.renderNatureTrips = async function (targetSelector) {
    var target = document.querySelector(targetSelector);
    if (!target) return;
    var config = window.NATURE_CONFIG || {};
    var budget = Number(config.photoChunk);
    if (!isFinite(budget) || budget < 1) budget = 60;

    var prerenderHash = target.getAttribute("data-trips-hash") || "";
    var hasPrerender = !!target.querySelector(".trip-chunk");

    function finish(sorted) {
      var chunks = chunkTripsByPhotos(sorted, budget);
      if (!chunks.length) {
        if (hasPrerender) return;
        target.innerHTML = '<p class="trips-load-error">No trips yet.</p>';
        mountTripJumpNav([]);
        mountChunkNav([], 0);
        return;
      }

      var hashId = location.hash ? location.hash.slice(1) : "";
      var index = readChunkIndex(chunks.length);
      if (hashId && hashId !== "trip-chunk-start") {
        var hashChunk = findChunkIndexForHash(chunks, hashId);
        if (hashChunk >= 0 && hashChunk !== index) {
          location.replace(chunkHref(hashChunk).split("#")[0] + "#" + hashId);
          return;
        }
      }

      var visible = paintArchive(target, sorted, budget, index);
      var chunk = chunks[index];

      if (hashId === "trip-chunk-start") {
        requestAnimationFrame(scrollToChunkStart);
      } else if (hashId && document.getElementById(hashId)) {
        requestAnimationFrame(function () {
          scrollToTripId(hashId);
        });
      } else if (index > 0) {
        requestAnimationFrame(scrollToChunkStart);
      }

      var byId = Object.create(null);
      (chunk.trips || []).forEach(function (t) {
        if (t.id) byId[t.id] = t;
      });
      if (typeof window.bindNatureMapButtons === "function") {
        window.bindNatureMapButtons(visible || target, byId);
      }
    }

    try {
      var payloads = [];
      var urls = [config.tripsUrl, config.tripsFallbackUrl].filter(Boolean);
      var fromPrimary = false;
      var lastErr;
      for (var i = 0; i < urls.length; i++) {
        try {
          payloads.push(await fetchTrips(urls[i]));
          fromPrimary = i === 0 && !!config.tripsUrl;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      var parsed = payloads.map(function (data) {
        return sortTrips((data.trips || []).map(normalizeTrip));
      });
      var sorted = null;
      if (hasPrerender && prerenderHash) {
        for (var p = 0; p < parsed.length; p++) {
          if (hashTrips(parsed[p]) === prerenderHash) {
            sorted = parsed[p];
            break;
          }
        }
      }
      // A newer worker response replaces the saved HTML. A stale fallback does not.
      if (!sorted && parsed[0] && (fromPrimary || !hasPrerender)) {
        sorted = parsed[0];
      }
      if (!sorted && hasPrerender) {
        var hinted = document.documentElement.getAttribute("data-trip-chunk") || "0";
        var hintedIndex = parseInt(hinted, 10);
        if (!isFinite(hintedIndex) || hintedIndex < 0) hintedIndex = 0;
        var kept = visibleTripRoot(target, hintedIndex);
        activateImages(kept);
        layoutGalleries(kept);
        initTips(document);
        return;
      }
      if (!sorted) throw lastErr || new Error("No trips source");
      finish(sorted);
    } catch (err) {
      if (!hasPrerender) {
        target.innerHTML =
          '<p class="trips-load-error">Could not load trips. Check trips.json on R2 or ./data/trips.json.</p>';
        mountTripJumpNav([]);
        mountChunkNav([], 0);
      }
      console.error(err);
    }
  };
})();
