// Nature trips config — edit after Worker deploy
window.NATURE_CONFIG = {
  // Primary: trips.json on R2 (updated by admin uploads)
  tripsUrl: "https://pub-ef165a3e20f24d10a0bafbb1aa236e40.r2.dev/trips.json",
  // Fallback while R2 copy is not seeded yet
  tripsFallbackUrl: "./data/trips.json",
  // Cloudflare Worker for admin upload/edit
  workerUrl: "https://nature-trip-uploader.nature-trip-uploader.workers.dev",
};
