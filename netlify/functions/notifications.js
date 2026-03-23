const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

function buildNotificationCteSql() {
  return `
    WITH notification_events AS (
      SELECT
        CONCAT(
          'government_update:',
          r.id::TEXT,
          ':',
          COALESCE(EXTRACT(EPOCH FROM r.admin_updated_at)::BIGINT::TEXT, '0')
        ) AS id,
        'government_update' AS type,
        r.id AS report_id,
        COALESCE(NULLIF(TRIM(r.title), ''), 'Laporan Warga') AS title,
        CASE
          WHEN COALESCE(NULLIF(TRIM(r.admin_note), ''), '') <> '' THEN CONCAT(
            'Pemerintah merespons: ',
            LEFT(TRIM(r.admin_note), 160)
          )
          ELSE CONCAT(
            'Status laporan diperbarui menjadi ',
            COALESCE(NULLIF(TRIM(r.status), ''), 'Diproses')
          )
        END AS message,
        r.admin_updated_at AS created_at,
        CONCAT('/report.html?id=', r.id::TEXT) AS link
      FROM reports r
      WHERE r.reporter_user_id = $1
        AND r.admin_updated_at IS NOT NULL
        AND (
          r.admin_feedback_resolved_at IS NULL
          OR r.admin_updated_at IS DISTINCT FROM r.admin_feedback_resolved_at
        )

      UNION ALL

      SELECT
        CONCAT(
          'feedback_resolution:',
          r.id::TEXT,
          ':',
          COALESCE(EXTRACT(EPOCH FROM r.admin_feedback_resolved_at)::BIGINT::TEXT, '0')
        ) AS id,
        'feedback_resolution' AS type,
        r.id AS report_id,
        COALESCE(NULLIF(TRIM(r.title), ''), 'Laporan Warga') AS title,
        CASE
          WHEN COALESCE(NULLIF(TRIM(r.admin_note), ''), '') <> '' THEN CONCAT(
            'Respons instansi diperbarui: ',
            LEFT(TRIM(r.admin_note), 160)
          )
          ELSE 'Respons instansi diperbarui berdasarkan masukan warga.'
        END AS message,
        r.admin_feedback_resolved_at AS created_at,
        CONCAT('/report.html?id=', r.id::TEXT) AS link
      FROM reports r
      WHERE r.reporter_user_id = $1
        AND r.admin_feedback_resolved_at IS NOT NULL

      UNION ALL

      SELECT
        CONCAT('comment:', c.id::TEXT) AS id,
        'comment' AS type,
        r.id AS report_id,
        COALESCE(NULLIF(TRIM(r.title), ''), 'Laporan Warga') AS title,
        CONCAT(
          COALESCE(NULLIF(TRIM(c.user_name), ''), 'Seseorang'),
          ' mengomentari laporan kamu: ',
          LEFT(TRIM(COALESCE(c.comment, '')), 160)
        ) AS message,
        c.created_at AS created_at,
        CONCAT('/report.html?id=', r.id::TEXT) AS link
      FROM report_comments c
      INNER JOIN reports r ON r.id = c.report_id
      WHERE r.reporter_user_id = $1
        AND c.user_id <> $1
        AND COALESCE(c.is_deleted, FALSE) = FALSE
    )
  `;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    await initDatabase();

    const token = getBearerToken(event);
    const authUser = verifyToken(token);
    if (!authUser || !authUser.sub || !authUser.email) {
      return json(401, { error: "Login dibutuhkan untuk melihat notifikasi" });
    }

    const userId = Number(authUser.sub);
    if (!userId || Number.isNaN(userId)) {
      return json(401, { error: "Sesi tidak valid" });
    }

    if (event.httpMethod === "GET") {
      const rawLimit = Number(event.queryStringParameters?.limit || DEFAULT_LIMIT);
      const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number.isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit),
      );

      const cteSql = buildNotificationCteSql();

      const listResult = await pool.query(
        `
          ${cteSql}
          SELECT
            e.id,
            e.type,
            e.report_id,
            e.title,
            e.message,
            e.created_at,
            e.link,
            (rr.read_at IS NOT NULL) AS is_read
          FROM notification_events e
          LEFT JOIN notification_read_receipts rr
            ON rr.user_id = $1
           AND rr.notification_id = e.id
          ORDER BY e.created_at DESC
          LIMIT $2
        `,
        [userId, limit],
      );

      const countResult = await pool.query(
        `
          ${cteSql}
          SELECT
            COUNT(*)::INT AS total_count,
            COUNT(*) FILTER (WHERE rr.read_at IS NULL)::INT AS unread_count
          FROM notification_events e
          LEFT JOIN notification_read_receipts rr
            ON rr.user_id = $1
           AND rr.notification_id = e.id
        `,
        [userId],
      );

      const counter = countResult.rows[0] || { total_count: 0, unread_count: 0 };
      return json(200, {
        items: listResult.rows || [],
        total_count: Number(counter.total_count || 0),
        unread_count: Number(counter.unread_count || 0),
      });
    }

    if (event.httpMethod === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const notificationId = String(body.id || "").trim();
      if (!notificationId) {
        return json(400, { error: "id notifikasi wajib diisi" });
      }
      if (!/^(government_update|feedback_resolution|comment):/.test(notificationId)) {
        return json(400, { error: "Format id notifikasi tidak valid" });
      }

      await pool.query(
        `
          INSERT INTO notification_read_receipts(user_id, notification_id, read_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, notification_id)
          DO UPDATE SET read_at = EXCLUDED.read_at
        `,
        [userId, notificationId],
      );

      const cteSql = buildNotificationCteSql();
      const unreadResult = await pool.query(
        `
          ${cteSql}
          SELECT COUNT(*) FILTER (WHERE rr.read_at IS NULL)::INT AS unread_count
          FROM notification_events e
          LEFT JOIN notification_read_receipts rr
            ON rr.user_id = $1
           AND rr.notification_id = e.id
        `,
        [userId],
      );
      const unreadCount = Number(unreadResult.rows?.[0]?.unread_count || 0);
      return json(200, { status: "ok", id: notificationId, unread_count: unreadCount });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("notifications function error:", error);
    return json(500, { error: "Gagal memproses notifikasi" });
  }
};
