const { pool, initDatabase } = require("./_db");
const { getBearerToken, verifyToken } = require("./_auth");

const DEFAULT_ADMIN_LIMIT = 20;
const MAX_ADMIN_LIMIT = 80;
const MIN_UNHELPFUL_TO_FLAG = 3;
const MAX_NOTE_LENGTH = 240;

const DISLIKE_REASON_META = Object.freeze({
  unclear_response: "Respons tidak jelas",
  no_real_solution: "Solusi belum nyata",
  weak_evidence: "Bukti kurang valid",
  mismatch_issue: "Tidak sesuai masalah",
});

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

function parseAdminLimit(event) {
  const raw = Number(event.queryStringParameters?.limit || DEFAULT_ADMIN_LIMIT);
  if (!raw || Number.isNaN(raw)) {
    return DEFAULT_ADMIN_LIMIT;
  }
  return Math.min(MAX_ADMIN_LIMIT, Math.max(1, Math.floor(raw)));
}

function normalizeReasonCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DISLIKE_REASON_META, code) ? code : "";
}

function getReasonLabel(code) {
  return DISLIKE_REASON_META[String(code || "").trim().toLowerCase()] || "Alasan lain";
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
    "SELECT id, role, agency FROM users WHERE id = $1 LIMIT 1",
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

  return { userId, agency };
}

