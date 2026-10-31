// Writes the trip list into trip.html so the archive is in the first HTML response.
// Run from the repo root: node scripts/prerender-trips.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const tripPath = path.join(root, "trip.html");
const dataPath = path.join(root, "data", "trips.json");
const workerUrl =
  "https://nature-trip-uploader.nature-trip-uploader.workers.dev/api/trips";

function loadRenderer() {
  const code = fs.readFileSync(
    path.join(root, "javascripts", "nature-trips.js"),
    "utf8"
  );
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const api = sandbox.window.NatureTripStatic;
  if (!api || typeof api.buildArchiveHtml !== "function") {
    throw new Error("NatureTripStatic.buildArchiveHtml is missing");
  }
  return api;
}

async function loadTrips() {
  try {
    const res = await fetch(workerUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "pillowsofwind-prerender/1.0",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
    console.log("saved live trips to data/trips.json");
    return data;
  } catch (err) {
    console.warn("worker unavailable (" + err.message + "); using data/trips.json");
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  }
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
