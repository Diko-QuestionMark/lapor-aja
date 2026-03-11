const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, "..")));

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return;
	}

	const content = fs.readFileSync(filePath, "utf8");
	const lines = content.split(/\r?\n/);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmed.slice(0, separatorIndex).trim();
		const rawValue = trimmed.slice(separatorIndex + 1).trim();
		const value = rawValue.replace(/^['"]|['"]$/g, "");

		if (!(key in process.env)) {
			process.env[key] = value;
		}
	}
}

loadEnvFile(path.resolve(__dirname, "..", ".env"));
loadEnvFile(path.resolve(__dirname, ".env"));

const connectionString =
	process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!connectionString) {
	console.error("DATABASE_URL belum diisi di file .env");
	process.exit(1);
}

const useSsl =
	!connectionString.includes("localhost") &&
	!connectionString.includes("127.0.0.1");

const pool = new Pool({
	connectionString,
	ssl: useSsl ? { rejectUnauthorized: false } : false,
});

app.get("/api", (req, res) => {
	res.send("API jalan");
});

app.get("/health", async (req, res) => {
	try {
		await pool.query("SELECT 1");
		res.json({ status: "ok", database: "connected" });
	} catch (error) {
		res.status(500).json({ status: "error", message: "database tidak terhubung" });
	}
});

app.get("/reports", async (req, res) => {
	try {
		const result = await pool.query(
			"SELECT id, description AS desc, lat, lng, image_url, created_at FROM reports ORDER BY created_at DESC",
		);
		res.json(result.rows);
	} catch (error) {
		console.error("GET /reports error:", error);
		res.status(500).json({ error: "Gagal mengambil data laporan" });
	}
});

app.post("/reports", async (req, res) => {
	try {
		const { desc, lat, lng, image_url } = req.body;

		const parsedLat = lat === null || lat === undefined ? null : Number(lat);
		const parsedLng = lng === null || lng === undefined ? null : Number(lng);

		if (
			(parsedLat !== null && Number.isNaN(parsedLat)) ||
			(parsedLng !== null && Number.isNaN(parsedLng))
		) {
			return res.status(400).json({ error: "Format lokasi tidak valid" });
		}
		if (!image_url || typeof image_url !== "string") {
			return res.status(400).json({ error: "image_url wajib diisi" });
		}

		const result = await pool.query(
			"INSERT INTO reports(description, lat, lng, image_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
			[desc || "", parsedLat, parsedLng, image_url],
		);

		res.status(201).json({ status: "ok", report: result.rows[0] });
	} catch (error) {
		console.error("POST /reports error:", error);
		res.status(500).json({ error: "Gagal menyimpan laporan" });
	}
});

async function initDatabase() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS reports (
			id SERIAL PRIMARY KEY,
			description TEXT,
			lat FLOAT,
			lng FLOAT,
			image_url TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`);
	await pool.query("ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_url TEXT");
}

async function startServer() {
	const port = Number(process.env.PORT) || 3000;

	try {
		await initDatabase();
		app.listen(port, () => {
			console.log(`server jalan di port ${port}`);
		});
	} catch (error) {
		console.error("Gagal inisialisasi database:", error);
		process.exit(1);
	}
}

startServer();

process.on("SIGINT", async () => {
	await pool.end();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	await pool.end();
	process.exit(0);
});
