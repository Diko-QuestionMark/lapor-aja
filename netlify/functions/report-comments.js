const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

const COMMENT_MAX_LENGTH = 300;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    await initDatabase();

    if (event.httpMethod === "GET") {
      const reportId = Number(event.queryStringParameters?.report_id || 0);
      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "report_id tidak valid" });
      }

      const result = await pool.query(
        `
          SELECT
            c.id,
            c.report_id,
            c.user_id,
            c.user_name,
            c.user_avatar_url,
            c.comment,
            c.created_at
          FROM report_comments c
          WHERE c.report_id = $1
          ORDER BY c.created_at DESC
          LIMIT 100
        `,
        [reportId],
      );
      return json(200, result.rows);
    }

    if (event.httpMethod === "POST") {
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (!authUser || !authUser.sub || !authUser.email) {
        return json(401, { error: "Login dibutuhkan untuk berkomentar" });
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const reportId = Number(body.report_id);
      const safeComment = String(body.comment || "").trim();
      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "report_id tidak valid" });
      }
      if (!safeComment) {
        return json(400, { error: "Komentar tidak boleh kosong" });
      }
      if (safeComment.length > COMMENT_MAX_LENGTH) {
        return json(400, { error: `Komentar maksimal ${COMMENT_MAX_LENGTH} karakter` });
      }

      const reportExists = await pool.query(
        "SELECT id FROM reports WHERE id = $1 LIMIT 1",
        [reportId],
      );
      if (reportExists.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }

      const userResult = await pool.query(
        "SELECT id, name, profile_image_url FROM users WHERE id = $1 LIMIT 1",
        [Number(authUser.sub)],
      );
      if (userResult.rowCount === 0) {
        return json(401, { error: "User tidak ditemukan" });
      }
      const user = userResult.rows[0];

      const inserted = await pool.query(
        `
          INSERT INTO report_comments(report_id, user_id, user_name, user_avatar_url, comment)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, report_id, user_id, user_name, user_avatar_url, comment, created_at
        `,
        [
          reportId,
          Number(user.id),
          String(user.name || "Warga"),
          String(user.profile_image_url || ""),
          safeComment,
        ],
      );

      return json(201, { status: "ok", comment: inserted.rows[0] });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("report-comments function error:", error);
    return json(500, { error: "Gagal memproses komentar" });
  }
};
