import exifr from "exifr";

const DEFAULT_PUBLIC_BASE =
  "https://pub-ef165a3e20f24d10a0bafbb1aa236e40.r2.dev";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ALLOWED_TAGS = [
  "casual",
  "hiking",
  "cycling",
  "camping",
  "backpacking",
  "scrambling",
  "kayaking",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function slugify(text) {
  return (
    String(text || "trip")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "trip"
  );
}

function extFromFile(file) {
  const name = file.name || "";
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  if (m) return m[1].toLowerCase();
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic" || file.type === "image/heif") return "heic";
  return "jpg";
}

function monthIndex(month) {
  const i = MONTHS.findIndex(
    (m) => m.toLowerCase() === String(month).toLowerCase()
  );
  return i >= 0 ? i + 1 : 0;
}

function parseTripDate(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  if (y < 2000 || y > 2100) return null;
  return s;
}

function partsFromDate(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: MONTHS[m - 1] };
}

function tripDateKey(trip) {
  if (trip.date && /^\d{4}-\d{2}-\d{2}$/.test(trip.date)) return trip.date;
  const mi = monthIndex(trip.month);
  if (trip.year && mi) {
    return `${trip.year}-${String(mi).padStart(2, "0")}-01`;
  }
  return "0000-00-00";
}

function sortTrips(trips) {
  return [...trips].sort((a, b) => {
    const db = tripDateKey(b);
    const da = tripDateKey(a);
    if (db !== da) return db < da ? -1 : 1;
    return String(b.title || "").localeCompare(String(a.title || ""));
  });
}

function checkPassword(request, env, formPassword) {
  const expected = env.ADMIN_PASSWORD;
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return formPassword === expected || bearer === expected;
}

function publicBase(env) {
  return (env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE).replace(/\/$/, "");
}

const IMG_MAX_INPUT_BYTES = 20 * 1024 * 1024;
const IMG_ALLOWED_WIDTHS = [400, 800, 1280];
const IMG_DEFAULT_WIDTH = 1280;
const IMG_CACHE_CONTROL = "public, max-age=31536000, immutable";

function imgKeyFromPath(pathname) {
  if (!pathname.startsWith("/img/")) return null;
  const raw = pathname.slice("/img/".length);
  if (!raw) return null;
  let key;
  try {
    key = raw.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  if (!key || key === "trips.json" || key.includes("..") || key.startsWith("/")) {
    return null;
  }
  return key;
}

function imgWidthFromUrl(url) {
  const n = Number(url.searchParams.get("w"));
  return IMG_ALLOWED_WIDTHS.includes(n) ? n : IMG_DEFAULT_WIDTH;
}

function imgFormatFromAccept(accept) {
  const a = String(accept || "");
  if (a.includes("image/avif")) return "image/avif";
  if (a.includes("image/webp")) return "image/webp";
  return "image/jpeg";
}

function imgHeaders(contentType, extra) {
  return {
    "Content-Type": contentType,
    "Cache-Control": IMG_CACHE_CONTROL,
    "Vary": "Accept",
    "Access-Control-Allow-Origin": "*",
    ...(extra || {}),
  };
}

function imgCacheRequest(key, width, format) {
  return new Request(
    "https://img-cache.internal/" +
      encodeURIComponent(key) +
      "?w=" +
      width +
      "&f=" +
      encodeURIComponent(format),
    { method: "GET" }
  );
}

async function streamOriginalPhoto(env, key, extraHeaders) {
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: imgHeaders(
      obj.httpMetadata?.contentType || "application/octet-stream",
      extraHeaders
    ),
  });
}

async function serveResizedPhoto(request, env, ctx) {
  const url = new URL(request.url);
  const key = imgKeyFromPath(url.pathname);
  if (!key) return new Response("Not found", { status: 404 });

  const width = imgWidthFromUrl(url);
  const format = imgFormatFromAccept(request.headers.get("Accept"));
  const cacheKey = imgCacheRequest(key, width, format);

  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  } catch {
    // cache is best-effort
  }

  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const tooLarge = typeof obj.size === "number" && obj.size > IMG_MAX_INPUT_BYTES;
  if (tooLarge || !env.IMAGES || !obj.body) {
    return new Response(obj.body, {
      headers: imgHeaders(
        obj.httpMetadata?.contentType || "application/octet-stream"
      ),
    });
  }

  try {
    const result = await env.IMAGES.input(obj.body)
      .transform({ width, fit: "scale-down" })
      .output({ format, quality: 80 });
    const response = result.response({
      headers: imgHeaders(format),
    });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    }
    return response;
  } catch {
    return streamOriginalPhoto(env, key);
  }
}

