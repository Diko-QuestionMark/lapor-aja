-- LaporAja admin account setup (per instansi)
-- Jalankan di database production/staging sesuai kebutuhan.

-- 1) Pastikan kolom agency ada di users (aman dijalankan berulang)
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency TEXT;

-- 2) Naikkan akun user jadi admin instansi
-- Ganti email dan agency sesuai kebutuhan.
UPDATE users
SET role = 'admin',
    agency = 'Dinas PU'
WHERE email = 'admin.pu@domain.go.id';

UPDATE users
SET role = 'admin',
    agency = 'Dinas Perhubungan'
WHERE email = 'admin.dishub@domain.go.id';

-- 3) Turunkan akun admin jadi user biasa
-- UPDATE users
-- SET role = 'user',
--     agency = NULL
-- WHERE email = 'admin.pu@domain.go.id';

-- 4) Cek daftar admin aktif
SELECT id, name, email, role, agency, created_at
FROM users
WHERE role = 'admin'
ORDER BY agency ASC, created_at ASC;
