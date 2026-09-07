(function () {
  var TAG_LABELS = {
    mountaineering: "mountaineering/peakbagging",
  };

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function sortTrips(trips) {
    return trips.slice().sort(function (a, b) {
      if (a.year !== b.year) return b.year - a.year;
      return monthIndex(b.month) - monthIndex(a.month);
    });
  }

  function renderTags(tags) {
    if (!tags || !tags.length) return "";
    return (
      '<div class="trip-tags">' +
      tags
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
    var report = trip.report
      ? '<div class="trip-report">' + escapeHtml(trip.report) + "</div>"
      : "";
    var photos = (trip.photos || [])
      .map(function (src) {
        return '<img src="' + escapeHtml(src) + '" alt="">';
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
      report +
      gallery +
      "</article>"
    );
  }

  function renderAll(trips) {
    var sorted = sortTrips(trips);
    var html = "";
    var currentYear = null;
    var currentMonth = null;

    sorted.forEach(function (trip) {
      if (trip.year !== currentYear) {
        currentYear = trip.year;
        currentMonth = null;
        html += '<h2 class="trip-year">' + escapeHtml(currentYear) + "</h2>";
      }
      if (trip.month !== currentMonth) {
        currentMonth = trip.month;
        html += '<h3 class="trip-month">' + escapeHtml(currentMonth) + "</h3>";
      }
      html += renderTrip(trip);
    });

    return html;
  }

  function initTips(root) {
    var types = [
      "casual",
      "hiking",
      "cycling",
      "camping",
      "backpacking",
      "mountaineering",
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
      target.innerHTML = renderAll(data.trips || []);
      initTips(document);
    } catch (err) {
      target.innerHTML =
        '<p class="trips-load-error">Could not load trips. Check trips.json on R2 or ./data/trips.json.</p>';
      console.error(err);
    }
  };
})();
