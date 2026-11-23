import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(here, "..");
const repoRoot = path.resolve(workerRoot, "..");
const sourcePath = path.resolve(
  process.env.TRIPS_JSON || path.join(repoRoot, "data", "trips.json")
);
const remote = process.argv.includes("--remote");
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function sql(value) {
  return "'" + String(value ?? "").replaceAll("'", "''") + "'";
}

function tripDate(trip) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(trip.date || ""))) return trip.date;
  const month = months.findIndex(
    (name) => name.toLowerCase() === String(trip.month || "").toLowerCase()
  );
  if (trip.year && month >= 0) {
    return `${trip.year}-${String(month + 1).padStart(2, "0")}-01`;
  }
  throw new Error(`Trip ${trip.id || "(missing id)"} has no valid date`);
}

function normalizeTrip(trip) {
  if (!trip || !trip.id || !trip.title) {
    throw new Error("Every trip must have an id and title");
  }
  const date = tripDate(trip);
  const monthIndex = Number(date.slice(5, 7)) - 1;
  const now = new Date().toISOString();
  return {
    id: String(trip.id),
    date,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(String(trip.endDate || ""))
      ? trip.endDate
      : date,
    year: Number(trip.year) || Number(date.slice(0, 4)),
    month: trip.month || months[monthIndex] || "",
    title: String(trip.title),
    tags: Array.isArray(trip.tags) ? trip.tags : [],
    report: String(trip.report || ""),
    photos: Array.isArray(trip.photos) ? trip.photos : [],
    coverPhoto: String(trip.coverPhoto || trip.photos?.[0] || ""),
    photoLocations: Array.isArray(trip.photoLocations)
      ? trip.photoLocations
      : [],
    photoDimensions:
      trip.photoDimensions && typeof trip.photoDimensions === "object"
        ? trip.photoDimensions
        : {},
    createdAt: trip.createdAt || trip.updatedAt || now,
    updatedAt: trip.updatedAt || trip.createdAt || now,
  };
}

function upsertSql(trip) {
  const values = [
    trip.id,
    trip.date,
    trip.endDate,
    trip.year,
    trip.month,
    trip.title,
    JSON.stringify(trip.tags),
    trip.report,
    JSON.stringify(trip.photos),
    trip.coverPhoto,
    JSON.stringify(trip.photoLocations),
    JSON.stringify(trip.photoDimensions),
    trip.createdAt,
    trip.updatedAt,
  ].map(sql);
  return `
INSERT INTO trips (
  id, date, end_date, year, month, title, tags_json, report, photos_json,
  cover_photo, photo_locations_json, photo_dimensions_json, created_at, updated_at
) VALUES (${values.join(", ")})
ON CONFLICT(id) DO UPDATE SET
  date=excluded.date,
  end_date=excluded.end_date,
  year=excluded.year,
  month=excluded.month,
  title=excluded.title,
  tags_json=excluded.tags_json,
  report=excluded.report,
  photos_json=excluded.photos_json,
  cover_photo=excluded.cover_photo,
  photo_locations_json=excluded.photo_locations_json,
  photo_dimensions_json=excluded.photo_dimensions_json,
  created_at=excluded.created_at,
  updated_at=excluded.updated_at;
`;
}

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const trips = (source.trips || []).map(normalizeTrip);
const ids = new Set();
for (const trip of trips) {
  if (ids.has(trip.id)) throw new Error(`Duplicate trip id: ${trip.id}`);
  ids.add(trip.id);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nature-trips-d1-"));
const sqlPath = path.join(tempDir, "import.sql");
fs.writeFileSync(sqlPath, trips.map(upsertSql).join("\n"));

try {
  const args = [
    "wrangler",
    "d1",
    "execute",
    "nature-trips",
    remote ? "--remote" : "--local",
    "--file",
    sqlPath,
  ];
  execFileSync("npx", args, {
    cwd: workerRoot,
    stdio: "inherit",
  });
  console.log(
    `Imported ${trips.length} trips from ${sourcePath} into ${
      remote ? "remote" : "local"
    } D1`
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
