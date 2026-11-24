// Writes the trip list into trip.html so the archive is in the first HTML response.
// Run from the repo root: node scripts/prerender-trips.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { imageDimensions } = require("./photo-size");

const root = path.resolve(__dirname, "..");
const tripPath = path.join(root, "trip.html");
const dataPath = path.join(root, "data", "trips.json");
const workerUrl =
  "https://photos.rongwuxu.com/api/trips";

function loadRenderer() {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "javascripts", "nature-config.js"), "utf8"),
    sandbox
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "javascripts", "nature-trips.js"), "utf8"),
    sandbox
  );
  const api = sandbox.window.NatureTripStatic;
  if (!api || typeof api.buildArchiveHtml !== "function") {
    throw new Error("NatureTripStatic.buildArchiveHtml is missing");
  }
  return api;
}

function photoUrl(photo) {
  if (!photo) return "";
  if (typeof photo === "string") return photo.split("?")[0];
  return String(photo.url || photo.src || "").split("?")[0];
}

let exifr;
try {
  exifr = require(path.join(root, "trip-worker/node_modules/exifr"));
} catch (err) {
  exifr = null;
}

async function fetchImageSize(url) {
  const res = await fetch(url, {
    headers: {
      Range: "bytes=0-1048575",
      "User-Agent": "pillowsofwind-prerender/1.0",
    },
  });
  if (!res.ok && res.status !== 206) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  let dim = imageDimensions(buf);
  if (exifr) {
    try {
      const exif = await exifr.parse(buf, { pick: ["Orientation"] });
      const o = exif && Number(exif.Orientation);
      if (dim && o >= 5 && o <= 8) {
        dim = { width: dim.height, height: dim.width };
      }
    } catch (err) {
      // keep SOF size
    }
  }
  return dim;
}

async function fillPhotoDimensions(data) {
  const jobs = [];
  (data.trips || []).forEach(function (trip) {
    trip.photoDimensions = trip.photoDimensions || {};
    (trip.photos || []).forEach(function (photo) {
      const url = photoUrl(photo);
      if (!url) return;
      const have = trip.photoDimensions[url];
      if (have && have.width && have.height) return;
      jobs.push({ trip: trip, url: url });
    });
  });
  if (!jobs.length) {
    console.log("photo dimensions already present");
    return data;
  }
  console.log("fetching dimensions for", jobs.length, "photos");
  let i = 0;
  let filled = 0;
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        const dim = await fetchImageSize(job.url);
        if (dim) {
          job.trip.photoDimensions[job.url] = dim;
          filled += 1;
        }
      } catch (err) {
        // keep going; gallery can still measure at runtime
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, function () { return worker(); }));
  console.log("stored dimensions for", filled, "photos");
  return data;
}

async function loadTrips() {
  let data;
  try {
    const res = await fetch(workerUrl + "?all=1", {
      headers: {
        Accept: "application/json",
        "User-Agent": "pillowsofwind-prerender/1.0",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const listing = await res.json();
    const summaries = listing.trips || [];
    const trips = new Array(summaries.length);
    let next = 0;
    async function detailWorker() {
      while (next < summaries.length) {
        const i = next++;
        const detailRes = await fetch(
          workerUrl + "/" + encodeURIComponent(summaries[i].id),
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "pillowsofwind-prerender/1.0",
            },
          }
        );
        if (!detailRes.ok) throw new Error("detail HTTP " + detailRes.status);
        trips[i] = (await detailRes.json()).trip;
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(8, summaries.length) }, detailWorker)
    );
    data = { publicBaseUrl: listing.publicBaseUrl, trips };
    console.log("loaded live trips from worker");
  } catch (err) {
    console.warn("worker unavailable (" + err.message + "); using data/trips.json");
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }
  try {
    const local = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    const byId = Object.create(null);
    (local.trips || []).forEach(function (trip) {
      if (trip && trip.id) byId[trip.id] = trip;
    });
    (data.trips || []).forEach(function (trip) {
      const prev = byId[trip.id];
      if (!prev || !prev.photoDimensions) return;
      trip.photoDimensions = Object.assign(
        {},
        prev.photoDimensions,
        trip.photoDimensions || {}
      );
    });
  } catch (err) {
    // no local cache yet
  }
  await fillPhotoDimensions(data);
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  console.log("saved trips to data/trips.json");
  return data;
}

