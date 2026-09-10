(function () {
  var TAG_LABELS = {
    scrambling: "scrambling",
  };

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
    var photos = (trip.photos || [])
      .map(function (photo) {
        var src = photoSrc(photo);
        if (!src) return "";
        return '<img src="' + escapeHtml(src) + '" alt="" decoding="async">';
      })
      .join("");
    var gallery = photos
      ? '<div class="trip-gallery">' + photos + "</div>"
      : "";

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

  function chunkHref(index) {
    var url = new URL(location.href);
    if (index <= 0) url.searchParams.delete("chunk");
    else url.searchParams.set("chunk", String(index));
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

  function renderAll(trips) {
    var sorted = sortTrips(trips.map(normalizeTrip));
    var html = "";
    var currentYear = null;
    var currentMonth = null;
    var toc = [];
    var isChunkStart = true;

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
        toc[toc.length - 1].months.push({
          name: currentMonth,
          id: monthId,
        });
      }
      html += renderTrip(trip, {
        isChunkStart: isChunkStart,
        monthId: monthId || "",
      });
      isChunkStart = false;
    });

    return {
      html: html,
      trips: sorted,
      toc: toc,
    };
  }

  function scrollToChunkStart() {
    var el =
      document.getElementById("trip-chunk-start") ||
      document.querySelector("[data-trip-chunk-start]") ||
      document.querySelector("#trips-list .trip-entry");
    if (el) el.scrollIntoView(true);
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

  window.renderNatureTrips = async function (targetSelector) {
    var target = document.querySelector(targetSelector);
    if (!target) return;
    var config = window.NATURE_CONFIG || {};
    var budget = Number(config.photoChunk);
    if (!isFinite(budget) || budget < 1) budget = 60;

    try {
      var data = await loadTripsData(config);
      var sorted = sortTrips((data.trips || []).map(normalizeTrip));
      var chunks = chunkTripsByPhotos(sorted, budget);
      if (!chunks.length) {
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

      var chunk = chunks[index];
      var rendered = renderAll(chunk.trips);
      target.innerHTML = rendered.html;
      initTips(document);
      mountTripJumpNav(rendered.toc, {
        chunkIndex: index,
        chunkCount: chunks.length,
      });
      mountChunkNav(chunks, index);

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
      rendered.trips.forEach(function (t) {
        if (t.id) byId[t.id] = t;
      });
      if (typeof window.bindNatureMapButtons === "function") {
        window.bindNatureMapButtons(target, byId);
      }
    } catch (err) {
      target.innerHTML =
        '<p class="trips-load-error">Could not load trips. Check trips.json on R2 or ./data/trips.json.</p>';
      mountTripJumpNav([]);
      mountChunkNav([], 0);
      console.error(err);
    }
  };
})();
