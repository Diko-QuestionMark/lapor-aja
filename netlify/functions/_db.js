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
          profile_image_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS reports (
          id SERIAL PRIMARY KEY,
          title TEXT,
          description TEXT,
          agency TEXT NOT NULL DEFAULT 'Umum',
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_comments (
          id SERIAL PRIMARY KEY,
          report_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          user_name TEXT NOT NULL,
          user_avatar_url TEXT,
          comment TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS title TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS agency TEXT NOT NULL DEFAULT 'Umum'",
      );
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Menunggu'",
      );
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS upvotes INTEGER NOT NULL DEFAULT 0",
      );
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_user_id INTEGER");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_name TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_email TEXT");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT");
      await pool.query("ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS user_avatar_url TEXT");
      await pool.query(`
        UPDATE reports
        SET agency = 'Umum'
        WHERE agency IS NULL OR TRIM(agency) = ''
      `);
      await pool.query(`
        UPDATE reports
        SET title = COALESCE(
          NULLIF(TRIM(SUBSTRING(COALESCE(description, '') FROM 1 FOR 80)), ''),
          'Laporan Warga'
        )
        WHERE title IS NULL OR TRIM(title) = ''
      `);
    })();
  }

  return initPromise;
}

module.exports = { pool, initDatabase };