function normalizePhotoUrl(photoUrl) {
  try {
    const u = new URL(String(photoUrl));
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(photoUrl || "");
  }
}

function keyFromPhotoUrl(photoUrl, base) {
  try {
    const u = new URL(String(photoUrl));
    const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!key || key === "trips.json") return null;
    if (base) {
      try {
        const b = new URL(base);
        if (u.host === b.host) return key;
      } catch {
        // fall through
      }
    }
    // Still allow deletes for our public R2 host even if base env differs slightly
    if (u.hostname.endsWith(".r2.dev") || u.hostname.includes("r2.")) return key;
    return null;
  } catch {
    return null;
  }
}

async function deletePhotoKeys(env, urls, base) {
  let deleted = 0;
  for (const url of urls || []) {
    const key = keyFromPhotoUrl(url, base);
    if (!key) continue;
    try {
      await env.PHOTOS.delete(key);
      deleted += 1;
    } catch {
      // ignore missing objects
    }
  }
  return deleted;
}

async function loadTrips(env, base) {
  const obj = await env.PHOTOS.get("trips.json");
  if (!obj) return { publicBaseUrl: base, trips: [] };
  try {
    const data = await obj.json();
    if (!data.trips) data.trips = [];
    if (!data.publicBaseUrl) data.publicBaseUrl = base;
    let changed = false;
    data.trips = data.trips.map((trip) => {
      const tags = Array.isArray(trip.tags) ? trip.tags : [];
      const next = [
        ...new Set(
          tags.map(normalizeTag).filter((t) => ALLOWED_TAGS.includes(t))
        ),
      ];
      if (JSON.stringify(next) !== JSON.stringify(tags)) {
        changed = true;
        return { ...trip, tags: next };
      }
      return trip;
    });
    if (changed) {
      // Persist rename so stored data matches scrambling
      try {
        await saveTrips(env, data);
      } catch {
        // still return normalized tags even if save fails
      }
    }
    return data;
  } catch {
    return { publicBaseUrl: base, trips: [] };
  }
}

async function saveTrips(env, data) {
  await env.PHOTOS.put("trips.json", JSON.stringify(data, null, 2), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-cache",
    },
  });
}

function normalizeTag(tag) {
  const t = String(tag || "").trim();
  if (t === "mountaineering") return "scrambling";
  return t;
}

