#!/usr/bin/env node
/**
 * Fast HEIC→JPEG migration for remaining R2 photos.
 * Parallel workers + local wrangler binary (no npx).
 *
 * Usage (from trip-worker/):
 *   node scripts/migrate-heic.mjs
 */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKER_DIR = resolve(__dirname, "..");
const TMP = join(ROOT, ".heic-migrate-tmp");
const LOCAL_TRIPS = join(ROOT, "data", "trips.json");
const REMOTE_CACHE = join(ROOT, "data", "trips.remote.json");
const LOG = join(ROOT, "data", "heic-migrate.log");
const BUCKET = "trips";
const PUBLIC_BASE =
  "https://pub-ef165a3e20f24d10a0bafbb1aa236e40.r2.dev";
const JPEG_QUALITY = 75;
const CONCURRENCY = 5;
const DELETE_HEIC = false; // skip deletes for speed
const MAX_RETRIES = 3;

const WRANGLER = join(WORKER_DIR, "node_modules", ".bin", "wrangler");

function log(msg) {
  const line = typeof msg === "string" ? msg : String(msg);
  process.stdout.write(line + "\n");
  writeFileSync(LOG, line + "\n", { flag: "a" });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || WORKER_DIR,
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:${process.env.PATH}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else
        reject(
          new Error(
            `${cmd} ${args.join(" ")} failed (${code}): ${(stderr || stdout).trim().slice(-500)}`
          )
        );
    });
  });
}

async function withRetry(fn, label) {
  let last;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      log(`  retry ${i}/${MAX_RETRIES} ${label}: ${err.message.split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  throw last;
}

function wrangler(args) {
  return run(WRANGLER, args, { cwd: WORKER_DIR });
}

function keyFromUrl(url) {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.replace(/^\//, ""));
}

function publicUrlForKey(key) {
  return `${PUBLIC_BASE}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function jpgKeyFromHeicKey(key) {
  return key.replace(/\.hei[cf]$/i, ".jpg");
}

function isHeicUrl(url) {
  return /\.hei[cf]$/i.test(String(url).split("?")[0]);
}

async function downloadTripsJson() {
  log("Downloading remote trips.json…");
  await wrangler([
    "r2",
    "object",
    "get",
    `${BUCKET}/trips.json`,
    `--file=${REMOTE_CACHE}`,
    "--remote",
  ]);
  return JSON.parse(readFileSync(REMOTE_CACHE, "utf8"));
}

function loadBestLocalTrips() {
  // Prefer local checkpoint if it already has more JPEG URLs than remote.
  if (!existsSync(LOCAL_TRIPS)) return null;
  return JSON.parse(readFileSync(LOCAL_TRIPS, "utf8"));
}

function countHeic(data) {
  return data.trips
    .flatMap((t) => t.photos || [])
    .filter(isHeicUrl).length;
}

function mergeProgress(remote, local) {
  // Keep remote structure, but for any trip photo that local already
  // rewrote to jpg, prefer the local URL.
  if (!local?.trips) return remote;
  const localById = new Map(local.trips.map((t) => [t.id, t]));
  for (const trip of remote.trips) {
    const lt = localById.get(trip.id);
    if (!lt?.photos || !trip.photos) continue;
    trip.photos = trip.photos.map((url, i) => {
      const localUrl = lt.photos[i];
      if (localUrl && !isHeicUrl(localUrl) && isHeicUrl(url)) return localUrl;
      if (localUrl && !isHeicUrl(localUrl) && localUrl === url) return localUrl;
      return url;
    });
  }
  return remote;
}

async function uploadTripsJson(data) {
  const out = join(TMP, "trips.json");
  const body = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(out, body);
  writeFileSync(LOCAL_TRIPS, body);
  writeFileSync(REMOTE_CACHE, body);
  log("Uploading updated trips.json…");
  await withRetry(
    () =>
      wrangler([
        "r2",
        "object",
        "put",
        `${BUCKET}/trips.json`,
        `--file=${out}`,
        "--content-type=application/json",
        "--remote",
      ]),
    "trips.json put"
  );
}

async function convertOne(heicUrl) {
  const heicKey = keyFromUrl(heicUrl);
  const jpegKey = jpgKeyFromHeicKey(heicKey);
  const safe = heicKey.replace(/[\/\s]/g, "_");
  const heicPath = join(TMP, safe);
  const jpegPath = join(TMP, safe.replace(/\.hei[cf]$/i, ".jpg"));

  try {
    await wrangler([
      "r2",
      "object",
      "get",
      `${BUCKET}/${heicKey}`,
      `--file=${heicPath}`,
      "--remote",
    ]);
  } catch {
    // HEIC already removed in a prior run — assume JPEG is there.
    log(`  heic missing, linking ${jpegKey}`);
    return publicUrlForKey(jpegKey);
  }

  await run("sips", [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(JPEG_QUALITY),
    heicPath,
    "--out",
    jpegPath,
  ]);

  await withRetry(
    () =>
      wrangler([
        "r2",
        "object",
        "put",
        `${BUCKET}/${jpegKey}`,
        `--file=${jpegPath}`,
        "--content-type=image/jpeg",
        "--remote",
      ]),
    `put ${jpegKey}`
  );

  if (DELETE_HEIC && jpegKey !== heicKey) {
    try {
      await wrangler([
        "r2",
        "object",
        "delete",
        `${BUCKET}/${heicKey}`,
        "--remote",
      ]);
    } catch {
      /* ignore */
    }
  }

  try {
    unlinkSync(heicPath);
    unlinkSync(jpegPath);
  } catch {
    /* ignore */
  }

  return publicUrlForKey(jpegKey);
}

async function mapPool(items, concurrency, worker) {
  let idx = 0;
  let ok = 0;
  let fail = 0;
  const results = new Array(items.length);

  async function runner() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      const item = items[i];
      try {
        results[i] = await worker(item, i);
        ok += 1;
      } catch (err) {
        fail += 1;
        results[i] = { error: err };
        log(`  FAIL [${i + 1}/${items.length}]: ${err.message.split("\n")[0]}`);
      }
    }
  }

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runner()
  );
  await Promise.all(runners);
  return { results, ok, fail };
}

