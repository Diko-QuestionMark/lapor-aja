const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "Database URL belum diset. Gunakan DATABASE_URL / NEON_DATABASE_URL / NETLIFY_DATABASE_URL",
  );
}

const useSsl =
  !connectionString.includes("localhost") &&
  !connectionString.includes("127.0.0.1");

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

let initPromise;

function initDatabase() {
  if (!initPromise) {
    initPromise = (async function runMigration() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id SERIAL PRIMARY KEY,
          description TEXT,
          lat FLOAT,
          lng FLOAT,
          image_url TEXT,
          status VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
          upvotes INTEGER NOT NULL DEFAULT 0,
          reporter_user_id INTEGER,
          reporter_name TEXT,
          reporter_email TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Menunggu'",
      );
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS upvotes INTEGER NOT NULL DEFAULT 0",
      );
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_user_id INTEGER");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_name TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_email TEXT");
    })();
  }

  return initPromise;
}

module.exports = { pool, initDatabase };
