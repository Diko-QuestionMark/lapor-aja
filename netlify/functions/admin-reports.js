const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

const ALLOWED_STATUS = new Set(["Menunggu", "Diproses", "Selesai"]);
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME || "Admin";

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

async function getAdminContext(event) {
  const token = getBearerToken(event);
  const authUser = verifyToken(token);
  if (!authUser || !authUser.sub) {
    return null;
  }

  const userId = Number(authUser.sub);
  if (!userId || Number.isNaN(userId)) {
    return null;
  }

  const userResult = await pool.query(
    "SELECT id, name, email, role, agency FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  if (userResult.rowCount === 0) {
    return null;
  }

  const user = userResult.rows[0];
  const role = String(user.role || "user").trim().toLowerCase();
  if (role !== "admin") {
    return null;
  }
  const agency = String(user.agency || "").trim();
  if (!agency) {
    return null;
  }

  const displayName = String(user.name || user.email || ADMIN_DISPLAY_NAME).trim();
  return {
    userId,
    agency,
    displayName: displayName || ADMIN_DISPLAY_NAME,
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    await initDatabase();

    const adminContext = await getAdminContext(event);
    if (!adminContext) {
      return json(401, { error: "Admin key tidak valid" });
    }

    if (event.httpMethod === "GET") {
      const agencyFilter = adminContext.agency;
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
            r.feedback_needs_revision,
            r.feedback_last_unhelpful_at,
            r.admin_feedback_resolved_at,
            r.created_at,
            r.reporter_user_id,
            r.reporter_name,
            r.reporter_email,
            COALESCE(feedback_count.helpful_count, 0)::INT AS feedback_helpful_count,
            COALESCE(feedback_count.unhelpful_count, 0)::INT AS feedback_unhelpful_count,
            COALESCE(feedback_count.total_count, 0)::INT AS feedback_total_count,
            COALESCE(
              ROUND(
                (COALESCE(feedback_count.helpful_count, 0)::NUMERIC * 100.0) /
                NULLIF(COALESCE(feedback_count.total_count, 0), 0),
                1
              ),
              0
            ) AS feedback_approval_rate,
            COALESCE(feedback_reason.top_reasons, '[]'::JSON) AS feedback_top_reasons,
            COALESCE(
              rm.image_urls,
              CASE
                WHEN COALESCE(TRIM(r.image_url), '') <> '' THEN ARRAY[r.image_url]::TEXT[]
                ELSE ARRAY[]::TEXT[]
              END
            ) AS image_urls
          FROM reports r
          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (WHERE helpful) AS helpful_count,
              COUNT(*) FILTER (WHERE NOT helpful) AS unhelpful_count,
              COUNT(*) AS total_count
            FROM report_response_feedback rf
            WHERE rf.report_id = r.id
          ) feedback_count ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'code', ranked.reason_code,
                  'label', CASE ranked.reason_code
                    WHEN 'unclear_response' THEN 'Respons tidak jelas'
                    WHEN 'no_real_solution' THEN 'Solusi belum nyata'
                    WHEN 'weak_evidence' THEN 'Bukti kurang valid'
                    WHEN 'mismatch_issue' THEN 'Tidak sesuai masalah'
                    ELSE 'Alasan lain'
                  END,
                  'count', ranked.reason_count
                )
                ORDER BY ranked.reason_count DESC, ranked.reason_code ASC
              ) AS top_reasons
            FROM (
              SELECT reason_code, COUNT(*)::INT AS reason_count
              FROM report_response_feedback
              WHERE report_id = r.id
                AND NOT helpful
                AND reason_code IS NOT NULL
              GROUP BY reason_code
              ORDER BY reason_count DESC, reason_code ASC
              LIMIT 3
            ) ranked
          ) feedback_reason ON TRUE
          LEFT JOIN LATERAL (
            SELECT ARRAY_AGG(url ORDER BY sort_order ASC, id ASC) AS image_urls
            FROM report_media
            WHERE report_id = r.id
          ) rm ON TRUE
          WHERE ($1 = 'all' OR r.agency = $1 OR r.agency = 'Umum')
          ORDER BY r.created_at DESC
        `,
        [agencyFilter],
      );
      return json(200, result.rows);
    }

    if (event.httpMethod === "PATCH") {
      const body = event.body ? JSON.parse(event.body) : {};
      const id = Number(body.id);
      const status = body.status;
      const note = String(body.admin_note || "").trim();
      const evidenceUrl = String(body.admin_evidence_url || "").trim();

      if (!id || Number.isNaN(id)) {
        return json(400, { error: "ID laporan tidak valid" });
      }
      if (!ALLOWED_STATUS.has(status)) {
        return json(400, { error: "Status tidak valid" });
      }
      if (note.length > 0 && note.length < 3) {
        return json(400, { error: "Catatan respons minimal 3 karakter" });
      }
      if (evidenceUrl && !/^https?:\/\//i.test(evidenceUrl)) {
        return json(400, { error: "URL bukti tidak valid" });
      }

      if (adminContext.agency !== "all") {
        const agencyCheck = await pool.query(
          "SELECT agency FROM reports WHERE id = $1 LIMIT 1",
          [id],
        );
        if (agencyCheck.rowCount === 0) {
          return json(404, { error: "Laporan tidak ditemukan" });
        }
        const reportAgency = String(agencyCheck.rows[0].agency || "").trim();
        if (reportAgency !== adminContext.agency && reportAgency !== "Umum") {
          return json(403, { error: "Tidak punya akses ke laporan ini" });
        }
      }

      const result = await pool.query(
        `
          UPDATE reports
          SET
            status = $1,
            admin_note = $2,
            admin_evidence_url = $3,
            admin_updated_at = CURRENT_TIMESTAMP,
            admin_updated_by = $4,
            feedback_needs_revision = FALSE,
            admin_feedback_resolved_at = CASE
              WHEN feedback_needs_revision THEN CURRENT_TIMESTAMP
              ELSE admin_feedback_resolved_at
            END
          WHERE id = $5
          RETURNING
            id,
            status,
            admin_note,
            admin_evidence_url,
            admin_updated_at,
            admin_updated_by,
            feedback_needs_revision,
            admin_feedback_resolved_at
        `,
        [status, note || null, evidenceUrl || null, adminContext.displayName, id],
      );

      if (result.rowCount === 0) {
        return json(404, { error: "Laporan tidak ditemukan" });
      }

      const updated = result.rows[0];
      await pool.query(
        `
          INSERT INTO report_status_history
            (report_id, status, admin_note, admin_evidence_url, updated_at, updated_by)
          VALUES
            ($1, $2, $3, $4, $5, $6)
        `,
        [
          Number(updated.id),
          updated.status,
          updated.admin_note,
          updated.admin_evidence_url,
          updated.admin_updated_at,
          updated.admin_updated_by,
        ],
      );

      return json(200, { status: "ok", report: updated });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("admin-reports function error:", error);
    return json(500, { error: "Gagal memproses request admin" });
  }
};
