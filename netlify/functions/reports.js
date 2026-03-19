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
  "Makan Bergizi Gratis (MBG)",
  "Satpol PP",
]);
const MAX_PHOTO_COUNT = 5;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(payload),
  };
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, function (char) {
      return char.toUpperCase();
    });
}

function compactLocationLabelFromAddress(address) {
  if (!address || typeof address !== "object") {
    return "";
  }
  const road = address.road || address.pedestrian || address.footway || address.residential;
  const area =
    address.suburb ||
    address.neighbourhood ||
    address.village ||
    address.town ||
    address.city ||
    address.county;
  const state = address.state;
  const parts = [road, area, state]
    .map(function (part) {
      return toTitleCase(part);
    })
    .filter(Boolean);
  return parts.slice(0, 3).join(", ");
}

function compactLocationLabelFromDisplayName(displayName) {
  const raw = String(displayName || "").trim();
  if (!raw) {
    return "";
  }
  const parts = raw
    .split(",")
    .map(function (part) {
      return toTitleCase(part);
    })
    .filter(Boolean);
  return parts.slice(0, 3).join(", ");
}

async function reverseGeocodeLabel(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(function () {
    controller.abort();
  }, 3000);

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "16",
      addressdetails: "1",
      "accept-language": "id",
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "LaporAja/1.0 (reverse-geocoding)",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return null;
    }
    const payload = await response.json().catch(function () {
      return null;
    });
    if (!payload) {
      return null;
    }
    const compact =
      compactLocationLabelFromAddress(payload.address) ||
      compactLocationLabelFromDisplayName(payload.display_name);
    if (!compact) {
      return null;
    }
    return compact.slice(0, 140);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
            r.location_label,
            r.image_url,
          r.status,
          r.admin_note,
          r.admin_evidence_url,
          r.admin_updated_at,
          r.admin_updated_by,
          r.upvotes,
          r.created_at,
          r.reporter_user_id,
          r.reporter_name,
          r.reporter_email,
          u.profile_image_url AS reporter_profile_image_url,
          COALESCE(
            rm.image_urls,
            CASE
              WHEN COALESCE(TRIM(r.image_url), '') <> '' THEN ARRAY[r.image_url]::TEXT[]
              ELSE ARRAY[]::TEXT[]
            END
          ) AS image_urls
        FROM reports r
        LEFT JOIN users u ON u.id = r.reporter_user_id
        LEFT JOIN LATERAL (
          SELECT ARRAY_AGG(url ORDER BY sort_order ASC, id ASC) AS image_urls
          FROM report_media
          WHERE report_id = r.id
        ) rm ON TRUE
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
      const candidateImageUrls = Array.isArray(body.image_urls)
        ? body.image_urls
            .map(function (value) {
              return String(value || "").trim();
            })
            .filter(Boolean)
        : [];

      if (candidateImageUrls.length === 0 && typeof image_url === "string") {
        const single = String(image_url).trim();
        if (single) {
          candidateImageUrls.push(single);
        }
      }

      const imageUrls = Array.from(new Set(candidateImageUrls));

      const parsedLat = lat === null || lat === undefined ? null : Number(lat);
      const parsedLng = lng === null || lng === undefined ? null : Number(lng);

      if (
        (parsedLat !== null && Number.isNaN(parsedLat)) ||
        (parsedLng !== null && Number.isNaN(parsedLng))
      ) {
        return json(400, { error: "Format lokasi tidak valid" });
      }
      const locationLabel =
        parsedLat !== null && parsedLng !== null
          ? await reverseGeocodeLabel(parsedLat, parsedLng)
          : null;

      if (imageUrls.length === 0) {
        return json(400, { error: "Minimal 1 foto wajib diisi" });
      }
      if (imageUrls.length > MAX_PHOTO_COUNT) {
        return json(400, { error: `Maksimal ${MAX_PHOTO_COUNT} foto per laporan` });
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

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const insertedReport = await client.query(
          "INSERT INTO reports(title, description, agency, lat, lng, location_label, image_url, reporter_user_id, reporter_name, reporter_email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, agency, status, upvotes, created_at, reporter_user_id, reporter_name, reporter_email, image_url, location_label",
          [
            safeTitle,
            desc || "",
            safeAgency,
            parsedLat,
            parsedLng,
            locationLabel,
            imageUrls[0],
            Number(authUser.sub),
            safeReporterName,
            safeReporterEmail,
          ],
        );

        const report = insertedReport.rows[0];
        for (let i = 0; i < imageUrls.length; i += 1) {
          await client.query(
            "INSERT INTO report_media(report_id, url, sort_order) VALUES ($1, $2, $3)",
            [Number(report.id), imageUrls[i], i],
          );
        }

        await client.query("COMMIT");

        report.image_urls = imageUrls;
        return json(201, { status: "ok", report });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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

    if (event.httpMethod === "DELETE") {
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (!authUser || !authUser.sub || !authUser.email) {
        return json(401, { error: "Login dibutuhkan untuk menghapus laporan" });
      }

      const idFromQuery = event.queryStringParameters
        ? Number(event.queryStringParameters.id)
        : NaN;
      const body = event.body ? JSON.parse(event.body) : {};
      const idFromBody = Number(body.id);
      const reportId = !Number.isNaN(idFromQuery) && idFromQuery > 0 ? idFromQuery : idFromBody;

      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "ID laporan tidak valid" });
      }

      const ownerCheck = await pool.query(
        "SELECT id, reporter_user_id FROM reports WHERE id = $1 LIMIT 1",
        [reportId],
      );
      if (ownerCheck.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }

      const ownerId = Number(ownerCheck.rows[0].reporter_user_id || 0);
      if (ownerId !== Number(authUser.sub)) {
        return json(403, { error: "Kamu tidak punya akses untuk menghapus laporan ini" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM report_comments WHERE report_id = $1", [reportId]);
        await client.query("DELETE FROM report_media WHERE report_id = $1", [reportId]);
        await client.query("DELETE FROM reports WHERE id = $1", [reportId]);
        await client.query("COMMIT");
        return json(200, { status: "ok", deleted_id: reportId });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("reports function error:", error);
    return json(500, { error: "Gagal memproses request laporan" });
  }
};
