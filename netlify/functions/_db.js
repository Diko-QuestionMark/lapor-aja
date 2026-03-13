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
        CREATE TABLE IF NOT EXISTS reports (
          id SERIAL PRIMARY KEY,
          description TEXT,
          lat FLOAT,
          lng FLOAT,
          image_url TEXT,
          status VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Menunggu'",
      );
    })();
  }

  return initPromise;
}

module.exports = { pool, initDatabase };