function parseTags(raw) {
  let tags = [];
  try {
    tags = raw ? JSON.parse(String(raw)) : [];
  } catch {
    tags = String(raw || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(tags)) tags = [];
  return [
    ...new Set(tags.map(normalizeTag).filter((t) => ALLOWED_TAGS.includes(t))),
  ];
}

function validateTripFields({ title, date, endDate }) {
  if (!title) return "Title is required";
  if (!parseTripDate(date)) return "Valid start date is required (YYYY-MM-DD)";
  if (!parseTripDate(endDate)) return "Valid end date is required (YYYY-MM-DD)";
  if (endDate < date) return "End date must be on or after start date";
  return null;
}

async function uploadFiles(env, base, year, month, slug, files, startIndex) {
  const photoUrls = [];
  const locations = [];
  const dimensions = {};
  let idx = startIndex;
  for (const file of files) {
    const ext = extFromFile(file);
    const key = `${year}/${month}/${slug}${idx}.${ext}`;
    await env.PHOTOS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
    const photoUrl = `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
    photoUrls.push(photoUrl);
    const meta = await photoMetaFromR2Key(env, key);
    if (meta.gps) {
      locations.push({ url: photoUrl, lat: meta.gps.lat, lng: meta.gps.lng });
    }
    if (meta.dim) dimensions[photoUrl] = meta.dim;
    idx += 1;
  }
  return { photoUrls, locations, dimensions };
}

function tripIdFromPath(pathname) {
  const m = pathname.match(/^\/api\/trips\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function gpsCacheRequest(key) {
  return new Request("https://gps-cache.internal/" + encodeURIComponent(key));
}

async function getGpsCache(key) {
  try {
    const hit = await caches.default.match(gpsCacheRequest(key));
    if (!hit) return undefined;
    return await hit.json();
  } catch {
    return undefined;
  }
}

async function putGpsCache(key, gps) {
  try {
    const body = JSON.stringify(gps || null);
    await caches.default.put(
      gpsCacheRequest(key),
      new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      })
    );
  } catch {
    // cache is best-effort
  }
}

async function gpsFromBuffer(buf) {
  if (!buf || !buf.byteLength) return null;
  try {
    const slice = buf.byteLength > 262144 ? buf.slice(0, 262144) : buf;
    const gps = await exifr.gps(slice);
    if (
      gps &&
      typeof gps.latitude === "number" &&
      typeof gps.longitude === "number" &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function jpegDimensions(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return null;
  let i = 2;
  while (i + 8 < u8.length) {
    if (u8[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = u8[i + 1];
    if (marker === 0xd8) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (u8[i + 5] << 8) | u8[i + 6];
      const width = (u8[i + 7] << 8) | u8[i + 8];
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    const len = (u8[i + 2] << 8) | u8[i + 3];
    if (len < 2) break;
    i += 2 + len;
  }
  return null;
}

function pngDimensions(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 24) return null;
  if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47)) {
    return null;
  }
  const width = (u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19];
  const height = (u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23];
  if (width > 0 && height > 0) return { width, height };
  return null;
}

function applyOrientation(dim, orientation) {
  if (!dim) return null;
  const o = Number(orientation);
  if (o >= 5 && o <= 8) return { width: dim.height, height: dim.width };
  return { width: dim.width, height: dim.height };
}

async function dimensionsFromBuffer(buf) {
  if (!buf || !buf.byteLength) return null;
  const slice = buf.byteLength > 1048576 ? buf.slice(0, 1048576) : buf;
  let dim = jpegDimensions(slice) || pngDimensions(slice);
  let orientation = 1;
  try {
    const exif = await exifr.parse(slice, {
      pick: [
        "Orientation",
        "ImageWidth",
        "ImageHeight",
        "ExifImageWidth",
        "ExifImageHeight",
        "PixelXDimension",
        "PixelYDimension",
      ],
    });
    if (exif) {
      orientation = exif.Orientation || 1;
      if (!dim) {
        const w =
          exif.ImageWidth || exif.ExifImageWidth || exif.PixelXDimension;
        const h =
          exif.ImageHeight || exif.ExifImageHeight || exif.PixelYDimension;
        if (w && h) dim = { width: Number(w), height: Number(h) };
      }
    }
  } catch {
    // ignore
  }
  return applyOrientation(dim, orientation);
}

async function photoMetaFromR2Key(env, key) {
  try {
    const obj = await env.PHOTOS.get(key, {
      range: { offset: 0, length: 1048576 },
    });
    if (!obj) return { gps: null, dim: null };
    const buf = await obj.arrayBuffer();
    let gps = await getGpsCache(key);
    if (gps === undefined) {
      gps = await gpsFromBuffer(buf);
      await putGpsCache(key, gps);
    }
    const dim = await dimensionsFromBuffer(buf);
    return { gps, dim };
  } catch {
    return { gps: null, dim: null };
  }
}

function mergePhotoDimensions(existingMap, uploadedMap, photos) {
  const next = {};
  const prev = existingMap || {};
  const uploaded = uploadedMap || {};
  (photos || []).forEach((url) => {
    const key = normalizePhotoUrl(url);
    const dim = uploaded[key] || uploaded[url] || prev[key] || prev[url];
    if (dim && dim.width && dim.height) next[key] = dim;
  });
  return next;
}

async function backfillPhotoDimensions(env, base) {
  const data = await loadTrips(env, base);
  const jobs = [];
  (data.trips || []).forEach((trip) => {
    const dims = trip.photoDimensions || {};
    (trip.photos || []).forEach((photo) => {
      const url = normalizePhotoUrl(photo);
      if (dims[url] && dims[url].width && dims[url].height) return;
      jobs.push({ trip, url });
    });
  });
  if (!jobs.length) return;
  const MAX = 80;
  const slice = jobs.slice(0, MAX);
  let next = 0;
  let changed = false;

  async function worker() {
    while (next < slice.length) {
      const i = next++;
      const job = slice[i];
      const key = keyFromPhotoUrl(job.url, base);
      if (!key) continue;
      const meta = await photoMetaFromR2Key(env, key);
      if (!meta.dim) continue;
      job.trip.photoDimensions = job.trip.photoDimensions || {};
      job.trip.photoDimensions[job.url] = meta.dim;
      changed = true;
    }
  }

  const n = Math.min(8, slice.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  if (changed) await saveTrips(env, data);
}

async function gpsFromR2Key(env, key) {
  const cached = await getGpsCache(key);
  if (cached !== undefined) {
    return cached; // null = known no-GPS
  }
  try {
    // Only pull EXIF header bytes — full originals made /api/gps crawl
    const obj = await env.PHOTOS.get(key, {
      range: { offset: 0, length: 262144 },
    });
    if (!obj) {
      await putGpsCache(key, null);
      return null;
    }
    const buf = await obj.arrayBuffer();
    const gps = await gpsFromBuffer(buf);
    await putGpsCache(key, gps);
    return gps;
  } catch {
    return null;
  }
}

async function gpsForPhotoUrls(env, base, urls) {
  const CONCURRENCY = 16;
  const out = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (next < urls.length) {
      const i = next++;
      const photoUrl = urls[i];
      const key = keyFromPhotoUrl(photoUrl, base);
      if (!key) {
        out[i] = { url: photoUrl, lat: null, lng: null };
        continue;
      }
      try {
        const gps = await gpsFromR2Key(env, key);
        out[i] = {
          url: photoUrl,
          lat: gps ? gps.lat : null,
          lng: gps ? gps.lng : null,
        };
      } catch {
        out[i] = { url: photoUrl, lat: null, lng: null };
      }
    }
  }

  const n = Math.min(CONCURRENCY, Math.max(1, urls.length));
  await Promise.all(Array.from({ length: n }, function () { return worker(); }));
  return out;
}

async function persistTripPhotoLocations(env, base, tripId, points) {
  if (!tripId || !points || !points.length) return;
  try {
    const data = await loadTrips(env, base);
    const idx = (data.trips || []).findIndex((t) => t.id === tripId);
    if (idx < 0) return;
    const trip = data.trips[idx];
    const byUrl = Object.create(null);
    (trip.photoLocations || []).forEach((p) => {
      if (p && p.url) byUrl[normalizePhotoUrl(p.url)] = p;
    });
    points.forEach((p) => {
      if (
        p &&
        p.url &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng)
      ) {
        byUrl[normalizePhotoUrl(p.url)] = {
          url: p.url,
          lat: p.lat,
          lng: p.lng,
        };
      }
    });
    const photoSet = new Set((trip.photos || []).map(normalizePhotoUrl));
    trip.photoLocations = Object.values(byUrl).filter((p) =>
      photoSet.has(normalizePhotoUrl(p.url))
    );
    trip.updatedAt = new Date().toISOString();
    data.trips[idx] = trip;
    await saveTrips(env, data);
  } catch {
    // persistence is best-effort; GPS response still returns
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const base = publicBase(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, request);
    }

    if (request.method === "GET" && url.pathname.startsWith("/img/")) {
      return serveResizedPhoto(request, env, ctx);
    }

    // Public: extract GPS from trip photos stored in R2
    if (url.pathname === "/api/gps" && request.method === "POST") {
      try {
        const body = await request.json();
        const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
        if (!urls.length) return json({ error: "urls required" }, 400, request);
        const points = await gpsForPhotoUrls(env, base, urls);
        const tripId = body?.tripId ? String(body.tripId) : "";
        if (tripId && ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(persistTripPhotoLocations(env, base, tripId, points));
        } else if (tripId) {
          await persistTripPhotoLocations(env, base, tripId, points);
        }
        return json({ points }, 200, request);
      } catch (err) {
        return json({ error: err.message || "GPS lookup failed" }, 500, request);
      }
    }

    // List trips
    if (url.pathname === "/api/trips" && request.method === "GET") {
      const data = await loadTrips(env, base);
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(backfillPhotoDimensions(env, base));
      }
      return json(data, 200, request);
    }

    // Create trip
    if (url.pathname === "/api/trips" && request.method === "POST") {
      try {
        const form = await request.formData();
        const password = form.get("password") || "";
        if (!checkPassword(request, env, password)) {
          return json({ error: "Unauthorized" }, 401, request);
        }

        const title = String(form.get("title") || "").trim();
        const date = parseTripDate(form.get("date"));
        const endDate =
          parseTripDate(form.get("endDate")) || date;
        const report = String(form.get("report") || "").trim();
        const tags = parseTags(form.get("tags"));
        const err = validateTripFields({ title, date, endDate });
        if (err) return json({ error: err }, 400, request);

        const { year, month } = partsFromDate(date);
        const files = form
          .getAll("photos")
          .filter((f) => f && typeof f === "object" && f.size > 0);
        if (!files.length) {
          return json({ error: "At least one photo is required" }, 400, request);
        }

        const slug = slugify(title);
        const uploaded = await uploadFiles(
          env,
          base,
          year,
          month,
          slug,
          files,
          1
        );

        const data = await loadTrips(env, base);
        const trip = {
          id: `${year}-${String(monthIndex(month)).padStart(2, "0")}-${slug}-${Date.now()}`,
          date,
          endDate,
          year,
          month,
          title,
          tags,
          report,
          photos: uploaded.photoUrls,
          photoLocations: uploaded.locations,
          photoDimensions: uploaded.dimensions || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        data.publicBaseUrl = base;
        data.trips = sortTrips([trip, ...(data.trips || [])]);
        await saveTrips(env, data);
        return json({ ok: true, trip }, 200, request);
      } catch (err) {
        return json({ error: err.message || "Upload failed" }, 500, request);
      }
    }

    const tripId = tripIdFromPath(url.pathname);
    if (!tripId) return json({ error: "Not found" }, 404, request);

    // Update trip
    if (request.method === "PUT") {
      try {
        const form = await request.formData();
        const password = form.get("password") || "";
        if (!checkPassword(request, env, password)) {
          return json({ error: "Unauthorized" }, 401, request);
        }

        const data = await loadTrips(env, base);
        const idx = (data.trips || []).findIndex((t) => t.id === tripId);
        if (idx < 0) return json({ error: "Trip not found" }, 404, request);
        const existing = data.trips[idx];

        const title = String(form.get("title") || existing.title).trim();
        const date = parseTripDate(
          form.get("date") != null ? form.get("date") : existing.date
        );
        const endDate = parseTripDate(
          form.get("endDate") != null
            ? form.get("endDate")
            : existing.endDate || existing.date
        );
        const report =
          form.get("report") != null
            ? String(form.get("report")).trim()
            : existing.report || "";
        const tags =
          form.get("tags") != null
            ? parseTags(form.get("tags"))
            : existing.tags || [];

        const fieldErr = validateTripFields({ title, date, endDate });
        if (fieldErr) return json({ error: fieldErr }, 400, request);

        const { year, month } = partsFromDate(date);

        let keepPhotos = existing.photos || [];
        if (form.get("keepPhotos") != null) {
          try {
            keepPhotos = JSON.parse(String(form.get("keepPhotos")));
            if (!Array.isArray(keepPhotos)) keepPhotos = [];
          } catch {
            return json({ error: "Invalid keepPhotos" }, 400, request);
          }
        }

        const keepSet = new Set(keepPhotos.map(normalizePhotoUrl));
        const removed = (existing.photos || []).filter(
          (p) => !keepSet.has(normalizePhotoUrl(p))
        );
        const deletedCount = await deletePhotoKeys(env, removed, base);

        const newFiles = form
          .getAll("photos")
          .filter((f) => f && typeof f === "object" && f.size > 0);

        const slug = slugify(title);
        const startIndex = Date.now();
        const uploadedBundle = await uploadFiles(
          env,
          base,
          year,
          month,
          slug,
          newFiles,
          startIndex
        );
        const uploaded = uploadedBundle.photoUrls;
        const uploadedLocations = uploadedBundle.locations;

        let photos;
        const orderRaw = form.get("photoOrder");
        if (orderRaw != null && String(orderRaw).trim()) {
          let order;
          try {
            order = JSON.parse(String(orderRaw));
          } catch {
            return json({ error: "Invalid photoOrder" }, 400, request);
          }
          if (!Array.isArray(order)) {
            return json({ error: "Invalid photoOrder" }, 400, request);
          }
          photos = [];
          let newIdx = 0;
          for (const token of order) {
            const s = String(token);
            if (s.startsWith("__new__:")) {
              const file = uploaded[newIdx++];
              if (file) photos.push(file);
            } else if (keepSet.has(normalizePhotoUrl(s))) {
              // Prefer canonical URL from existing when possible
              const match = (existing.photos || []).find(
                (p) => normalizePhotoUrl(p) === normalizePhotoUrl(s)
              );
              photos.push(match || s);
            }
          }
        } else {
          photos = [...keepPhotos, ...uploaded];
        }

        if (!photos.length) {
          return json({ error: "At least one photo is required" }, 400, request);
        }

        const photoSet = new Set(photos.map(normalizePhotoUrl));
        const locationByUrl = Object.create(null);
        (existing.photoLocations || []).forEach((p) => {
          if (p && p.url && photoSet.has(normalizePhotoUrl(p.url))) {
            locationByUrl[normalizePhotoUrl(p.url)] = p;
          }
        });
        uploadedLocations.forEach((p) => {
          if (p && p.url) locationByUrl[normalizePhotoUrl(p.url)] = p;
        });

        const trip = {
          ...existing,
          title,
          date,
          endDate,
          year,
          month,
          tags,
          report,
          photos,
          photoLocations: Object.values(locationByUrl),
          photoDimensions: mergePhotoDimensions(
            existing.photoDimensions,
            uploadedBundle.dimensions,
            photos
          ),
          updatedAt: new Date().toISOString(),
        };

        data.trips[idx] = trip;
        data.trips = sortTrips(data.trips);
        data.publicBaseUrl = base;
        await saveTrips(env, data);
        return json({ ok: true, trip, deletedPhotos: deletedCount }, 200, request);
      } catch (err) {
        return json({ error: err.message || "Update failed" }, 500, request);
      }
    }

    // Delete trip
    if (request.method === "DELETE") {
      try {
        let password = "";
        let deleteFiles = true;
        const contentType = request.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          const body = await request.json().catch(() => ({}));
          password = body.password || "";
          if (body.deleteFiles === false) deleteFiles = false;
        } else {
          const form = await request.formData().catch(() => null);
          if (form) {
            password = form.get("password") || "";
            if (String(form.get("deleteFiles")) === "false") deleteFiles = false;
          }
        }
        if (!checkPassword(request, env, password)) {
          return json({ error: "Unauthorized" }, 401, request);
        }

        const data = await loadTrips(env, base);
        const idx = (data.trips || []).findIndex((t) => t.id === tripId);
        if (idx < 0) return json({ error: "Trip not found" }, 404, request);
        const [removedTrip] = data.trips.splice(idx, 1);

        if (deleteFiles) {
          const n = await deletePhotoKeys(env, removedTrip.photos || [], base);
          data.publicBaseUrl = base;
          await saveTrips(env, data);
          return json(
            { ok: true, deleted: removedTrip.id, deletedPhotos: n },
            200,
            request
          );
        }

        data.publicBaseUrl = base;
        await saveTrips(env, data);
        return json({ ok: true, deleted: removedTrip.id, deletedPhotos: 0 }, 200, request);
      } catch (err) {
        return json({ error: err.message || "Delete failed" }, 500, request);
      }
    }

    return json({ error: "Not found" }, 404, request);
  },
};
