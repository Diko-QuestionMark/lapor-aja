const { pool, initDatabase } = require("./_db");
const { hashPassword, verifyPassword, signToken } = require("./_auth");
const { getAdminAgencyByEmail, normalizeEmail } = require("./_admin-config");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method tidak didukung" });
  }

  const action =
    (event.queryStringParameters && event.queryStringParameters.action) || "";

  try {
    await initDatabase();
    const body = event.body ? JSON.parse(event.body) : {};

    if (action === "register") {
      const name = String(body.name || "").trim();
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const adminAgency = getAdminAgencyByEmail(email);
      const nextRole = adminAgency ? "admin" : "user";

      if (name.length < 2) {
        return json(400, { error: "Nama minimal 2 karakter" });
      }
      if (!email.includes("@")) {
        return json(400, { error: "Format email tidak valid" });
      }
      if (password.length < 6) {
        return json(400, { error: "Password minimal 6 karakter" });
      }

      const passwordHash = hashPassword(password);
      let created;
      try {
        created = await pool.query(
          "INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4) RETURNING id, name, email, role, profile_image_url, created_at",
          [name, email, passwordHash, nextRole],
        );
      } catch (error) {
        if (error.code === "23505") {
          return json(409, { error: "Email sudah terdaftar" });
        }
        throw error;
      }

      const user = created.rows[0];
      user.role = nextRole;
      user.agency = adminAgency || "";
      const token = signToken({
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "user",
        agency: user.agency || "",
      });

      return json(201, { status: "ok", token, user });
    }

    if (action === "login") {
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      if (!email || !password) {
        return json(400, { error: "Email dan password wajib diisi" });
      }

      const result = await pool.query(
        "SELECT id, name, email, role, profile_image_url, password_hash FROM users WHERE email = $1 LIMIT 1",
        [email],
      );

      if (result.rowCount === 0) {
        return json(401, { error: "Email atau password salah" });
      }

      const row = result.rows[0];
      if (!verifyPassword(password, row.password_hash)) {
        return json(401, { error: "Email atau password salah" });
      }

      const adminAgency = getAdminAgencyByEmail(row.email);
      const role = adminAgency ? "admin" : row.role || "user";
      const user = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: role,
        agency: adminAgency || "",
        profile_image_url: row.profile_image_url || "",
      };
      const token = signToken({
        sub: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        agency: user.agency || "",
      });
      return json(200, { status: "ok", token, user });
    }

    return json(400, { error: "Action auth tidak valid" });
  } catch (error) {
    console.error("auth function error:", error);
    return json(500, { error: "Gagal memproses autentikasi" });
  }
};
