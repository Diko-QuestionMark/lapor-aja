const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const SESSION_KEY = "laporaja_session_v1";
const AUTH_NOTICE_KEY = "laporaja_auth_notice_v1";

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function setSession(token, user) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      token,
      id: user.id,
      name: user.name,
      email: user.email,
      loginAt: Date.now(),
    }),
  );
}

function showAuthAlert(message, type) {
  const box = document.getElementById("authAlert");
  box.textContent = message;
  box.className = `alert py-2 mb-3 alert-${type}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function requestAuth(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(function () {
    return {};
  });
  if (!response.ok) {
    throw new Error(data.error || "Autentikasi gagal");
  }
  return data;
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById("registerName").value.trim();
  const email = normalizeEmail(document.getElementById("registerEmail").value);
  const password = document.getElementById("registerPassword").value;

  if (name.length < 2) {
    showAuthAlert("Nama minimal 2 karakter.", "danger");
    return;
  }
  if (!email || !email.includes("@")) {
    showAuthAlert("Format email belum valid.", "danger");
    return;
  }
  if (password.length < 6) {
    showAuthAlert("Password minimal 6 karakter.", "danger");
    return;
  }

  try {
    const data = await requestAuth("/auth/register", { name, email, password });
    setSession(data.token, data.user);
    showAuthAlert("Registrasi berhasil. Mengarahkan ke halaman warga...", "success");
    window.setTimeout(function () {
      window.location.href = "/index.html";
    }, 650);
  } catch (error) {
    showAuthAlert(error.message, "danger");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = normalizeEmail(document.getElementById("loginEmail").value);
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await requestAuth("/auth/login", { email, password });
    setSession(data.token, data.user);
    showAuthAlert("Login berhasil. Mengarahkan ke halaman warga...", "success");
    window.setTimeout(function () {
      window.location.href = "/index.html";
    }, 650);
  } catch (error) {
    showAuthAlert(error.message, "danger");
  }
}

function initAuthPage() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  if (!loginForm || !registerForm) {
    return;
  }

  const authNotice = localStorage.getItem(AUTH_NOTICE_KEY);
  if (authNotice) {
    showAuthAlert(authNotice, "warning");
    localStorage.removeItem(AUTH_NOTICE_KEY);
  }

  const session = readSession();
  if (session && session.token && session.email) {
    window.location.href = "/index.html";
    return;
  }
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
}

initAuthPage();
