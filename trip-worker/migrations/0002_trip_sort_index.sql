CREATE INDEX IF NOT EXISTS idx_trips_date_title
  ON trips(date DESC, title DESC);
