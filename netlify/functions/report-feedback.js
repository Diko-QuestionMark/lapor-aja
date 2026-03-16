const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

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

function parseReportId(event, body) {
  const fromQuery = event.queryStringParameters
    ? Number(event.queryStringParameters.report_id)
    : NaN;
  const fromBody = Number(body && body.report_id);
  if (!Number.isNaN(fromQuery) && fromQuery > 0) {
    return fromQuery;
  }
  return fromBody;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    await initDatabase();

    if (event.httpMethod === "GET") {
      const body = event.body ? JSON.parse(event.body) : {};
      const reportId = parseReportId(event, body);
      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "report_id tidak valid" });
      }

      const summary = await pool.query(
        `
          SELECT
            COALESCE(SUM(CASE WHEN helpful THEN 1 ELSE 0 END), 0) AS helpful_count,
            COALESCE(SUM(CASE WHEN NOT helpful THEN 1 ELSE 0 END), 0) AS unhelpful_count
          FROM report_response_feedback
          WHERE report_id = $1
        `,
        [reportId],
      );

      let myVote = null;
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (authUser && authUser.sub) {
        const mine = await pool.query(
          "SELECT helpful FROM report_response_feedback WHERE report_id = $1 AND user_id = $2 LIMIT 1",
          [reportId, Number(authUser.sub)],
        );
        if (mine.rowCount > 0) {
          myVote = Boolean(mine.rows[0].helpful);
        }
      }

      return json(200, {
        status: "ok",
        report_id: reportId,
        helpful_count: Number(summary.rows[0].helpful_count || 0),
        unhelpful_count: Number(summary.rows[0].unhelpful_count || 0),
        my_vote: myVote,
      });
    }

    if (event.httpMethod === "POST") {
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (!authUser || !authUser.sub || !authUser.email) {
        return json(401, { error: "Login dibutuhkan untuk memberi penilaian." });
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const reportId = parseReportId(event, body);
      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "report_id tidak valid" });
      }

      if (typeof body.helpful !== "boolean") {
        return json(400, { error: "Nilai helpful harus boolean." });
      }

      const reportExists = await pool.query(
        "SELECT id FROM reports WHERE id = $1 LIMIT 1",
        [reportId],
      );
      if (reportExists.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan." });
      }

      await pool.query(
        `
          INSERT INTO report_response_feedback (report_id, user_id, helpful)
          VALUES ($1, $2, $3)
          ON CONFLICT (report_id, user_id)
          DO UPDATE SET helpful = EXCLUDED.helpful, created_at = CURRENT_TIMESTAMP
        `,
        [reportId, Number(authUser.sub), Boolean(body.helpful)],
      );

      return json(200, { status: "ok" });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("report-feedback function error:", error);
    return json(500, { error: "Gagal memproses penilaian respons" });
  }
};

