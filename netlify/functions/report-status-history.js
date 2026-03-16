const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method tidak didukung" });
  }

  try {
    await initDatabase();
    const reportId = Number(event.queryStringParameters?.report_id || 0);
    if (!reportId || Number.isNaN(reportId)) {
      return json(400, { error: "report_id tidak valid" });
    }

    const token = getBearerToken(event);
    const authUser = verifyToken(token);
    const isAdmin = Boolean(authUser && String(authUser.role || "").toLowerCase() === "admin");

    if (!isAdmin) {
      const reportResult = await pool.query(
        "SELECT reporter_user_id FROM reports WHERE id = $1 LIMIT 1",
        [reportId],
      );
      if (reportResult.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }
      const ownerId = Number(reportResult.rows[0].reporter_user_id || 0);
      if (!authUser || Number(authUser.sub) !== ownerId) {
        return json(403, { error: "Tidak punya akses ke histori laporan ini" });
      }
    }

    const history = await pool.query(
      `
        SELECT
          id,
          report_id,
          status,
          admin_note,
          admin_evidence_url,
          updated_at,
          updated_by
        FROM report_status_history
        WHERE report_id = $1
        ORDER BY updated_at DESC, id DESC
      `,
      [reportId],
    );
    return json(200, history.rows);
  } catch (error) {
    console.error("report-status-history function error:", error);
    return json(500, { error: "Gagal memuat histori status" });
  }
};
