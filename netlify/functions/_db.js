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
          role TEXT NOT NULL DEFAULT 'user',
          agency TEXT,
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
          location_label TEXT,
          image_url TEXT,
          status VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
          admin_note TEXT,
          admin_evidence_url TEXT,
          admin_updated_at TIMESTAMP,
          admin_updated_by TEXT,
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
          is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
          deleted_at TIMESTAMP,
          deleted_by TEXT,
          delete_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_response_feedback (
          id SERIAL PRIMARY KEY,
          report_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          helpful BOOLEAN NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(report_id, user_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_media (
          id SERIAL PRIMARY KEY,
          report_id INTEGER NOT NULL,
          url TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_status_history (
          id SERIAL PRIMARY KEY,
          report_id INTEGER NOT NULL,
          status VARCHAR(30) NOT NULL,
          admin_note TEXT,
          admin_evidence_url TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_by TEXT
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notification_read_receipts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          notification_id TEXT NOT NULL,
          read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, notification_id)
        )
      `);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_report_media_report_id ON report_media(report_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_report_status_history_report_id ON report_status_history(report_id)",
      );
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS title TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_label TEXT");
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS agency TEXT NOT NULL DEFAULT 'Umum'",
      );
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Menunggu'",
      );
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_evidence_url TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_updated_at TIMESTAMP");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_updated_by TEXT");
      await pool.query(
        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS upvotes INTEGER NOT NULL DEFAULT 0",
      );
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_user_id INTEGER");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_name TEXT");
      await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_email TEXT");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS agency TEXT");
      await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT");
      await pool.query("ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS user_avatar_url TEXT");
      await pool.query(
        "ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
      );
      await pool.query("ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
      await pool.query("ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS deleted_by TEXT");
      await pool.query("ALTER TABLE report_comments ADD COLUMN IF NOT EXISTS delete_reason TEXT");
      await pool.query("ALTER TABLE report_media ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0");
      await pool.query(
        "ALTER TABLE report_status_history ADD COLUMN IF NOT EXISTS admin_note TEXT",
      );
      await pool.query(
        "ALTER TABLE report_status_history ADD COLUMN IF NOT EXISTS admin_evidence_url TEXT",
      );
      await pool.query(
        "ALTER TABLE report_status_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      );
      await pool.query(
        "ALTER TABLE report_status_history ADD COLUMN IF NOT EXISTS updated_by TEXT",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_report_feedback_report_id ON report_response_feedback(report_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_report_feedback_user_id ON report_response_feedback(user_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_notification_receipts_user_id ON notification_read_receipts(user_id)",
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS idx_notification_receipts_notification_id ON notification_read_receipts(notification_id)",
      );

      await pool.query(`
        INSERT INTO report_media (report_id, url, sort_order)
        SELECT r.id, r.image_url, 0
        FROM reports r
        LEFT JOIN report_media m
          ON m.report_id = r.id
         AND m.sort_order = 0
        WHERE COALESCE(TRIM(r.image_url), '') <> ''
          AND m.id IS NULL
      `);
      await pool.query(`
        UPDATE users
        SET role = 'user'
        WHERE role IS NULL OR TRIM(role) = ''
      `);
      await pool.query(`
        UPDATE users
        SET agency = NULL
        WHERE agency IS NOT NULL AND TRIM(agency) = ''
      `);
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
