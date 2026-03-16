const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

const ALLOWED_AGENCIES = new Set([
  "Umum",
  "Dinas PU",
  "Dinas Perhubungan",
  "Dinas Kebersihan",
  "Dinas Lingkungan Hidup",
  "PDAM",
  "PLN",
  "Satpol PP",
]);

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
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
      const result = await pool.query(
        `
          SELECT
            r.id,
            r.title,
            r.description AS desc,
            r.agency,
            r.lat,
            r.lng,
            r.image_url,
            r.status,
            r.upvotes,
            r.created_at,
            r.reporter_user_id,
            r.reporter_name,
            r.reporter_email,
            u.profile_image_url AS reporter_profile_image_url
          FROM reports r
          LEFT JOIN users u ON u.id = r.reporter_user_id
          ORDER BY r.created_at DESC
        `,
      );
      return json(200, result.rows);
    }

    if (event.httpMethod === "POST") {
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (!authUser || !authUser.sub || !authUser.email) {
        return json(401, { error: "Login dibutuhkan untuk mengirim laporan" });
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const { title, desc, agency, lat, lng, image_url } = body;

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
      const safeTitle = String(title || "").trim();
      if (safeTitle.length < 3) {
        return json(400, { error: "Judul minimal 3 karakter" });
      }
      if (safeTitle.length > 100) {
        return json(400, { error: "Judul maksimal 100 karakter" });
      }
      const safeAgency = String(agency || "Umum").trim() || "Umum";
      if (!ALLOWED_AGENCIES.has(safeAgency)) {
        return json(400, { error: "Tujuan instansi tidak valid" });
      }

      const safeReporterName = String(authUser.name || "Warga").trim();
      const safeReporterEmail = String(authUser.email || "")
        .trim()
        .toLowerCase();

      const result = await pool.query(
        "INSERT INTO reports(title, description, agency, lat, lng, image_url, reporter_user_id, reporter_name, reporter_email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, title, agency, status, upvotes, created_at, reporter_user_id, reporter_name, reporter_email",
        [
          safeTitle,
          desc || "",
          safeAgency,
          parsedLat,
          parsedLng,
          image_url,
          Number(authUser.sub),
          safeReporterName,
          safeReporterEmail,
        ],
      );

      return json(201, { status: "ok", report: result.rows[0] });
    }

    if (event.httpMethod === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const id = Number(body.id);
      const action = body.action === "downvote" ? "downvote" : "upvote";
      if (!id || Number.isNaN(id)) {
        return json(400, { error: "ID laporan tidak valid" });
      }

      const result =
        action === "downvote"
          ? await pool.query(
              "UPDATE reports SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = $1 RETURNING id, upvotes",
              [id],
            )
          : await pool.query(
              "UPDATE reports SET upvotes = upvotes + 1 WHERE id = $1 RETURNING id, upvotes",
              [id],
            );

      if (result.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }

      return json(200, { status: "ok", action, report: result.rows[0] });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("reports function error:", error);
    return json(500, { error: "Gagal memproses request laporan" });
  }
};
