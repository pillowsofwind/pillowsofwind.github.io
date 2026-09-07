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
  "mountaineering",
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

function keyFromPhotoUrl(photoUrl, base) {
  try {
    const u = new URL(photoUrl);
    const b = new URL(base);
    if (u.host !== b.host) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (!key || key === "trips.json") return null;
    return key;
  } catch {
    return null;
  }
}

async function deletePhotoKeys(env, urls, base) {
  for (const url of urls || []) {
    const key = keyFromPhotoUrl(url, base);
    if (key) {
      try {
        await env.PHOTOS.delete(key);
      } catch {
        // ignore missing objects
      }
    }
  }
}

async function loadTrips(env, base) {
  const obj = await env.PHOTOS.get("trips.json");
  if (!obj) return { publicBaseUrl: base, trips: [] };
  try {
    const data = await obj.json();
    if (!data.trips) data.trips = [];
    if (!data.publicBaseUrl) data.publicBaseUrl = base;
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
  return tags.filter((t) => ALLOWED_TAGS.includes(t));
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
    photoUrls.push(
      `${base}/${key.split("/").map(encodeURIComponent).join("/")}`
    );
    idx += 1;
  }
  return photoUrls;
}

function tripIdFromPath(pathname) {
  const m = pathname.match(/^\/api\/trips\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function gpsFromR2Object(obj) {
  if (!obj) return null;
  try {
    const buf = await obj.arrayBuffer();
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

async function gpsForPhotoUrls(env, base, urls) {
  const out = [];
  for (const photoUrl of urls.slice(0, 40)) {
    const key = keyFromPhotoUrl(photoUrl, base);
    if (!key) {
      out.push({ url: photoUrl, lat: null, lng: null });
      continue;
    }
    try {
      const obj = await env.PHOTOS.get(key);
      const gps = await gpsFromR2Object(obj);
      out.push({
        url: photoUrl,
        lat: gps ? gps.lat : null,
        lng: gps ? gps.lng : null,
      });
    } catch {
      out.push({ url: photoUrl, lat: null, lng: null });
    }
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const base = publicBase(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true }, 200, request);
    }

    // Public: extract GPS from trip photos stored in R2
    if (url.pathname === "/api/gps" && request.method === "POST") {
      try {
        const body = await request.json();
        const urls = Array.isArray(body?.urls) ? body.urls.map(String) : [];
        if (!urls.length) return json({ error: "urls required" }, 400, request);
        const points = await gpsForPhotoUrls(env, base, urls);
        return json({ points }, 200, request);
      } catch (err) {
        return json({ error: err.message || "GPS lookup failed" }, 500, request);
      }
    }

    // List trips
    if (url.pathname === "/api/trips" && request.method === "GET") {
      const data = await loadTrips(env, base);
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
        const photoUrls = await uploadFiles(
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
          photos: photoUrls,
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

        const removed = (existing.photos || []).filter(
          (p) => !keepPhotos.includes(p)
        );
        await deletePhotoKeys(env, removed, base);

        const newFiles = form
          .getAll("photos")
          .filter((f) => f && typeof f === "object" && f.size > 0);

        const slug = slugify(title);
        const startIndex = keepPhotos.length + 1;
        const uploaded = await uploadFiles(
          env,
          base,
          year,
          month,
          slug,
          newFiles,
          startIndex
        );

        const photos = [...keepPhotos, ...uploaded];
        if (!photos.length) {
          return json({ error: "At least one photo is required" }, 400, request);
        }

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
          updatedAt: new Date().toISOString(),
        };

        data.trips[idx] = trip;
        data.trips = sortTrips(data.trips);
        data.publicBaseUrl = base;
        await saveTrips(env, data);
        return json({ ok: true, trip }, 200, request);
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
          await deletePhotoKeys(env, removedTrip.photos || [], base);
        }

        data.publicBaseUrl = base;
        await saveTrips(env, data);
        return json({ ok: true, deleted: removedTrip.id }, 200, request);
      } catch (err) {
        return json({ error: err.message || "Delete failed" }, 500, request);
      }
    }

    return json({ error: "Not found" }, 404, request);
  },
};
