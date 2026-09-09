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

  function renderTrip(trip) {
    var dateLabel = formatTripDateRange(trip.date, trip.endDate);
    var dateHtml = dateLabel
      ? '<div class="trip-date">' + escapeHtml(dateLabel) + "</div>"
      : "";
    var report = trip.report ? renderReport(trip.report) : "";
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
    var photos = (trip.photos || [])
      .map(function (src) {
        return (
          '<img src="' +
          escapeHtml(src) +
          '" alt="" loading="lazy" decoding="async">'
        );
      })
      .join("");
    var gallery = photos
      ? '<div class="trip-gallery">' + photos + "</div>"
      : "";

    return (
      '<article class="trip-entry">' +
      '<div class="trip-title">' +
      escapeHtml(trip.title) +
      "</div>" +
      renderTags(trip.tags) +
      dateHtml +
      mapBtn +
      report +
      gallery +
      "</article>"
    );
  }

  function renderAll(trips) {
    var sorted = sortTrips(trips.map(normalizeTrip));
    var html = "";
    var currentYear = null;
    var currentMonth = null;
    var toc = [];

    sorted.forEach(function (trip) {
      if (trip.year !== currentYear) {
        currentYear = trip.year;
        currentMonth = null;
        var yearId = "trip-year-" + currentYear;
        html +=
          '<h2 class="trip-year" id="' +
          escapeHtml(yearId) +
          '">' +
          escapeHtml(currentYear) +
          "</h2>";
        toc.push({ year: currentYear, id: yearId, months: [] });
      }
      if (trip.month !== currentMonth) {
        currentMonth = trip.month;
        var mi = monthIndex(currentMonth);
        var monthId =
          "trip-" +
          currentYear +
          "-" +
          String(mi || 0).padStart(2, "0");
        html +=
          '<h3 class="trip-month" id="' +
          escapeHtml(monthId) +
          '">' +
          escapeHtml(currentMonth) +
          "</h3>";
        toc[toc.length - 1].months.push({
          name: currentMonth,
          id: monthId,
        });
      }
      html += renderTrip(trip);
    });

    return { html: html, trips: sorted, toc: toc };
  }

  function scrollToTripId(id) {
    var el = document.getElementById(id);
    if (!el) return;
    // Instant jump only — smooth scroll crashes iPhone Safari on this image-heavy page.
    el.scrollIntoView(true);
  }

  function mountTripJumpNav(toc) {
    var nav = document.getElementById("trip-jump");
    var panel = document.getElementById("trip-jump-panel");
    var toggle = document.getElementById("trip-jump-toggle");
    var topBtn = document.getElementById("trip-jump-top");
    if (!nav || !panel || !toggle || !topBtn) return;

    if (!toc || !toc.length) {
      nav.hidden = true;
      panel.innerHTML = "";
      return;
    }

    nav.hidden = false;

    panel.innerHTML = toc
      .map(function (y, yi) {
        var monthsId = "trip-jump-months-" + yi;
        var monthItems = y.months
          .map(function (m, mi) {
            var label =
              yi === 0 && mi === 0
                ? escapeHtml(m.name) +
                  ' <span class="trip-jump-latest-tag">latest</span>'
                : escapeHtml(m.name);
            return (
              '<li><button type="button" class="trip-jump-month" data-jump="' +
              escapeHtml(m.id) +
              '">' +
              label +
              "</button></li>"
            );
          })
          .join("");
        return (
          '<div class="trip-jump-year-block">' +
          '<button type="button" class="trip-jump-year" aria-expanded="' +
          (yi === 0 ? "true" : "false") +
          '" aria-controls="' +
          monthsId +
          '">' +
          '<span class="trip-jump-year-label">' +
          escapeHtml(String(y.year)) +
          "</span>" +
          '<span class="trip-jump-year-meta">' +
          y.months.length +
          (y.months.length === 1 ? " month" : " months") +
          "</span>" +
          '<span class="trip-jump-chevron" aria-hidden="true"></span>' +
          "</button>" +
          '<ul class="trip-jump-months" id="' +
          monthsId +
          '"' +
          (yi === 0 ? "" : " hidden") +
          ">" +
          monthItems +
          "</ul>" +
          "</div>"
        );
      })
      .join("");

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
      window.scrollTo(0, 0);
    };

    if (!mountTripJumpNav.clickBound) {
      mountTripJumpNav.clickBound = true;
      document.addEventListener("click", function (e) {
        if (!nav.classList.contains("is-open") || nav.contains(e.target)) return;
        setOpen(false);
      });
    }

    panel.onclick = function (e) {
      var yearBtn = e.target.closest(".trip-jump-year");
      if (yearBtn && panel.contains(yearBtn)) {
        var monthsList = document.getElementById(
          yearBtn.getAttribute("aria-controls")
        );
        var expanded = yearBtn.getAttribute("aria-expanded") === "true";
        panel.querySelectorAll(".trip-jump-year").forEach(function (btn) {
          if (btn === yearBtn) return;
          btn.setAttribute("aria-expanded", "false");
          var other = document.getElementById(btn.getAttribute("aria-controls"));
          if (other) other.hidden = true;
        });
        yearBtn.setAttribute("aria-expanded", expanded ? "false" : "true");
        if (monthsList) monthsList.hidden = expanded;
        return;
      }

      var monthBtn = e.target.closest(".trip-jump-month");
      if (monthBtn && panel.contains(monthBtn)) {
        setOpen(false);
        scrollToTripId(monthBtn.getAttribute("data-jump"));
      }
    };
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
    try {
      var data = await loadTripsData(config);
      var rendered = renderAll(data.trips || []);
      target.innerHTML = rendered.html;
      initTips(document);
      mountTripJumpNav(rendered.toc);
      if (location.hash) {
        var hashId = location.hash.slice(1);
        if (hashId && document.getElementById(hashId)) {
          requestAnimationFrame(function () {
            scrollToTripId(hashId);
          });
        }
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
      console.error(err);
    }
  };
})();
