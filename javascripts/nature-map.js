(function () {
  var map = null;
  var layerGroup = null;
  var baseLayers = {};
  var activeBase = "satellite";
  var libsPromise = null;
  var gpsCache = Object.create(null);
  var mapLoadId = 0;
  var waybackYears = [];
  var waybackPromise = null;
  var waybackIndex = -1;
  var satLayer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function workerBase() {
    var cfg = window.NATURE_CONFIG || {};
    return String(cfg.workerUrl || "").replace(/\/$/, "");
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureLibs() {
    if (libsPromise) return libsPromise;
    loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
    libsPromise = loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js").then(
      function () {
        if (!window.L) throw new Error("Leaflet failed to load");
      }
    );
    return libsPromise;
  }

  function setStatus(msg) {
    var el = $("trip-map-status");
    if (el) el.textContent = msg || "";
  }

  function setLoading(visible, message) {
    var el = $("trip-map-loading");
    var text = $("trip-map-loading-text");
    if (text && message) text.textContent = message;
    if (!el) return;
    el.classList.toggle("hidden", !visible);
  }

  function setBasemapButtons() {
    document.querySelectorAll("[data-basemap]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-basemap") === activeBase);
    });
    var yearRow = $("trip-map-year-row");
    if (yearRow) {
      yearRow.classList.toggle("hidden", activeBase !== "satellite");
    }
  }

  function waybackTileUrl(releaseNum) {
    return (
      "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/" +
      releaseNum +
      "/{z}/{y}/{x}"
    );
  }

  function updateYearLabel() {
    var label = $("trip-map-year-label");
    if (!label || waybackIndex < 0 || !waybackYears[waybackIndex]) {
      if (label) label.textContent = "";
      return;
    }
    var item = waybackYears[waybackIndex];
    label.textContent = String(item.year);
  }

  function applyWaybackYear(index) {
    if (!map || !waybackYears.length) return;
    index = Math.max(0, Math.min(waybackYears.length - 1, index));
    waybackIndex = index;
    var item = waybackYears[index];
    var next = window.L.tileLayer(waybackTileUrl(item.release), {
      maxZoom: 19,
      attribution:
        "Esri World Imagery Wayback (" +
        item.date +
        ") &mdash; Esri, Maxar, Earthstar Geographics",
    });
    if (activeBase === "satellite") {
      next.addTo(map);
      if (satLayer) map.removeLayer(satLayer);
    }
    satLayer = next;
    baseLayers.satellite = satLayer;
    updateYearLabel();
    var slider = $("trip-map-year");
    if (slider) {
      slider.value = String(index);
      slider.max = String(waybackYears.length - 1);
    }
  }

  async function loadWaybackYears() {
    if (waybackPromise) return waybackPromise;
    waybackPromise = fetch(
      "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer?f=json"
    )
      .then(function (res) {
        if (!res.ok) throw new Error("Wayback list failed");
        return res.json();
      })
      .then(function (data) {
        var byYear = Object.create(null);
        (data.Selection || []).forEach(function (item) {
          var m = String(item.Name || "").match(/(\d{4})-(\d{2})-(\d{2})/);
          if (!m) return;
          var year = Number(m[1]);
          // Selection is newest-first; keep first (= newest) per year
          if (byYear[year]) return;
          byYear[year] = {
            year: year,
            date: m[0],
            release: Number(item.M),
            name: item.Name,
          };
        });
        waybackYears = Object.keys(byYear)
          .map(Number)
          .sort(function (a, b) {
            return a - b;
          })
          .map(function (y) {
            return byYear[y];
          });
        return waybackYears;
      })
      .catch(function (err) {
        console.warn(err);
        waybackYears = [];
        return waybackYears;
      });
    return waybackPromise;
  }

  function initMap() {
    if (map) {
      setTimeout(function () {
        map.invalidateSize();
      }, 50);
      return;
    }
    var canvas = $("trip-map-canvas");
    map = window.L.map(canvas, {
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    }).setView([20, 0], 2);

    // Temporary current imagery until Wayback years load
    satLayer = window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      }
    );
    baseLayers.satellite = satLayer;
    baseLayers.terrain = window.L.tileLayer(
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 17,
        subdomains: "abc",
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      }
    );
    satLayer.addTo(map);
    layerGroup = window.L.layerGroup().addTo(map);
    activeBase = "satellite";
    setBasemapButtons();

    loadWaybackYears().then(function (years) {
      if (!years.length || !map) return;
      var slider = $("trip-map-year");
      if (slider) {
        slider.min = "0";
        slider.max = String(years.length - 1);
        slider.value = String(years.length - 1);
      }
      var minLabel = $("trip-map-year-min");
      var maxLabel = $("trip-map-year-max");
      if (minLabel) minLabel.textContent = String(years[0].year);
      if (maxLabel) maxLabel.textContent = String(years[years.length - 1].year);
      applyWaybackYear(years.length - 1);
      setBasemapButtons();
    });
  }

  function switchBasemap(name) {
    if (!map || !baseLayers[name] || name === activeBase) return;
    map.removeLayer(baseLayers[activeBase]);
    if (name === "satellite") {
      if (satLayer) {
        satLayer.addTo(map);
        baseLayers.satellite = satLayer;
      }
    } else {
      baseLayers[name].addTo(map);
    }
    activeBase = name;
    setBasemapButtons();
  }

  function fitToPhotoGps(points) {
    if (!map || !points || !points.length) return;
    var bounds = points.map(function (p) {
      return [p.lat, p.lng];
    });
    if (bounds.length === 1) {
      // A bit broader than street-level so surroundings are visible
      map.setView(bounds[0], 13);
      return;
    }
    var latLngBounds = window.L.latLngBounds(bounds);
    // Nearly identical points still get a sensible close zoom
    if (latLngBounds.getNorthEast().distanceTo(latLngBounds.getSouthWest()) < 40) {
      map.setView(latLngBounds.getCenter(), 12);
      return;
    }
    // Extra padding + lower max zoom = slightly larger region around the photos
    map.fitBounds(latLngBounds, { padding: [72, 72], maxZoom: 13 });
  }

  async function fetchGpsViaWorker(photos) {
    var base = workerBase();
    if (!base || !photos || !photos.length) return [];

    var res = await fetch(base + "/api/gps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: photos }),
    });
    if (!res.ok) throw new Error("GPS lookup failed (" + res.status + ")");
    var data = await res.json();
    var points = [];
    (data.points || []).forEach(function (p) {
      if (
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        isFinite(p.lat) &&
        isFinite(p.lng)
      ) {
        var point = { lat: p.lat, lng: p.lng, url: p.url || "" };
        if (p.url) gpsCache[p.url] = point;
        points.push(point);
      } else if (p && p.url) {
        gpsCache[p.url] = null;
      }
    });
    return points;
  }

  async function collectPoints(photos, stored) {
    var points = [];
    if (stored && stored.length) {
      stored.forEach(function (p) {
        if (
          p &&
          typeof p.lat === "number" &&
          typeof p.lng === "number" &&
          isFinite(p.lat) &&
          isFinite(p.lng)
        ) {
          points.push({
            lat: p.lat,
            lng: p.lng,
            url: p.url || "",
          });
        }
      });
      if (points.length) return points;
    }

    var list = photos || [];
    if (!list.length) return [];

    setStatus("Reading GPS from photos…");
    setLoading(true, "Please wait — GPS info is being loaded…");
    try {
      points = await fetchGpsViaWorker(list);
    } catch (err) {
      console.warn(err);
      setStatus("Could not read GPS (" + (err.message || "error") + ")");
      setLoading(false);
      return [];
    }
    return points;
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderMarkers(points) {
    layerGroup.clearLayers();
    var strip = $("trip-map-strip");
    if (strip) {
      strip.innerHTML = "";
      strip.classList.toggle("hidden", !points.length);
    }

    points.forEach(function (pt, idx) {
      var label = String(idx + 1);
      var thumb = pt.url
        ? '<img class="trip-map-thumb-img" src="' +
          escapeAttr(pt.url) +
          '" alt="Photo ' +
          label +
          '" loading="lazy">'
        : '<span class="trip-map-thumb-fallback">' + label + "</span>";

      var icon = window.L.divIcon({
        className: "trip-map-photo-marker",
        html:
          '<div class="trip-map-thumb">' +
          thumb +
          '<span class="trip-map-thumb-num">' +
          label +
          "</span></div>",
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -36],
      });

      var marker = window.L.marker([pt.lat, pt.lng], { icon: icon });
      var popupHtml =
        '<div class="trip-map-popup">' +
        (pt.url
          ? '<img src="' + escapeAttr(pt.url) + '" alt="Photo ' + label + '">'
          : "") +
        "<div>Photo " +
        label +
        " · " +
        pt.lat.toFixed(5) +
        ", " +
        pt.lng.toFixed(5) +
        "</div></div>";
      marker.bindPopup(popupHtml, { maxWidth: 240 });
      marker.addTo(layerGroup);

      if (strip && pt.url) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "trip-map-strip-item";
        btn.innerHTML =
          '<img src="' +
          escapeAttr(pt.url) +
          '" alt="Photo ' +
          label +
          '" loading="lazy">' +
          '<span>' +
          label +
          "</span>";
        btn.addEventListener("click", function () {
          map.setView([pt.lat, pt.lng], Math.max(map.getZoom(), 14));
          marker.openPopup();
        });
        strip.appendChild(btn);
      }
    });
    fitToPhotoGps(points);
  }

  function openModal(title) {
    var modal = $("trip-map-modal");
    $("trip-map-title").textContent = title || "Trip map";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("trip-map-open");
  }

  function closeModal() {
    var modal = $("trip-map-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("trip-map-open");
    setStatus("");
    setLoading(false);
  }

  async function showTripOnMap(trip) {
    var loadId = ++mapLoadId;
    openModal(trip.title || "Trip map");
    setStatus("Loading map…");
    setLoading(true, "Please wait — GPS info is being loaded…");
    try {
      await ensureLibs();
      if (loadId !== mapLoadId) return;
      initMap();
      // Clear previous trip immediately so old pins/photos don't linger
      if (layerGroup) layerGroup.clearLayers();
      var strip = $("trip-map-strip");
      if (strip) {
        strip.innerHTML = "";
        strip.classList.add("hidden");
      }
      map.setView([20, 0], 2);

      var points = await collectPoints(trip.photos || [], trip.photoLocations || []);
      if (loadId !== mapLoadId) return;
      if (!points.length) {
        layerGroup && layerGroup.clearLayers();
        if (strip) {
          strip.innerHTML = "";
          strip.classList.add("hidden");
        }
        setLoading(false);
        setStatus("No GPS found in these photos.");
        map.setView([20, 0], 2);
        return;
      }
      renderMarkers(points);
      setLoading(false);
      setStatus(points.length + " location" + (points.length === 1 ? "" : "s"));
      setTimeout(function () {
        if (loadId !== mapLoadId) return;
        map.invalidateSize();
        fitToPhotoGps(points);
      }, 120);
    } catch (err) {
      if (loadId !== mapLoadId) return;
      console.error(err);
      setLoading(false);
      setStatus(err.message || "Could not load map");
    }
  }

  function bindUi() {
    var modal = $("trip-map-modal");
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = "1";

    $("trip-map-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });
    document.querySelectorAll("[data-basemap]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchBasemap(btn.getAttribute("data-basemap"));
      });
    });
    var yearSlider = $("trip-map-year");
    if (yearSlider) {
      yearSlider.addEventListener("input", function () {
        if (activeBase !== "satellite") switchBasemap("satellite");
        applyWaybackYear(Number(yearSlider.value));
      });
    }
  }

  window.openNatureTripMap = function (trip) {
    bindUi();
    return showTripOnMap(trip || {});
  };

  window.bindNatureMapButtons = function (root, tripsById) {
    bindUi();
    (root || document).querySelectorAll("[data-trip-map]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-trip-map");
        var trip = tripsById && tripsById[id];
        if (!trip) {
          try {
            trip = JSON.parse(btn.getAttribute("data-trip-json") || "{}");
          } catch (e) {
            trip = {};
          }
        }
        window.openNatureTripMap(trip);
      });
    });
  };
})();
