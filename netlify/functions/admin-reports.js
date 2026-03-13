const { pool, initDatabase } = require("./_db");

const ALLOWED_STATUS = new Set(["Menunggu", "Diproses", "Selesai"]);

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,X-Admin-Key",
    },
    body: JSON.stringify(payload),
  };
}

function isAuthorized(event) {
  const required = process.env.ADMIN_KEY;
  if (!required) {
    return true;
  }
  const headerValue =
    event.headers["x-admin-key"] || event.headers["X-Admin-Key"] || "";
  return headerValue === required;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (!isAuthorized(event)) {
    return json(401, { error: "Admin key tidak valid" });
  }

  try {
    await initDatabase();

    if (event.httpMethod === "GET") {
      const result = await pool.query(
        "SELECT id, description AS desc, lat, lng, image_url, status, created_at FROM reports ORDER BY created_at DESC",
      );
      return json(200, result.rows);
    }

    if (event.httpMethod === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const id = Number(body.id);
      const status = body.status;

      if (!id || Number.isNaN(id)) {
        return json(400, { error: "ID laporan tidak valid" });
      }
      if (!ALLOWED_STATUS.has(status)) {
        return json(400, { error: "Status tidak valid" });
      }

      const result = await pool.query(
        "UPDATE reports SET status = $1 WHERE id = $2 RETURNING id, status",
        [status, id],
      );

      if (result.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }

      return json(200, { status: "ok", report: result.rows[0] });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("admin-reports function error:", error);
    return json(500, { error: "Gagal memproses request admin" });
  }
};
