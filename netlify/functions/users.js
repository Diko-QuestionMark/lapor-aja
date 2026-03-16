const { pool, initDatabase } = require("./_db");

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

    const userId = Number(event.queryStringParameters?.id || 0);
    if (!userId || Number.isNaN(userId)) {
      return json(400, { error: "ID user tidak valid" });
    }

    const userResult = await pool.query(
      "SELECT id, name, profile_image_url, created_at FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    if (userResult.rowCount === 0) {
      return json(404, { error: "User tidak ditemukan" });
    }

    const reportsResult = await pool.query(
      `
        SELECT
          id,
          title,
          description AS desc,
          status,
          upvotes,
          image_url,
          created_at
        FROM reports
        WHERE reporter_user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `,
      [userId],
    );

    return json(200, {
      status: "ok",
      user: userResult.rows[0],
      reports: reportsResult.rows,
    });
  } catch (error) {
    console.error("users function error:", error);
    return json(500, { error: "Gagal memuat profil user" });
  }
};
