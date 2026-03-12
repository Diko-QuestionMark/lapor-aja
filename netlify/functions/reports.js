const { pool, initDatabase } = require("./_db");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
      const result = await pool.query(
        "SELECT id, description AS desc, lat, lng, image_url, created_at FROM reports ORDER BY created_at DESC",
      );
      return json(200, result.rows);
    }

    if (event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const { desc, lat, lng, image_url } = body;

      const parsedLat = lat === null || lat === undefined ? null : Number(lat);
      const parsedLng = lng === null || lng === undefined ? null : Number(lng);

      if (
        (parsedLat !== null && Number.isNaN(parsedLat)) ||
        (parsedLng !== null && Number.isNaN(parsedLng))
      ) {
        return json(400, { error: "Format lokasi tidak valid" });
      }

      if (!image_url || typeof image_url !== "string") {
        return json(400, { error: "image_url wajib diisi" });
      }

      const result = await pool.query(
        "INSERT INTO reports(description, lat, lng, image_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
        [desc || "", parsedLat, parsedLng, image_url],
      );

      return json(201, { status: "ok", report: result.rows[0] });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("reports function error:", error);
    return json(500, { error: "Gagal memproses request laporan" });
  }
};
