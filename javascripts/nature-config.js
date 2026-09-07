// Nature trips config — edit after Worker deploy
window.NATURE_CONFIG = {
  // Primary: Worker API (CORS-safe; reads live trips.json from R2)
  tripsUrl: "https://nature-trip-uploader.nature-trip-uploader.workers.dev/api/trips",
  // Fallback if Worker is down
  tripsFallbackUrl: "./data/trips.json",
  // Cloudflare Worker for admin upload/edit
  workerUrl: "https://nature-trip-uploader.nature-trip-uploader.workers.dev",
};