async function main() {
  if (!existsSync(WRANGLER)) {
    throw new Error("Local wrangler missing — run npm install in trip-worker/");
  }

  mkdirSync(TMP, { recursive: true });
  writeFileSync(LOG, `--- migrate start ${new Date().toISOString()} ---\n`);

  let data = await downloadTripsJson();
  const local = loadBestLocalTrips();
  if (local) {
    const before = countHeic(data);
    data = mergeProgress(data, local);
    const after = countHeic(data);
    log(`Merged local checkpoint: HEIC ${before} → ${after}`);
  }

  if (!Array.isArray(data.trips)) throw new Error("trips.json missing trips[]");

  const jobs = [];
  for (const trip of data.trips) {
    const photos = trip.photos || [];
    photos.forEach((url, i) => {
      if (isHeicUrl(url)) jobs.push({ trip, i, url });
    });
  }

  log(`Found ${jobs.length} HEIC/HEIF remaining. Concurrency=${CONCURRENCY}`);
  if (!jobs.length) {
    log("Nothing to do — uploading current trips.json anyway.");
    await uploadTripsJson(data);
    return;
  }

  const started = Date.now();
  let done = 0;

  const { ok, fail } = await mapPool(jobs, CONCURRENCY, async (job, jobIndex) => {
    const { trip, i, url } = job;
    log(`[${jobIndex + 1}/${jobs.length}] ${trip.title || trip.id}`);
    const jpegUrl = await convertOne(url);
    trip.photos[i] = jpegUrl;
    done += 1;
    log(`  → ${jpegUrl}`);
    if (done % 10 === 0) {
      const body = JSON.stringify(data, null, 2) + "\n";
      writeFileSync(LOCAL_TRIPS, body);
      writeFileSync(REMOTE_CACHE, body);
      log(`  checkpoint (${done} done, ${(Date.now() - started) / 1000 | 0}s)`);
    }
    return jpegUrl;
  });

  await uploadTripsJson(data);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  log(`\nDone in ${secs}s. Converted/linked: ${ok}, failed: ${fail}`);
  if (fail) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