async function loadFeedbackSummary(reportId) {
  const summaryResult = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE helpful)::INT AS helpful_count,
        COUNT(*) FILTER (WHERE NOT helpful)::INT AS unhelpful_count,
        COUNT(*)::INT AS total_count,
        MAX(CASE WHEN NOT helpful THEN COALESCE(updated_at, created_at) END) AS latest_unhelpful_at
      FROM report_response_feedback
      WHERE report_id = $1
    `,
    [reportId],
  );
  const topReasonsResult = await pool.query(
    `
      SELECT reason_code, COUNT(*)::INT AS count
      FROM report_response_feedback
      WHERE report_id = $1
        AND NOT helpful
        AND reason_code IS NOT NULL
      GROUP BY reason_code
      ORDER BY count DESC, reason_code ASC
      LIMIT 4
    `,
    [reportId],
  );

  const summaryRow = summaryResult.rows[0] || {};
  const helpfulCount = Number(summaryRow.helpful_count || 0);
  const unhelpfulCount = Number(summaryRow.unhelpful_count || 0);
  const totalCount = Number(summaryRow.total_count || 0);
  const latestUnhelpfulAt = summaryRow.latest_unhelpful_at || null;
  const needsRevision =
    unhelpfulCount >= MIN_UNHELPFUL_TO_FLAG && unhelpfulCount > helpfulCount;
  const topReasons = (topReasonsResult.rows || []).map(function (row) {
    const code = String(row.reason_code || "").trim();
    return {
      code,
      label: getReasonLabel(code),
      count: Number(row.count || 0),
    };
  });

  return {
    helpfulCount,
    unhelpfulCount,
    totalCount,
    latestUnhelpfulAt,
    needsRevision,
    topReasons,
  };
}

async function persistFeedbackState(reportId, summary) {
  await pool.query(
    `
      UPDATE reports
      SET
        feedback_needs_revision = $1,
        feedback_last_unhelpful_at = $2,
        admin_feedback_resolved_at = CASE
          WHEN $1 THEN NULL
          ELSE admin_feedback_resolved_at
        END
      WHERE id = $3
    `,
    [summary.needsRevision, summary.latestUnhelpfulAt, reportId],
  );
}

async function loadAdminInbox(event) {
  const adminContext = await getAdminContext(event);
  if (!adminContext) {
    return json(401, { error: "Akses admin tidak valid." });
  }
  const limit = parseAdminLimit(event);

  const itemsResult = await pool.query(
    `
      SELECT
        r.id,
        COALESCE(NULLIF(TRIM(r.title), ''), 'Laporan Warga') AS title,
        COALESCE(NULLIF(TRIM(r.agency), ''), 'Umum') AS agency,
        COALESCE(NULLIF(TRIM(r.status), ''), 'Menunggu') AS status,
        r.admin_updated_at,
        r.feedback_needs_revision,
        COALESCE(f.helpful_count, 0)::INT AS helpful_count,
        COALESCE(f.unhelpful_count, 0)::INT AS unhelpful_count,
        COALESCE(f.total_count, 0)::INT AS total_count,
        COALESCE(
          ROUND(
            (COALESCE(f.helpful_count, 0)::NUMERIC * 100.0) /
            NULLIF(COALESCE(f.total_count, 0), 0),
            1
          ),
          0
        ) AS approval_rate,
        COALESCE(reason_summary.top_reasons, '[]'::JSON) AS top_reasons
      FROM reports r
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE helpful) AS helpful_count,
          COUNT(*) FILTER (WHERE NOT helpful) AS unhelpful_count,
          COUNT(*) AS total_count,
          MAX(COALESCE(updated_at, created_at)) AS latest_feedback_at
        FROM report_response_feedback rf
        WHERE rf.report_id = r.id
      ) f ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'code', rs.reason_code,
              'label', CASE rs.reason_code
                WHEN 'unclear_response' THEN 'Respons tidak jelas'
                WHEN 'no_real_solution' THEN 'Solusi belum nyata'
                WHEN 'weak_evidence' THEN 'Bukti kurang valid'
                WHEN 'mismatch_issue' THEN 'Tidak sesuai masalah'
                ELSE 'Alasan lain'
              END,
              'count', rs.reason_count
            )
            ORDER BY rs.reason_count DESC, rs.reason_code ASC
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
        ) rs
      ) reason_summary ON TRUE
      WHERE ($1 = 'all' OR r.agency = $1 OR r.agency = 'Umum')
        AND COALESCE(f.total_count, 0) > 0
      ORDER BY
        r.feedback_needs_revision DESC,
        COALESCE(f.unhelpful_count, 0) DESC,
        COALESCE(f.latest_feedback_at, r.created_at) DESC
      LIMIT $2
    `,
    [adminContext.agency, limit],
  );

  const metricsResult = await pool.query(
    `
      SELECT
        COALESCE(SUM(COALESCE(f.helpful_count, 0)), 0)::INT AS helpful_count,
        COALESCE(SUM(COALESCE(f.unhelpful_count, 0)), 0)::INT AS unhelpful_count,
        COALESCE(SUM(COALESCE(f.total_count, 0)), 0)::INT AS total_count,
        COUNT(*) FILTER (WHERE r.feedback_needs_revision)::INT AS needs_revision_count,
        COALESCE(
          AVG(
            CASE
              WHEN r.admin_feedback_resolved_at IS NOT NULL
               AND r.feedback_last_unhelpful_at IS NOT NULL
               AND r.admin_feedback_resolved_at >= r.feedback_last_unhelpful_at
              THEN EXTRACT(EPOCH FROM (r.admin_feedback_resolved_at - r.feedback_last_unhelpful_at)) / 3600.0
              ELSE NULL
            END
          ),
          0
        ) AS avg_revision_hours
      FROM reports r
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE helpful) AS helpful_count,
          COUNT(*) FILTER (WHERE NOT helpful) AS unhelpful_count,
          COUNT(*) AS total_count
        FROM report_response_feedback rf
        WHERE rf.report_id = r.id
      ) f ON TRUE
      WHERE ($1 = 'all' OR r.agency = $1 OR r.agency = 'Umum')
    `,
    [adminContext.agency],
  );

  const monthReasonsResult = await pool.query(
    `
      SELECT reason_code, COUNT(*)::INT AS count
      FROM report_response_feedback rf
      JOIN reports r ON r.id = rf.report_id
      WHERE ($1 = 'all' OR r.agency = $1 OR r.agency = 'Umum')
        AND NOT rf.helpful
        AND rf.reason_code IS NOT NULL
        AND COALESCE(rf.updated_at, rf.created_at) >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
      GROUP BY reason_code
      ORDER BY count DESC, reason_code ASC
      LIMIT 3
    `,
    [adminContext.agency],
  );

  const metricsRow = metricsResult.rows[0] || {};
  const helpfulCount = Number(metricsRow.helpful_count || 0);
  const unhelpfulCount = Number(metricsRow.unhelpful_count || 0);
  const totalCount = Number(metricsRow.total_count || 0);
  const approvalRate =
    totalCount > 0 ? Number(((helpfulCount / totalCount) * 100).toFixed(1)) : 0;
  const topReasonsThisMonth = (monthReasonsResult.rows || []).map(function (row) {
    const code = String(row.reason_code || "").trim();
    return {
      code,
      label: getReasonLabel(code),
      count: Number(row.count || 0),
    };
  });

  return json(200, {
    status: "ok",
    items: itemsResult.rows || [],
    metrics: {
      helpful_count: helpfulCount,
      unhelpful_count: unhelpfulCount,
      total_count: totalCount,
      approval_rate: approvalRate,
      needs_revision_count: Number(metricsRow.needs_revision_count || 0),
      avg_revision_hours: Number(metricsRow.avg_revision_hours || 0),
      top_reasons_this_month: topReasonsThisMonth,
    },
  });
}

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(200, { ok: true });
  }

  try {
    await initDatabase();

    if (event.httpMethod === "GET") {
      const isAdminInbox =
        String(event.queryStringParameters?.admin_inbox || "").trim() === "1";
      if (isAdminInbox) {
        return loadAdminInbox(event);
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const reportId = parseReportId(event, body);
      if (!reportId || Number.isNaN(reportId)) {
        return json(400, { error: "report_id tidak valid" });
      }

      const summary = await loadFeedbackSummary(reportId);
      await persistFeedbackState(reportId, summary);

      let myVote = null;
      let myReason = null;
      let myNote = "";
      const token = getBearerToken(event);
      const authUser = verifyToken(token);
      if (authUser && authUser.sub) {
        const mine = await pool.query(
          `
            SELECT helpful, reason_code, note
            FROM report_response_feedback
            WHERE report_id = $1 AND user_id = $2
            LIMIT 1
          `,
          [reportId, Number(authUser.sub)],
        );
        if (mine.rowCount > 0) {
          myVote = Boolean(mine.rows[0].helpful);
          myReason = mine.rows[0].reason_code || null;
          myNote = String(mine.rows[0].note || "");
        }
      }

      return json(200, {
        status: "ok",
        report_id: reportId,
        helpful_count: summary.helpfulCount,
        unhelpful_count: summary.unhelpfulCount,
        total_count: summary.totalCount,
        my_vote: myVote,
        my_reason: myReason,
        my_note: myNote,
        needs_revision: summary.needsRevision,
        top_reasons: summary.topReasons,
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

      const helpful = Boolean(body.helpful);
      const reasonCode = helpful ? "" : normalizeReasonCode(body.dislike_reason);
      const note = helpful ? "" : String(body.dislike_note || "").trim();
      if (!helpful && !reasonCode) {
        return json(400, { error: "Alasan dislike wajib diisi." });
      }
      if (note.length > MAX_NOTE_LENGTH) {
        return json(400, { error: `Catatan maksimal ${MAX_NOTE_LENGTH} karakter.` });
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
          INSERT INTO report_response_feedback (
            report_id, user_id, helpful, reason_code, note, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (report_id, user_id)
          DO UPDATE SET
            helpful = EXCLUDED.helpful,
            reason_code = EXCLUDED.reason_code,
            note = EXCLUDED.note,
            updated_at = CURRENT_TIMESTAMP,
            created_at = CURRENT_TIMESTAMP
        `,
        [
          reportId,
          Number(authUser.sub),
          helpful,
          helpful ? null : reasonCode,
          helpful ? null : note || null,
        ],
      );

      const summary = await loadFeedbackSummary(reportId);
      await persistFeedbackState(reportId, summary);

      return json(200, {
        status: "ok",
        report_id: reportId,
        helpful_count: summary.helpfulCount,
        unhelpful_count: summary.unhelpfulCount,
        total_count: summary.totalCount,
        needs_revision: summary.needsRevision,
        top_reasons: summary.topReasons,
      });
    }

    return json(405, { error: "Method tidak didukung" });
  } catch (error) {
    console.error("report-feedback function error:", error);
    return json(500, { error: "Gagal memproses penilaian respons" });
  }
};
