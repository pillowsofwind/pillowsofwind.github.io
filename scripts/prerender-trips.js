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
    const res = await fetch(workerUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "pillowsofwind-prerender/1.0",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    data = await res.json();
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

async function main() {
  const api = loadRenderer();
  const data = await loadTrips();
  const sorted = api.sortTrips((data.trips || []).map(api.normalizeTrip));
  const built = api.buildArchiveHtml(
    sorted,
    60,
    "https://rongwuxu.com/trip.html"
  );
  let html = fs.readFileSync(tripPath, "utf8");
  html = html.replace(
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
    built.navHtml
  );
  const navOpen =
    '<nav class="trip-chunk-nav" data-trip-chunk-nav hidden aria-label="Trip archive pages">';
  const navShown =
    '<nav class="trip-chunk-nav" data-trip-chunk-nav aria-label="Trip archive pages">';
  if (built.chunkCount > 1) {
    html = html.replace(navOpen, navShown);
  } else {
    html = html.replace(navShown, navOpen);
  }
  fs.writeFileSync(tripPath, html);
  console.log(
    "chunks",
    built.chunkCount,
    "trips",
    sorted.length,
    "hash",
    built.hash
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
