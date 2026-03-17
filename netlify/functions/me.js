const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken, signToken, decodeTokenPayload } = require("./_auth");

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

async function getUserById(userId) {
  const result = await pool.query(
    "SELECT id, name, email, role, profile_image_url, created_at FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  return result.rowCount ? result.rows[0] : null;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  const token = getBearerToken(event);
  const authUser = verifyToken(token);
  if (!authUser || !authUser.sub) {
    const debug =
      process.env.DEBUG_AUTH === "true"
        ? {
            server_time: new Date().toISOString(),
            token_payload: decodeTokenPayload(token),
          }
        : undefined;
    return json(401, { error: "Tidak terautentikasi", debug });
  }

  try {
    await initDatabase();
    const userId = Number(authUser.sub);
    if (!userId || Number.isNaN(userId)) {
      return json(401, { error: "Token tidak valid" });
    }

    if (event.httpMethod === "GET") {
      const user = await getUserById(userId);
      if (!user) {
        return json(404, { error: "User tidak ditemukan" });
      }
      return json(200, { status: "ok", user });
    }

    if (event.httpMethod === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const nextNameRaw = body.name;
      const nextImageRaw = body.profile_image_url;

      const updates = [];
      const values = [];
      let idx = 1;
      let changedName = null;

      if (typeof nextNameRaw === "string") {
        const nextName = nextNameRaw.trim();
        if (nextName.length < 2) {
          return json(400, { error: "Nama minimal 2 karakter" });
        }
        updates.push(`name = $${idx++}`);
        values.push(nextName);
        changedName = nextName;
      }

      if (typeof nextImageRaw === "string") {
        const nextImage = nextImageRaw.trim();
        if (nextImage && !/^https?:\/\//i.test(nextImage)) {
          return json(400, { error: "URL foto profil tidak valid" });
        }
        updates.push(`profile_image_url = $${idx++}`);
        values.push(nextImage || null);
      }

      if (updates.length === 0) {
        return json(400, { error: "Tidak ada perubahan data" });
      }

      values.push(userId);
      const updated = await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, name, email, role, profile_image_url, created_at`,
        values,
      );
      if (updated.rowCount === 0) {
        return json(404, { error: "User tidak ditemukan" });
      }

      if (changedName) {
        await pool.query(
          "UPDATE reports SET reporter_name = $1 WHERE reporter_user_id = $2",
          [changedName, userId],
        );
      }

      const user = updated.rows[0];
      const nextToken = signToken({
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "user",
      });

      return json(200, { status: "ok", user, token: nextToken });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("me function error:", error);
    return json(500, { error: "Gagal memproses profil user" });
  }
};
