CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  year INTEGER NOT NULL,
  month TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  report TEXT NOT NULL DEFAULT '',
  photos_json TEXT NOT NULL DEFAULT '[]',
  cover_photo TEXT NOT NULL DEFAULT '',
  photo_locations_json TEXT NOT NULL DEFAULT '[]',
  photo_dimensions_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_date_id
  ON trips(date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_trips_title
  ON trips(title COLLATE NOCASE);
