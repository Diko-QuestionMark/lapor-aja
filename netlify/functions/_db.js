const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL belum diset di environment Netlify");
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
    })();
  }

  return initPromise;
}

module.exports = { pool, initDatabase };