function replaceMarked(html, start, end, inner) {
  const pattern = new RegExp(
    start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "[\\s\\S]*?" +
      end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  if (!pattern.test(html)) throw new Error("missing markers " + start);
  return html.replace(pattern, start + inner + end);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// from: "root" (trip.html), "page" (trips/page/N/), or "detail" (trips/id/)
function archiveHref(index, from) {
  from = from || "root";
  if (index <= 0) {
    return from === "root"
      ? "trip.html#trip-chunk-start"
      : "../../trip.html#trip-chunk-start";
  }
  if (from === "root") {
    return "trips/page/" + (index + 1) + "/#trip-chunk-start";
  }
  if (from === "page") {
    return "../" + (index + 1) + "/#trip-chunk-start";
  }
  return "../page/" + (index + 1) + "/#trip-chunk-start";
}

function rangeLabel(trips) {
  if (!trips.length) return "";
  const short = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const first = short.format(new Date(trips[0].date + "T00:00:00Z"));
  const last = short.format(
    new Date(trips[trips.length - 1].date + "T00:00:00Z")
  );
  return first === last ? first : first + " – " + last;
}

function pageNavHtml(trips, pageIndex, pageCount) {
  if (pageCount <= 1) return "";
  const from = pageIndex > 0 ? "page" : "root";
  const newer =
    pageIndex > 0
      ? '<a class="trip-chunk-link" href="' +
        archiveHref(pageIndex - 1, from) +
        '">Newer</a>'
      : '<span class="trip-chunk-link is-disabled">Newer</span>';
  const older =
    pageIndex < pageCount - 1
      ? '<a class="trip-chunk-link" href="' +
        archiveHref(pageIndex + 1, from) +
        '">Older</a>'
      : '<span class="trip-chunk-link is-disabled">Older</span>';
  return (
    '<div class="trip-chunk-bar-set" data-chunk-nav="0">' +
    '<div class="trip-chunk-bar">' +
    newer +
    '<span class="trip-chunk-label">' +
    escapeHtml(rangeLabel(trips)) +
    "</span>" +
    older +
    "</div></div>"
  );
}

// Nested pages live two directories below the site root (trips/page/N or trips/id).
// Prefer relative asset paths so file:// previews work the same as https.
function nestRelativeAssets(html, depth) {
  const prefix = "../".repeat(depth);
  return html
    .replace(/(["'])\.\//g, "$1" + prefix)
    .replace(/(href|src)="\/(?!\/)/g, "$1=\"" + prefix)
    .replace(/href="trips\//g, 'href="' + prefix + "trips/");
}

function setHtmlAttributes(html, attrs) {
  return html.replace(
    /<html(?:\s[^>]*)?>/,
    "<html " +
      Object.entries(attrs)
        .map(([key, value]) =>
          value === "" ? key : key + '="' + escapeHtml(value) + '"'
        )
        .join(" ") +
      ">"
  );
}

function setMetadata(html, title, description, canonical) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, "<title>" + escapeHtml(title) + "</title>")
    .replace(
      /<meta name="description" content="[^"]*">/,
      '<meta name="description" content="' + escapeHtml(description) + '">'
    )
    .replace(
      /<link rel="canonical" href="[^"]*">/,
      '<link rel="canonical" href="' + escapeHtml(canonical) + '">'
    );
}

async function main() {
  const api = loadRenderer();
  const data = await loadTrips();
  const sorted = api.sortTrips((data.trips || []).map(api.normalizeTrip));
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const template = fs.readFileSync(tripPath, "utf8");
  const generatedRoot = path.join(root, "trips");
  fs.rmSync(generatedRoot, { recursive: true, force: true });

  function archiveDocument(pageIndex) {
    const pageTrips = sorted.slice(
      pageIndex * pageSize,
      (pageIndex + 1) * pageSize
    );
    const built = api.buildArchiveHtml(
      pageTrips,
      pageSize,
      "https://rongwuxu.com/trip.html"
    );
    let html = template.replace(
      /id="trips-list"(?: data-trips-hash="[^"]*")?/,
      'id="trips-list" data-trips-hash="' + built.hash + '"'
    );
    html = replaceMarked(
      html,
      "<!-- static-trips:start -->",
      "<!-- static-trips:end -->",
      "\n" + built.listHtml + "\n                "
    );
    html = replaceMarked(
      html,
      "<!-- static-chunk-nav:start -->",
      "<!-- static-chunk-nav:end -->",
      pageNavHtml(pageTrips, pageIndex, pageCount)
    );
    html = html.replace(
      /<nav class="trip-chunk-nav" data-trip-chunk-nav(?: hidden)?/,
      '<nav class="trip-chunk-nav" data-trip-chunk-nav'
    );
    if (pageIndex > 0) {
      html = setHtmlAttributes(html, {
        "data-static-trip-page": String(pageIndex + 1),
      });
      html = setMetadata(
        html,
        "Trip Archive — Page " + (pageIndex + 1) + " | Rongwu Xu",
        "Older outdoor trips by Rongwu Xu.",
        "https://rongwuxu.com/trips/page/" + (pageIndex + 1) + "/"
      );
      html = nestRelativeAssets(html, 2);
      // Cards were built as trips/id/ (site-root relative); rewrite for trips/page/N/.
      html = html.replace(/href="trips\//g, 'href="../');
    }
    return html;
  }

  fs.writeFileSync(tripPath, archiveDocument(0));
  for (let pageIndex = 1; pageIndex < pageCount; pageIndex++) {
    const dir = path.join(generatedRoot, "page", String(pageIndex + 1));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), archiveDocument(pageIndex));
  }

  sorted.forEach(function (trip, index) {
    const pageIndex = Math.floor(index / pageSize);
    const backHref = archiveHref(pageIndex, "detail");
    const detailHtml =
      '<p class="trip-detail-back"><a href="' +
      backHref +
      '">← Back to trips</a></p>' +
      '<div class="trip-detail">' +
      api.renderTrip(trip, { detail: true, eagerCount: 1 }) +
      "</div>" +
      '<p class="trip-detail-back trip-detail-back-bottom"><a href="' +
      backHref +
      '">← Back to trips</a></p>';
    let html = replaceMarked(
      template,
      "<!-- static-trips:start -->",
      "<!-- static-trips:end -->",
      "\n" + detailHtml + "\n                "
    );
    html = replaceMarked(
      html,
      "<!-- static-chunk-nav:start -->",
      "<!-- static-chunk-nav:end -->",
      ""
    );
    html = setHtmlAttributes(html, {
      "data-static-trip-id": trip.id,
      "data-trip-view": "detail",
      "data-trip-detail-ready": "",
    });
    html = setMetadata(
      html,
      (trip.title || "Trip") + " | Rongwu Xu",
      (trip.title || "Trip") + " — outdoor trip report by Rongwu Xu.",
      "https://rongwuxu.com/trips/" + encodeURIComponent(trip.id) + "/"
    );
    html = nestRelativeAssets(html, 2);
    const dir = path.join(generatedRoot, trip.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), html);
  });

  const sitemapPath = path.join(root, "sitemap.xml");
  const baseUrls = [
    "https://rongwuxu.com/",
    "https://rongwuxu.com/trip.html",
    "https://rongwuxu.com/misc.html",
    "https://rongwuxu.com/pickle-juice.html",
  ];
  for (let i = 1; i < pageCount; i++) {
    baseUrls.push("https://rongwuxu.com/trips/page/" + (i + 1) + "/");
  }
  sorted.forEach((trip) => {
    baseUrls.push(
      "https://rongwuxu.com/trips/" + encodeURIComponent(trip.id) + "/"
    );
  });
  fs.writeFileSync(
    sitemapPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      baseUrls
        .map((url) => "  <url>\n    <loc>" + escapeHtml(url) + "</loc>\n  </url>")
        .join("\n") +
      "\n</urlset>\n"
  );

  console.log(
    "generated",
    pageCount,
    "archive pages and",
    sorted.length,
    "detail pages"
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
