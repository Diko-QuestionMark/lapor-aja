const { pool } = require("./_db");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
    await pool.query("SELECT 1");
    return json(200, { status: "ok", database: "connected" });
  } catch (error) {
    console.error("health function error:", error);
    return json(500, { status: "error", message: "database tidak terhubung" });
  }
};
