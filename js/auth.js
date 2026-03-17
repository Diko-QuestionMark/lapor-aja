const API_BASE =
  window.LAPORAJA_API_BASE ||
  (window.location.protocol === "file:"
    ? "http://localhost:3000"
    : window.location.origin);
const SESSION_KEY = "laporaja_session_v1";
const AUTH_NOTICE_KEY = "laporaja_auth_notice_v1";

function buildAuthUrl(action) {
  const safeAction = encodeURIComponent(String(action || "").trim());
  if (window.LAPORAJA_API_BASE || window.location.protocol === "file:") {
    return `${API_BASE}/auth/${safeAction}`;
  }
  return `${API_BASE}/.netlify/functions/auth?action=${safeAction}`;
}

function resolveAuthUrl(path) {
  if (!path.startsWith("/auth/")) {
    return `${API_BASE}${path}`;
  }
  const action = path.slice("/auth/".length).split("?")[0];
  return buildAuthUrl(action);
}

function getPostLoginPath(user) {
  const role = String((user && user.role) || "").toLowerCase();
  return role === "admin" ? "/admin.html" : "/index.html";
}

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
      role: user.role || "user",
      agency: user.agency || "",
      profile_image_url: user.profile_image_url || "",
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

function setFormLoading(formId, isLoading, loadingText) {
  const form = document.getElementById(formId);
  if (!form) {
    return;
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  if (!submitBtn) {
    return;
  }
  if (!submitBtn.dataset.defaultText) {
    submitBtn.dataset.defaultText = submitBtn.textContent || "";
  }
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading
    ? loadingText
    : submitBtn.dataset.defaultText;
}

async function requestAuth(path, payload) {
  const response = await fetch(resolveAuthUrl(path), {
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
  setFormLoading("registerForm", true, "Memproses...");
  const name = document.getElementById("registerName").value.trim();
  const email = normalizeEmail(document.getElementById("registerEmail").value);
  const password = document.getElementById("registerPassword").value;

  if (name.length < 2) {
    showAuthAlert("Nama minimal 2 karakter.", "danger");
    setFormLoading("registerForm", false);
    return;
  }
  if (!email || !email.includes("@")) {
    showAuthAlert("Format email belum valid.", "danger");
    setFormLoading("registerForm", false);
    return;
  }
  if (password.length < 6) {
    showAuthAlert("Password minimal 6 karakter.", "danger");
    setFormLoading("registerForm", false);
    return;
  }

  try {
    const data = await requestAuth("/auth/register", { name, email, password });
    setSession(data.token, data.user);
    const nextPath = getPostLoginPath(data.user);
    const isAdmin = nextPath === "/admin.html";
    showAuthAlert(
      isAdmin
        ? "Registrasi berhasil. Mengarahkan ke dashboard admin..."
        : "Registrasi berhasil. Mengarahkan ke halaman warga...",
      "success",
    );
    window.setTimeout(function () {
      window.location.href = nextPath;
    }, 650);
  } catch (error) {
    showAuthAlert(error.message, "danger");
    setFormLoading("registerForm", false);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setFormLoading("loginForm", true, "Memproses...");
  const email = normalizeEmail(document.getElementById("loginEmail").value);
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await requestAuth("/auth/login", { email, password });
    setSession(data.token, data.user);
    const nextPath = getPostLoginPath(data.user);
    const isAdmin = nextPath === "/admin.html";
    showAuthAlert(
      isAdmin
        ? "Login berhasil. Mengarahkan ke dashboard admin..."
        : "Login berhasil. Mengarahkan ke halaman warga...",
      "success",
    );
    window.setTimeout(function () {
      window.location.href = nextPath;
    }, 650);
  } catch (error) {
    showAuthAlert(error.message, "danger");
    setFormLoading("loginForm", false);
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
    const role = String(session.role || "").toLowerCase();
    window.location.href = role === "admin" ? "/admin.html" : "/index.html";
    return;
  }
  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
}

initAuthPage();
