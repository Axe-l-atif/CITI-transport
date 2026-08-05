const state = {
  user: null,
  paymentMethods: [],
  tripDays: 3,
  client: {
    currentTrip: null,
    selectedSeat: null,
    selectedPayment: null,
    selectedPickupStop: "",
    selectedDropoffStop: "",
    selectedSubscriptionPlan: null,
    selectedSubscriptionPayment: null,
    view: "dashboard",
    profileTab: "info",
    historyTab: "trips",
  },
  driver: { view: "dashboard", currentTrip: null },
  direction: { view: "dashboard", data: null, fleetMap: null, fleetMarkers: [] },
};

const ROLE_SHELLS = {
  client: "app-client",
  driver: "app-driver",
  direction: "app-direction",
};

const CITI_LOGO_CHARS = `
  <span class="citi-char">C</span>
  <span class="citi-char citi-i-wrap">
    <span class="citi-i-dot citi-dot-plateau"></span>
    <span class="citi-i-stem">ı</span>
  </span>
  <span class="citi-char">T</span>
  <span class="citi-char citi-i-wrap">
    <span class="citi-i-dot citi-dot-zone"></span>
    <span class="citi-i-stem">ı</span>
  </span>`;

function mountCitiLogos() {
  document.querySelectorAll("[data-citi-logo]").forEach((slot) => {
    const variant = slot.dataset.citiLogo || "";
    const logo = document.createElement("div");
    logo.className = `brand-citi-giant brand-citi-mark ${variant}`.trim();
    logo.setAttribute("aria-label", "CITI");
    logo.innerHTML = CITI_LOGO_CHARS;
    slot.replaceWith(logo);
  });
}

const PAYMENT_HINTS = {
  orange_money: "Paiement via Orange Money (+225)",
  wave: "Paiement via l'application Wave (+225)",
};

const VEHICLE_ICONS = { minibus: "🚐", berline: "🚗", bus: "🚌", gbaka: "🚍" };

const CLIENT_PROFILE_TITLES = {
  info: ["Itinéraire", "Vos informations personnelles"],
  security: ["Itinéraire", "Sécurité et code personnel"],
  payments: ["Itinéraire", "Vos modes de paiement"],
};

const CLIENT_HISTORY_TITLES = {
  trips: ["Historique", "Vos trajets et réservations"],
  subscription: ["Historique", "Votre abonnement CTI Abidjan"],
};

const CLIENT_TITLES = {
  dashboard: ["Itinéraire", ""],
  trips: ["Réserver un trajet", "Choisissez une ligne et sélectionnez votre siège"],
  "trip-detail": ["Confirmation", "Vérifiez les détails avant de payer"],
  reservations: ["Mes places", "Historique et gestion de vos réservations"],
  profile: ["Itinéraire", "Consultez ou modifiez vos informations personnelles"],
  history: ["Historique", "Vos réservations et trajets passés"],
};

const DRIVER_TITLES = {
  dashboard: ["Planning", "Vos missions et trajets sur les 3 prochains jours"],
  passengers: ["Embarquement", "Liste des passagers par trajet"],
  "trip-detail": ["Mission en cours", "Gérez le trajet et validez les passagers"],
};

const DIRECTION_TITLES = {
  dashboard: ["Pilotage", "Vue d'ensemble du réseau CTI Abidjan"],
  fleet: ["Flotte live", "Géolocalisation et statut des véhicules"],
  trips: ["Planification", "Calendrier des lignes sur 7 jours"],
  vehicles: ["Véhicules", "Gérer la flotte — disponibles et en trajet"],
  drivers: ["Chauffeurs", "Suivi des missions et clients par véhicule"],
  reservations: ["Finances", "Recettes Wave / Orange Money"],
};

const CLIENT_STEPS = [
  { n: 1, title: "Choisir", desc: "Sélectionnez un trajet" },
  { n: 2, title: "Réserver", desc: "Choisissez votre siège" },
  { n: 3, title: "Payer", desc: "Confirmez en ligne" },
];

/** Arrêts et stations — réseau CTI Abidjan */
const ABIDJAN_TRANSIT_STOPS = [
  { zone: "Plateau", zoneId: "plateau", name: "Station Plateau — BCEAO", type: "station", lines: ["Ligne Nord", "Ligne Centre"] },
  { zone: "Plateau", zoneId: "plateau", name: "Arrêt St-Paul", type: "arret", lines: ["Ligne Centre"] },
  { zone: "Yopougon", zoneId: "yopougon", name: "Station Yopougon Siporex", type: "station", lines: ["Ligne Nord", "Ligne Ouest"] },
  { zone: "Yopougon", zoneId: "yopougon", name: "Arrêt Wassakara", type: "arret", lines: ["Ligne Ouest"] },
  { zone: "Cocody", zoneId: "cocody", name: "Station Cocody Riviera 2", type: "station", lines: ["Ligne Est", "Ligne Nord"] },
  { zone: "Cocody", zoneId: "cocody", name: "Arrêt Angré 8e Tranche", type: "arret", lines: ["Ligne Est"] },
  { zone: "Koumassi", zoneId: "koumassi", name: "Station Koumassi Remblais", type: "station", lines: ["Ligne Sud", "Ligne Centre"] },
  { zone: "Koumassi", zoneId: "koumassi", name: "Arrêt Grand Campement", type: "arret", lines: ["Ligne Sud"] },
  { zone: "Marcory", zoneId: "marcory", name: "Station Marcory Zone 4", type: "station", lines: ["Ligne Sud", "Ligne Est"] },
  { zone: "Adjamé", zoneId: "adjame", name: "Station Adjamé Gare Routière", type: "station", lines: ["Ligne Nord", "Ligne Centre"] },
  { zone: "Bingerville", zoneId: "bingerville", name: "Station Bingerville Centre", type: "station", lines: ["Ligne Est"] },
  { zone: "Bingerville", zoneId: "bingerville", name: "Arrêt Abatta", type: "arret", lines: ["Ligne Est"] },
];

const DRIVER_CHECKLIST = [
  "🔑 Récupérer les clés du véhicule assigné",
  "🔍 Contrôle visuel (pneus, carburant, propreté)",
  "📋 Consulter la liste des passagers",
  "⏱️ Arriver 10 min avant l'heure de départ",
  "✅ Marquer le trajet comme effectué à l'arrivée",
];

const TRIP_STATUS_LABELS = {
  pending: "À effectuer",
  in_progress: "En cours",
  completed: "Effectué",
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.user?.role === "direction" && state.user?.id) {
    headers["X-Citi-Account-Id"] = String(state.user.id);
  }
  const res = await fetch(path, {
    headers,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add("hidden"), 3200);
}

function formatPrice(amount) {
  return `${Number(amount).toLocaleString("fr-FR")} FCFA`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function availabilityBadge(available, capacity) {
  const ratio = available / capacity;
  let cls = "badge-success";
  let text = `${available} place${available > 1 ? "s" : ""} libre${available > 1 ? "s" : ""}`;
  if (available === 0) {
    cls = "badge-danger";
    text = "Complet";
  } else if (ratio <= 0.25) {
    cls = "badge-warning";
    text = `${available} place${available > 1 ? "s" : ""} restante${available > 1 ? "s" : ""}`;
  }
  return `<span class="badge ${cls}">${text}</span>`;
}

function paymentStatusLabel(status) {
  if (status === "paid") return '<span class="payment-badge paid">Payé</span>';
  return '<span class="payment-badge">En attente</span>';
}

function paymentMethodLabel(methodId) {
  const method = state.paymentMethods.find((m) => m.id === methodId);
  return method ? `${method.icon} ${method.label}` : methodId || "—";
}

function tripStatusBadge(status) {
  const label = TRIP_STATUS_LABELS[status] || status;
  return `<span class="trip-status-badge ${status || "pending"}">${label}</span>`;
}

function renderHero(elId, cls, title, subtitle, stat) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    <div class="hero-banner ${cls}">
      <h3>${title}</h3>
      <p>${subtitle}</p>
      ${stat ? `<span class="hero-stat">${stat}</span>` : ""}
    </div>`;
}

function renderClientSteps() {
  document.getElementById("client-steps").innerHTML = CLIENT_STEPS.map((s) => `
    <div class="step-card">
      <div class="step-num">${s.n}</div>
      <strong>${s.title}</strong>
      <span>${s.desc}</span>
    </div>`).join("");
}

function renderPaymentChips() {
  document.getElementById("client-payments-info").innerHTML = state.paymentMethods
    .map((m) => `<span class="chip">${m.icon} ${m.label}</span>`)
    .join("");
}

function renderDriverChecklist() {
  document.getElementById("driver-checklist").innerHTML =
    DRIVER_CHECKLIST.map((item) => `<li>${item}</li>`).join("");
}

function renderDriverTimeline(trips) {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrips = trips.filter((t) => t.date === today);
  const el = document.getElementById("driver-timeline");
  if (!todayTrips.length) {
    el.innerHTML = `<p class="text-muted" style="padding:0.5rem">Aucun trajet prévu aujourd'hui.</p>`;
    return;
  }
  el.innerHTML = todayTrips.map((t) => `
    <div class="timeline-item">
      <span class="timeline-time">${t.departure}</span>
      <div>
        <strong>${t.route}</strong><br>
        <small class="text-muted">${t.vehicle_name} · ${t.reserved_count || 0} passager(s) ${tripStatusBadge(t.status)}</small>
      </div>
    </div>`).join("");
}

function renderDirectionAlerts(data) {
  const inProgress = (data.remaining_trips || []).filter((t) => t.status === "in_progress").length;
  const el = document.getElementById("direction-alerts");
  if (!el) return;
  el.innerHTML = `
    <div class="alert-card info">
      <strong>${data.fleet_count} véhicules en service</strong>
      <span>Flotte opérationnelle sur le réseau Abidjan</span>
    </div>
    <div class="alert-card warn">
      <strong>${data.trips_remaining_count} trajets à réaliser</strong>
      <span>${inProgress} en cours actuellement</span>
    </div>
    <div class="alert-card ok">
      <strong>${formatPrice(data.total_revenue)} encaissés</strong>
      <span>Recettes du jour · ${data.occupancy_rate}% de remplissage</span>
    </div>`;
}

function renderFleetBreakdown(fleet) {
  const types = {};
  (fleet || []).forEach((v) => {
    types[v.type] = (types[v.type] || 0) + 1;
  });
  const labels = { minibus: "Minibus", berline: "Berline", bus: "Bus", gbaka: "Gbaka" };
  document.getElementById("direction-fleet-breakdown").innerHTML = Object.entries(types).map(([type, count]) => `
    <div class="fleet-type-card">
      <div class="icon">${VEHICLE_ICONS[type] || "🚐"}</div>
      <strong>${labels[type] || type}</strong>
      <span>${count} véhicule${count > 1 ? "s" : ""}</span>
    </div>`).join("");
}

function renderPaymentSummary(reservations) {
  const total = reservations.reduce((s, r) => s + (r.amount || 0), 0);
  const byMethod = {};
  reservations.forEach((r) => {
    const m = r.payment_method || "autre";
    byMethod[m] = (byMethod[m] || 0) + 1;
  });
  document.getElementById("direction-payment-summary").innerHTML = `
    <div class="pay-stat"><div class="val">${formatPrice(total)}</div><div class="lbl">Total encaissé</div></div>
    <div class="pay-stat"><div class="val">${reservations.length}</div><div class="lbl">Transactions</div></div>
    <div class="pay-stat"><div class="val">${Object.keys(byMethod).length}</div><div class="lbl">Modes de paiement</div></div>
    <div class="pay-stat"><div class="val">${reservations.filter((r) => r.payment_status === "paid").length}</div><div class="lbl">Paiements directs</div></div>`;
}

function bindGotoButtons(scope) {
  (scope || document).querySelectorAll("[data-goto]").forEach((btn) => {
    btn.onclick = async () => {
      const goto = btn.dataset.goto;
      if (goto === "trips") {
        setClientView("trips");
        await renderClientTripsList();
      }
    };
  });
}

function renderTripCard(trip, clickable = true, showStatus = false) {
  const icon = VEHICLE_ICONS[trip.vehicle_type] || "🚐";
  const available = trip.available_seats ?? trip.capacity - (trip.reserved_count || 0);
  return `
    <div class="trip-card" ${clickable ? `data-trip-id="${trip.id}"` : ""}>
      <div>
        <div class="trip-route">${trip.route}${showStatus && trip.status ? tripStatusBadge(trip.status) : ""}</div>
        <div class="trip-meta">
          <span>${icon} ${trip.vehicle_name}</span>
          <span>📅 ${formatDate(trip.date)}</span>
          <span>🕐 ${trip.departure} → ${trip.arrival}</span>
          <span>👤 ${trip.driver}</span>
          <span>🔖 ${trip.plate}</span>
          <span class="price-tag">💰 ${formatPrice(trip.price)}</span>
        </div>
      </div>
      <div>${availabilityBadge(available, trip.capacity)}</div>
    </div>`;
}

function bindTripCards(container, handler) {
  container.querySelectorAll("[data-trip-id]").forEach((card) => {
    card.addEventListener("click", () => handler(Number(card.dataset.tripId)));
  });
}

function setRoleView(prefix, view) {
  document.querySelectorAll(`#${prefix} .view`).forEach((el) => el.classList.remove("active"));
  const el = document.getElementById(`${prefix}-view-${view}`);
  if (el) el.classList.add("active");

  document.querySelectorAll(`#${prefix} .nav-item`).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view && !view.includes("detail"));
  });
}

function updateDateFilter(inputId, hintId) {
  const input = document.getElementById(inputId);
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + state.tripDays - 1);
  const toIso = (d) => d.toISOString().slice(0, 10);
  input.min = toIso(today);
  input.max = toIso(maxDate);
  document.getElementById(hintId).textContent =
    `Trajets du ${formatDate(toIso(today))} au ${formatDate(toIso(maxDate))}`;
}

/* ─── Cinématique d'ouverture ─── */

const INTRO_DURATION_MS = 7500;
const INTRO_ABSORB_DELAY_MS = 1850;
const INTRO_ABSORB_DURATION_MS = 380;
let introPlaying = false;
let introAbsorbRaf = null;

/** Courbe douce pour l'aspiration du fond rouge */
function introEaseSmooth(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - (1 - t) ** 4;
}

function resetIntroAbsorbStyles() {
  const stage = document.querySelector(".intro-bg-stage");
  const intro = document.getElementById("intro-cinematic");
  if (intro) intro.classList.remove("intro-white-phase");
  document.body.style.background = "";

  if (!stage) return;

  stage.querySelectorAll(".intro-red-sheet").forEach((sheet) => {
    sheet.style.removeProperty("--sheet-scale");
    sheet.style.transform = "";
  });

  const flow = stage.querySelector(".intro-red-flow");
  if (flow) {
    flow.style.opacity = "";
    flow.style.transform = "";
  }

  document.querySelectorAll(".intro-absorb-dot").forEach((dot) => {
    dot.style.transform = "";
    dot.style.boxShadow = "";
    dot.style.background = "";
    dot.style.removeProperty("--well-scale");
    dot.style.removeProperty("--well-opacity");
  });
}

function stopIntroAbsorbAnimation() {
  if (introAbsorbRaf) {
    cancelAnimationFrame(introAbsorbRaf);
    introAbsorbRaf = null;
  }
}

function runIntroAbsorbAnimation() {
  const stage = document.querySelector(".intro-bg-stage");
  const intro = document.getElementById("intro-cinematic");
  const sheet1 = stage?.querySelector(".intro-red-sheet-1");
  const sheet2 = stage?.querySelector(".intro-red-sheet-2");
  const flow = stage?.querySelector(".intro-red-flow");
  const dots = [...document.querySelectorAll(".intro-absorb-dot")];
  if (!stage || !sheet1 || !sheet2) return;

  stopIntroAbsorbAnimation();

  sheet1.style.setProperty("--sheet-scale", "1");
  sheet2.style.setProperty("--sheet-scale", "1");

  const startAt = performance.now() + INTRO_ABSORB_DELAY_MS;

  const tick = (now) => {
    const elapsed = now - startAt;

    if (elapsed < 0) {
      introAbsorbRaf = requestAnimationFrame(tick);
      return;
    }

    const t = Math.min(1, elapsed / INTRO_ABSORB_DURATION_MS);
    const e1 = introEaseSmooth(t);
    const e2 = introEaseSmooth(Math.min(1, t * 1.02 + 0.01));
    const scale1 = Math.max(0, 1 - e1);
    const scale2 = Math.max(0, 1 - e2);

    sheet1.style.setProperty("--sheet-scale", String(scale1));
    sheet2.style.setProperty("--sheet-scale", String(scale2));

    if (t > 0.08 && intro && !intro.classList.contains("intro-white-phase")) {
      intro.classList.add("intro-white-phase");
      document.body.style.background = "#ffffff";
    }

    if (flow) {
      flow.style.opacity = String(Math.max(0, 0.28 * (1 - e1)));
      flow.style.transform = `scale(${1.02 - e1 * 1})`;
    }

    dots.forEach((dot, index) => {
      const lag = index * 0.04;
      const dotT = Math.min(1, Math.max(0, (t - lag) / (1 - lag)));
      const ease = introEaseSmooth(dotT);
      const scale = 1 + (1 - ease) * 0.06;
      dot.style.transform = `scale(${scale})`;
      dot.style.background = "#ef4444";
      dot.style.boxShadow =
        "0 0 12px rgba(239, 68, 68, 0.65), 0 0 24px rgba(220, 38, 38, 0.35)";

      const wellScale = 1.15 - ease * 1.13;
      const wellOpacity = Math.max(0, 0.45 * (1 - ease));
      dot.style.setProperty("--well-scale", String(wellScale));
      dot.style.setProperty("--well-opacity", String(wellOpacity));
    });

    if (t < 1) {
      introAbsorbRaf = requestAnimationFrame(tick);
      return;
    }

    sheet1.style.setProperty("--sheet-scale", "0");
    sheet2.style.setProperty("--sheet-scale", "0");
    if (flow) {
      flow.style.opacity = "0";
    }
    introAbsorbRaf = null;
  };

  introAbsorbRaf = requestAnimationFrame(tick);
}

function syncIntroAbsorbTargets() {
  const stage = document.querySelector(".intro-bg-stage");
  const dots = document.querySelectorAll(".intro-absorb-dot");
  if (!stage || dots.length < 2) return;

  const stageRect = stage.getBoundingClientRect();
  dots.forEach((dot, index) => {
    const dotRect = dot.getBoundingClientRect();
    const x = dotRect.left + dotRect.width / 2 - stageRect.left;
    const y = dotRect.top + dotRect.height / 2 - stageRect.top;
    stage.style.setProperty(`--dot${index + 1}-x`, `${x}px`);
    stage.style.setProperty(`--dot${index + 1}-y`, `${y}px`);
  });

  const midX = (
    parseFloat(stage.style.getPropertyValue("--dot1-x")) +
    parseFloat(stage.style.getPropertyValue("--dot2-x"))
  ) / 2;
  const midY = (
    parseFloat(stage.style.getPropertyValue("--dot1-y")) +
    parseFloat(stage.style.getPropertyValue("--dot2-y"))
  ) / 2;
  stage.style.setProperty("--siphon-mid-x", `${midX}px`);
  stage.style.setProperty("--siphon-mid-y", `${midY}px`);
}

function buildIntroScene() {
  syncIntroAbsorbTargets();
}

function playIntroCinematic(intro) {
  intro.classList.add("playing", "intro-js-absorb");
  runIntroAbsorbAnimation();

  const skipIntro = () => finishIntroCinematic();
  intro.addEventListener("click", skipIntro, { once: true });
  intro.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") skipIntro();
  }, { once: true });

  intro.focus({ preventScroll: true });

  setTimeout(() => intro.classList.add("intro-form-active"), 5200);
  setTimeout(finishIntroCinematic, INTRO_DURATION_MS);
}

function finishIntroCinematic() {
  if (!introPlaying) return;
  introPlaying = false;

  window.removeEventListener("resize", syncIntroAbsorbTargets);
  stopIntroAbsorbAnimation();
  resetIntroAbsorbStyles();

  const intro = document.getElementById("intro-cinematic");
  const login = document.getElementById("login-screen");
  if (!intro) {
    showLoginScreen();
    return;
  }

  intro.classList.add("intro-handoff");
  intro.classList.remove("playing", "intro-form-active", "intro-js-absorb");
  intro.setAttribute("aria-hidden", "true");
  document.body.classList.remove("intro-active");
  document.body.classList.add("login-page");
  sessionStorage.setItem("citi_skip_intro", "1");

  login.classList.remove("login-during-intro");
  login.classList.add("login-ready");

  requestAnimationFrame(() => {
    intro.classList.add("hidden");
    intro.classList.remove("intro-handoff");
  });
}

function startIntroCinematic() {
  const intro = document.getElementById("intro-cinematic");
  const login = document.getElementById("login-screen");
  if (!intro) {
    showLoginScreen();
    return;
  }

  introPlaying = true;
  buildIntroScene();
  document.body.classList.remove("login-page");
  document.body.classList.add("intro-active");
  login.classList.remove("hidden", "login-ready");
  login.classList.add("login-during-intro");
  intro.classList.remove("hidden", "intro-handoff", "playing", "intro-form-active");
  intro.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncIntroAbsorbTargets();
      playIntroCinematic(intro);
    });
  });

  window.addEventListener("resize", syncIntroAbsorbTargets);
}

function shouldPlayIntro() {
  return !sessionStorage.getItem("citi_skip_intro");
}

/* ─── Authentification ─── */

function showLoginScreen() {
  const intro = document.getElementById("intro-cinematic");
  const login = document.getElementById("login-screen");
  hideDirectionPendingScreen();
  document.body.classList.remove("intro-active", "app-active", "direction-pending-active");
  document.body.classList.add("login-page");
  if (intro) {
    intro.classList.add("hidden");
    intro.classList.remove("playing", "intro-handoff");
  }
  login.classList.remove("hidden", "login-during-intro");
  login.classList.add("login-ready");
  login.style.transform = "";
  login.style.pointerEvents = "";
  document.querySelectorAll(".app-shell").forEach((el) => el.classList.add("hidden"));
  switchAuthTab("login");
  document.getElementById("auth-identifier").value = "";
  document.getElementById("auth-password").value = "";
  state.user = null;
}

function switchAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authTab === tab);
  });
  document.getElementById("unified-login-form").classList.toggle("hidden", tab !== "login");
  document.getElementById("unified-register-form").classList.toggle("hidden", tab !== "register");
}

function completeLogin(user, message, directionVerified) {
  state.user = user;
  sessionStorage.setItem("citi_session", JSON.stringify(state.user));
  document.getElementById("login-screen").classList.add("hidden");
  launchRoleApp(state.user.role, directionVerified);
  showToast(message || `Bienvenue, ${state.user.display_name}`);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("auth-identifier").value.trim();
  const password = document.getElementById("auth-password").value.trim();

  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    completeLogin(result.user, result.message, result.direction_verified);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById("auth-register-name").value.trim();
  const password = document.getElementById("auth-register-code").value.trim();
  const passwordConfirm = document.getElementById("auth-register-confirm").value.trim();

  try {
    const result = await api("/api/auth/register-client", {
      method: "POST",
      body: JSON.stringify({ name, password, password_confirm: passwordConfirm }),
    });
    completeLogin(result.user, result.message);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function logout() {
  sessionStorage.removeItem("citi_session");
  sessionStorage.setItem("citi_skip_intro", "1");
  hideDirectionPendingScreen();
  showLoginScreen();
}

async function checkDirectionAccess() {
  if (!state.user?.id) return { verified: false };
  return api(`/api/auth/direction/status?account_id=${state.user.id}`);
}

function showDirectionPendingScreen() {
  document.body.classList.add("app-active", "direction-pending-active");
  document.body.classList.remove("intro-active", "login-page");
  document.querySelectorAll(".app-shell").forEach((el) => el.classList.add("hidden"));
  document.getElementById("login-screen")?.classList.add("hidden");

  const screen = document.getElementById("direction-pending-screen");
  const form = document.getElementById("direction-verify-form");
  const codeInput = document.getElementById("direction-verify-code");
  screen?.classList.remove("hidden");
  form?.classList.remove("hidden");
  if (codeInput) codeInput.value = "";

  const feedback = document.getElementById("direction-verify-feedback");
  feedback?.classList.add("hidden");
  feedback.textContent = "";
}

function hideDirectionPendingScreen() {
  document.getElementById("direction-pending-screen")?.classList.add("hidden");
  document.body.classList.remove("direction-pending-active");
}

async function enterDirectionApp() {
  hideDirectionPendingScreen();
  document.body.classList.add("app-active");
  document.querySelectorAll(".app-shell").forEach((el) => el.classList.add("hidden"));
  document.getElementById("app-direction")?.classList.remove("hidden");

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("direction-user-name").textContent = state.user.display_name;
  document.getElementById("direction-current-date").textContent = formatDate(today);
  await initDirectionApp();
}

async function launchRoleApp(role, directionVerifiedHint) {
  if (role === "direction") {
    let verified = directionVerifiedHint;
    if (verified === undefined) {
      try {
        const access = await checkDirectionAccess();
        verified = access.verified;
        if (!verified) {
          showDirectionPendingScreen();
          return;
        }
      } catch {
        showDirectionPendingScreen();
        return;
      }
    } else if (!verified) {
      showDirectionPendingScreen();
      return;
    }
    await enterDirectionApp();
    return;
  }

  hideDirectionPendingScreen();
  document.body.classList.add("app-active");
  document.body.classList.remove("intro-active", "login-page");
  document.querySelectorAll(".app-shell").forEach((el) => el.classList.add("hidden"));
  const shell = document.getElementById(ROLE_SHELLS[role]);
  shell.classList.remove("hidden");

  const today = new Date().toISOString().slice(0, 10);
  if (role === "client") {
    document.getElementById("client-current-date").textContent = formatDate(today);
    document.getElementById("client-trip-date-filter").value = today;
    applyClientDarkMode(localStorage.getItem("citi_client_dark_mode") !== "0");
    initClientApp();
  } else if (role === "driver") {
    document.getElementById("driver-user-name").textContent = state.user.display_name;
    document.getElementById("driver-current-date").textContent = formatDate(today);
    initDriverApp();
  }
}

/* ─── Interface Client ─── */

function setClientView(view) {
  state.client.view = view;
  setRoleView("app-client", view);
  const titleEl = document.getElementById("client-page-title");
  const subtitleEl = document.getElementById("client-page-subtitle");
  const topbarTitles = document.querySelector("#app-client .client-topbar-titles");
  const itineraryPanel = document.getElementById("client-topbar-itinerary");

  let titles = CLIENT_TITLES[view] || CLIENT_TITLES.dashboard;
  if (view === "profile") {
    titles = CLIENT_PROFILE_TITLES[state.client.profileTab] || CLIENT_PROFILE_TITLES.info;
  } else if (view === "history") {
    titles = CLIENT_HISTORY_TITLES[state.client.historyTab] || CLIENT_HISTORY_TITLES.trips;
  }

  if (view === "dashboard") {
    itineraryPanel?.classList.remove("hidden");
    topbarTitles?.classList.add("hidden");
    subtitleEl?.classList.add("hidden");
  } else {
    itineraryPanel?.classList.add("hidden");
    topbarTitles?.classList.remove("hidden");
    titleEl.textContent = titles[0];
    subtitleEl.textContent = titles[1] || "";
    subtitleEl?.classList.toggle("hidden", !titles[1]);
  }
}

function syncClientSubnav(navId, attr, activeValue) {
  document.querySelectorAll(`#${navId} .client-subnav-btn`).forEach((btn) => {
    btn.classList.toggle("active", btn.dataset[attr] === activeValue);
  });
}

function toggleClientMenuSection(section) {
  const submenu = document.querySelector(`[data-client-submenu="${section}"]`);
  const parent = document.querySelector(`[data-client-menu="${section}"]`);
  if (!submenu || !parent) return;

  const willOpen = submenu.classList.contains("hidden");
  document.querySelectorAll(".client-option-submenu").forEach((el) => {
    if (el !== submenu) el.classList.add("hidden");
  });
  document.querySelectorAll(".client-option-parent").forEach((el) => {
    if (el !== parent) el.setAttribute("aria-expanded", "false");
  });

  submenu.classList.toggle("hidden", !willOpen);
  parent.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

async function openClientProfileTab(tab) {
  state.client.profileTab = tab;
  setClientView("profile");
  syncClientSubnav("client-profile-subnav", "profileTab", tab);
  await renderClientProfile();
}

async function openClientHistoryTab(tab) {
  state.client.historyTab = tab;
  setClientView("history");
  syncClientSubnav("client-history-subnav", "historyTab", tab);
  await renderClientHistory();
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function getClientItineraryStatus(reservations) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const sorted = [...reservations].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return parseTimeToMinutes(a.departure) - parseTimeToMinutes(b.departure);
  });

  const todayTrips = sorted.filter((r) => r.date === todayIso);
  for (const trip of todayTrips) {
    const dep = parseTimeToMinutes(trip.departure);
    const arr = parseTimeToMinutes(trip.arrival);
    if (nowMinutes >= dep && nowMinutes <= arr) {
      return {
        kind: "active",
        html: `<strong>Itinéraire en cours</strong>
          <p>${trip.route} — siège n°${trip.seat_number}<br>
          Départ ${trip.departure} · Arrivée prévue ${trip.arrival}<br>
          ${VEHICLE_ICONS[trip.vehicle_type] || "🚐"} ${trip.vehicle_name}</p>`,
      };
    }
  }

  const upcomingToday = todayTrips.find((r) => parseTimeToMinutes(r.departure) > nowMinutes);
  if (upcomingToday) {
    const mins = parseTimeToMinutes(upcomingToday.departure) - nowMinutes;
    const soonLabel = mins <= 120 ? "Dans moins de 2 h" : "Aujourd'hui";
    return {
      kind: "soon",
      html: `<strong>${soonLabel}</strong>
        <p>${upcomingToday.route} à ${upcomingToday.departure}<br>
        Siège n°${upcomingToday.seat_number} · ${formatDate(upcomingToday.date)}</p>`,
    };
  }

  const future = sorted.filter((r) => r.date > todayIso);
  if (future.length) {
    const next = future[0];
    const diffDays = Math.ceil(
      (new Date(`${next.date}T12:00:00`) - new Date(`${todayIso}T12:00:00`)) / 86400000
    );
    const delayLabel = diffDays === 1 ? "Demain" : `Dans ${diffDays} jours`;
    return {
      kind: "planned",
      html: `<strong>Prochain itinéraire — ${delayLabel}</strong>
        <p>${next.route} · ${formatDate(next.date)} à ${next.departure}<br>
        Siège n°${next.seat_number} · ${next.vehicle_name}</p>`,
    };
  }

  return {
    kind: "none",
    html: `<p class="client-itinerary-empty">Aucun itinéraire en cours. Réservez une place pour voir votre trajet ici.</p>`,
  };
}

function renderClientItineraryStatus(reservations) {
  const el = document.getElementById("client-itinerary-status");
  if (!el) return;
  const status = getClientItineraryStatus(reservations);
  el.className = `client-itinerary-status client-itinerary-${status.kind}`;
  el.innerHTML = status.html;
}

async function renderClientDashboard() {
  const [stats, trips, reservations] = await Promise.all([
    api("/api/stats"),
    api("/api/trips"),
    api(`/api/employees/${state.user.employee_id}/reservations`),
  ]);
  state.tripDays = stats.trip_days || 3;
  updateDateFilter("client-trip-date-filter", "client-trip-date-hint");

  renderClientItineraryStatus(reservations);

  const todayTrips = trips.filter((t) => t.date === new Date().toISOString().slice(0, 10));
  const availableToday = todayTrips.filter((t) => t.available_seats > 0).length;

  document.getElementById("client-stats-grid").innerHTML = `
    <div class="stat-card"><div class="value">${reservations.length}</div><div class="label">Mes réservations</div></div>
    <div class="stat-card"><div class="value">${availableToday}</div><div class="label">Trajets dispo aujourd'hui</div></div>
    <div class="stat-card"><div class="value">${trips.filter((t) => t.available_seats > 0).length}</div><div class="label">Places à saisir (3 j)</div></div>
    <div class="stat-card"><div class="value">1 500+</div><div class="label">FCFA / trajet dès</div></div>`;

  renderClientSteps();
  renderPaymentChips();

  const upcoming = trips.filter((t) => t.available_seats > 0).slice(0, 5);
  const container = document.getElementById("client-dashboard-trips");
  if (!upcoming.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🚌</div><p>Tous les trajets sont complets. Revenez demain !</p></div>`;
  } else {
    container.innerHTML = upcoming.map((t) => renderTripCard(t)).join("");
    bindTripCards(container, openClientTripDetail);
  }

  const nextRes = reservations.find((r) => r.date >= new Date().toISOString().slice(0, 10));
  const nextEl = document.getElementById("client-next-reservation");
  if (nextRes) {
    nextEl.classList.remove("hidden");
    nextEl.innerHTML = `
      <h4>🎯 Votre prochain trajet</h4>
      <p><strong>${nextRes.route}</strong> — ${formatDate(nextRes.date)} à ${nextRes.departure}<br>
      Siège n°${nextRes.seat_number} · ${nextRes.vehicle_name} · Réf. ${nextRes.payment_ref || "—"}</p>`;
  } else {
    nextEl.classList.add("hidden");
  }

  bindGotoButtons(document.getElementById("client-view-dashboard"));
}

async function renderClientTripsList() {
  const date = document.getElementById("client-trip-date-filter").value;
  const trips = await api(`/api/trips${date ? `?date=${date}` : ""}`);
  const container = document.getElementById("client-trips-list");
  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>Aucun trajet pour cette date.</p></div>`;
    return;
  }
  container.innerHTML = trips.map((t) => renderTripCard(t)).join("");
  bindTripCards(container, openClientTripDetail);
}

function buildSeatMap(trip, reservations, employeeId) {
  const occupied = new Map(reservations.map((r) => [r.seat_number, r]));
  const myReservation = reservations.find((r) => r.employee_id === employeeId);
  const isWide = trip.capacity > 8;
  const cols = isWide ? 4 : 2;
  let html = `<div class="vehicle-cabin"><div class="driver-area">🧑‍✈️</div><div class="seats-grid${isWide ? " wide" : ""}">`;

  for (let i = 1; i <= trip.capacity; i++) {
    if (isWide && i > 1 && (i - 1) % cols === 2) html += `<div class="aisle"></div>`;
    const res = occupied.get(i);
    let cls = "seat";
    let label = i;
    if (res) {
      cls += res.employee_id === employeeId ? " mine" : " occupied";
      if (res.employee_id === employeeId) label = `${i} ✓`;
    } else if (state.client.selectedSeat === i) {
      cls += " selected";
    }
    html += `<button class="${cls}" data-seat="${i}" ${res ? "disabled" : ""}>${label}</button>`;
  }
  html += "</div></div>";
  return { html, myReservation };
}

async function openClientTripDetail(tripId) {
  const data = await api(`/api/trips/${tripId}`);
  state.client.currentTrip = data.trip;
  state.client.selectedSeat = null;
  state.client.selectedPickupStop = "";
  state.client.selectedDropoffStop = "";
  const trip = data.trip;
  const icon = VEHICLE_ICONS[trip.vehicle_type] || "🚐";

  document.getElementById("client-trip-info").innerHTML = `
    <h3 style="margin-bottom:1rem">${trip.route}</h3>
    <dl>
      <div><dt>Véhicule</dt><dd>${icon} ${trip.vehicle_name}</dd></div>
      <div><dt>Immatriculation</dt><dd>${trip.plate}</dd></div>
      <div><dt>Date</dt><dd>${formatDate(trip.date)}</dd></div>
      <div><dt>Horaires</dt><dd>${trip.departure} → ${trip.arrival}</dd></div>
      <div><dt>Chauffeur</dt><dd>${trip.driver}</dd></div>
      <div><dt>Capacité</dt><dd>${trip.capacity} places</dd></div>
      <div><dt>Tarif</dt><dd>${formatPrice(trip.price)}</dd></div>
    </dl>`;

  const stopOptions = ABIDJAN_TRANSIT_STOPS.map(
    (s) => `<option value="${s.name}">${s.name} (${s.zone})</option>`
  ).join("");
  const pickupEl = document.getElementById("client-pickup-stop");
  const dropoffEl = document.getElementById("client-dropoff-stop");
  pickupEl.innerHTML = `<option value="">— Choisir un arrêt —</option>${stopOptions}`;
  dropoffEl.innerHTML = `<option value="">— Choisir un arrêt —</option>${stopOptions}`;
  pickupEl.onchange = () => { state.client.selectedPickupStop = pickupEl.value; updateConfirmButton(); };
  dropoffEl.onchange = () => { state.client.selectedDropoffStop = dropoffEl.value; updateConfirmButton(); };

  const { html, myReservation } = buildSeatMap(trip, data.reservations, state.user.employee_id);
  document.getElementById("client-seat-map").innerHTML = html;

  const confirmBtn = document.getElementById("client-confirm-reservation");
  const label = document.getElementById("client-selected-seat-label");

  if (myReservation) {
    label.textContent = `Vous avez déjà le siège n°${myReservation.seat_number}`;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Réservation existante";
  } else {
    label.textContent = "Sélectionnez un siège et vos arrêts";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Procéder au paiement";
  }

  document.getElementById("client-seat-map").querySelectorAll(".seat:not(.occupied):not(.mine)").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.client.selectedSeat = Number(btn.dataset.seat);
      document.querySelectorAll("#client-seat-map .seat").forEach((s) => s.classList.remove("selected"));
      btn.classList.add("selected");
      label.textContent = `Siège n°${state.client.selectedSeat} — ${formatPrice(trip.price)}`;
      updateConfirmButton();
    });
  });

  setClientView("trip-detail");
}

function updateConfirmButton() {
  const confirmBtn = document.getElementById("client-confirm-reservation");
  const ready = state.client.selectedSeat
    && state.client.selectedPickupStop
    && state.client.selectedDropoffStop;
  confirmBtn.disabled = !ready;
}

function openPaymentModal() {
  const trip = state.client.currentTrip;
  if (!state.client.selectedSeat || !trip) return;
  if (!state.client.selectedPickupStop || !state.client.selectedDropoffStop) {
    showToast("Choisissez vos arrêts de montée et descente", "error");
    return;
  }
  state.client.selectedPayment = null;

  document.getElementById("payment-summary").innerHTML = `
    <div><strong>${trip.route}</strong></div>
    <div>${formatDate(trip.date)} — ${trip.departure} → ${trip.arrival}</div>
    <div>Siège n°${state.client.selectedSeat} — ${state.user.display_name}</div>
    <div>📍 ${state.client.selectedPickupStop} → ${state.client.selectedDropoffStop}</div>
    <div class="amount">${formatPrice(trip.price)}</div>`;

  document.getElementById("payment-methods").innerHTML = state.paymentMethods.map((m) => `
    <div class="payment-option" data-payment="${m.id}">
      <span class="icon">${m.icon}</span>
      <div class="info"><strong>${m.label}</strong><span>${PAYMENT_HINTS[m.id] || ""}</span></div>
    </div>`).join("");

  document.getElementById("payment-phone").value = "";
  document.getElementById("payment-phone-block").classList.remove("hidden");

  document.getElementById("payment-methods").querySelectorAll(".payment-option").forEach((el) => {
    el.addEventListener("click", () => {
      state.client.selectedPayment = el.dataset.payment;
      document.querySelectorAll(".payment-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      validatePaymentForm();
    });
  });

  document.getElementById("payment-phone").oninput = validatePaymentForm;
  document.getElementById("pay-and-reserve").disabled = true;
  document.getElementById("payment-modal").classList.remove("hidden");
}

function validatePaymentForm() {
  const phone = document.getElementById("payment-phone").value.replace(/\D/g, "");
  document.getElementById("pay-and-reserve").disabled = !(
    state.client.selectedPayment && phone.length >= 8
  );
}

function closePaymentModal() {
  document.getElementById("payment-modal").classList.add("hidden");
  state.client.selectedPayment = null;
}

async function confirmReservation() {
  if (!state.client.selectedSeat || !state.client.selectedPayment || !state.client.currentTrip) return;
  const payment_phone = document.getElementById("payment-phone").value.trim();
  if (payment_phone.replace(/\D/g, "").length < 8) {
    showToast("Numéro Wave ou Orange Money requis", "error");
    return;
  }
  try {
    const result = await api("/api/reservations", {
      method: "POST",
      body: JSON.stringify({
        trip_id: state.client.currentTrip.id,
        employee_id: state.user.employee_id,
        seat_number: state.client.selectedSeat,
        payment_method: state.client.selectedPayment,
        payment_phone,
        pickup_stop: state.client.selectedPickupStop,
        dropoff_stop: state.client.selectedDropoffStop,
      }),
    });
    closePaymentModal();
    const method = state.paymentMethods.find((m) => m.id === state.client.selectedPayment);
    showToast(`Réservé — ${formatPrice(result.amount)} via ${method?.label} (${result.payment_ref})`);
    await openClientTripDetail(state.client.currentTrip.id);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function renderClientReservationsList(containerId = "client-my-reservations") {
  const reservations = await api(`/api/employees/${state.user.employee_id}/reservations`);
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!reservations.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🎫</div><p>Aucune réservation.</p>
      <button class="btn btn-primary" style="margin-top:1rem" data-goto="trips">Réserver un trajet</button></div>`;
    bindGotoButtons(container);
    return;
  }

  container.innerHTML = reservations.map((r) => `
    <div class="reservation-card">
      <div>
        <h4>${r.route}</h4>
        <p>
          ${VEHICLE_ICONS[r.vehicle_type] || "🚐"} ${r.vehicle_name} (${r.plate})<br>
          📅 ${formatDate(r.date)} — 🕐 ${r.departure} → ${r.arrival}<br>
          💺 Siège n°${r.seat_number} — ${r.driver}<br>
          💰 ${r.amount ? formatPrice(r.amount) : "—"} — ${paymentMethodLabel(r.payment_method)}
          ${r.payment_status ? paymentStatusLabel(r.payment_status) : ""}
          ${r.payment_ref ? `<br><small>Réf. ${r.payment_ref}</small>` : ""}
        </p>
      </div>
      <button class="btn btn-danger" data-cancel="${r.id}">Annuler</button>
    </div>`).join("");

  container.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Annuler cette réservation ?")) return;
      try {
        await api(`/api/reservations/${btn.dataset.cancel}`, { method: "DELETE" });
        showToast("Réservation annulée");
        await renderClientReservationsList(containerId);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function renderClientReservations() {
  await renderClientReservationsList("client-my-reservations");
}

async function renderClientHistory() {
  const tripsPanel = document.getElementById("client-history-trips-panel");
  const subscriptionPanel = document.getElementById("client-history-subscription-panel");
  syncClientSubnav("client-history-subnav", "historyTab", state.client.historyTab);

  if (state.client.historyTab === "subscription") {
    tripsPanel?.classList.add("hidden");
    subscriptionPanel?.classList.remove("hidden");
    renderClientHistorySubscription();
    return;
  }

  tripsPanel?.classList.remove("hidden");
  subscriptionPanel?.classList.add("hidden");
  await renderClientReservationsList("client-history-list");
}

function renderClientHistorySubscription() {
  const el = document.getElementById("client-history-subscription-content");
  if (!el) return;

  api(`/api/employees/${state.user.employee_id}/subscriptions`)
    .then((subs) => {
      const active = subs.find((s) => s.status === "active" && s.end_date >= new Date().toISOString().slice(0, 10));
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Forfait CTI Abidjan</h3>
            ${active ? '<span class="badge badge-success">Actif</span>' : '<span class="badge badge-warning">Aucun abonnement</span>'}
          </div>
          ${active ? `
          <dl class="profile-dl">
            <dt>Formule</dt><dd>${active.plan_label}</dd>
            <dt>Validité</dt><dd>${formatDate(active.start_date)} → ${formatDate(active.end_date)}</dd>
            <dt>Tarif payé</dt><dd>${formatPrice(active.amount)} via ${paymentMethodLabel(active.payment_method)}</dd>
            <dt>Numéro</dt><dd>${active.payment_phone || "—"}</dd>
          </dl>` : `
          <p class="text-muted" style="margin-bottom:1rem">Trajets illimités sur toutes les lignes CTI Abidjan.</p>
          <button type="button" class="btn btn-primary" id="open-subscription-modal">Souscrire un abonnement</button>`}
        </div>
        ${subs.length ? `
        <div class="card" style="margin-top:1rem">
          <div class="card-header"><h3>Historique</h3></div>
          <div class="subscription-billing-list">
            ${subs.map((s) => `
              <div class="subscription-billing-row">
                <span>${s.plan_label}</span>
                <span>${formatPrice(s.amount)}</span>
                <span class="payment-badge ${s.status === 'active' ? 'paid' : ''}">${s.status}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}`;
      document.getElementById("open-subscription-modal")?.addEventListener("click", openSubscriptionModal);
    })
    .catch(() => {
      el.innerHTML = `<div class="empty-state"><p>Impossible de charger l'abonnement.</p></div>`;
    });
}

async function openSubscriptionModal() {
  state.client.selectedSubscriptionPlan = null;
  state.client.selectedSubscriptionPayment = null;
  const plans = await api("/api/subscription-plans");
  document.getElementById("subscription-plans").innerHTML = plans.map((p) => `
    <div class="payment-option" data-plan="${p.id}">
      <span class="icon">🎫</span>
      <div class="info"><strong>${p.label}</strong><span>${formatPrice(p.price)} — ${p.days} jours</span></div>
    </div>`).join("")
    + state.paymentMethods.map((m) => `
    <div class="payment-option" data-sub-payment="${m.id}">
      <span class="icon">${m.icon}</span>
      <div class="info"><strong>${m.label}</strong><span>Paiement abonnement</span></div>
    </div>`).join("");

  document.getElementById("subscription-phone").value = "";
  document.getElementById("subscription-plans").querySelectorAll("[data-plan]").forEach((el) => {
    el.addEventListener("click", () => {
      state.client.selectedSubscriptionPlan = el.dataset.plan;
      document.querySelectorAll("[data-plan]").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      validateSubscriptionForm();
    });
  });
  document.getElementById("subscription-plans").querySelectorAll("[data-sub-payment]").forEach((el) => {
    el.addEventListener("click", () => {
      state.client.selectedSubscriptionPayment = el.dataset.subPayment;
      document.querySelectorAll("[data-sub-payment]").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      validateSubscriptionForm();
    });
  });
  document.getElementById("subscription-phone").oninput = validateSubscriptionForm;
  document.getElementById("confirm-subscription").disabled = true;
  document.getElementById("subscription-modal").classList.remove("hidden");
}

function validateSubscriptionForm() {
  const phone = document.getElementById("subscription-phone").value.replace(/\D/g, "");
  document.getElementById("confirm-subscription").disabled = !(
    state.client.selectedSubscriptionPlan
    && state.client.selectedSubscriptionPayment
    && phone.length >= 8
  );
}

function closeSubscriptionModal() {
  document.getElementById("subscription-modal").classList.add("hidden");
}

async function confirmSubscription() {
  const payment_phone = document.getElementById("subscription-phone").value.trim();
  try {
    const result = await api("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        employee_id: state.user.employee_id,
        plan: state.client.selectedSubscriptionPlan,
        payment_method: state.client.selectedSubscriptionPayment,
        payment_phone,
      }),
    });
    closeSubscriptionModal();
    showToast(`${result.message} — ${result.payment_ref}`);
    renderClientHistorySubscription();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderClientProfileInfo(el) {
  el.innerHTML = `
    <div class="card-header"><h3>Informations</h3></div>
    <dl class="profile-dl">
      <dt>Nom affiché</dt><dd>${state.user.display_name}</dd>
      <dt>Identifiant</dt><dd>${state.user.username}</dd>
      <dt>N° employé</dt><dd>${state.user.employee_id || "—"}</dd>
      <dt>Espace</dt><dd>Client CITI</dd>
    </dl>
    <form id="client-profile-info-form" class="profile-form">
      <label>
        <span>Modifier mon nom</span>
        <input type="text" id="client-profile-name" value="${state.user.display_name}" required minlength="2" />
      </label>
      <button type="submit" class="btn btn-primary">Enregistrer</button>
    </form>`;

  document.getElementById("client-profile-info-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const display_name = document.getElementById("client-profile-name").value.trim();
    try {
      const result = await api("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ account_id: state.user.id, display_name }),
      });
      state.user = result.user;
      sessionStorage.setItem("citi_session", JSON.stringify(state.user));
      showToast("Informations mises à jour");
      renderClientProfile();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

function renderClientProfileSecurity(el) {
  el.innerHTML = `
    <div class="card-header"><h3>Sécurité</h3></div>
    <p class="text-muted" style="margin-bottom:1rem">Modifiez votre code personnel pour sécuriser votre accès CITI.</p>
    <form id="client-profile-security-form" class="profile-form">
      <label>
        <span>Nouveau code personnel</span>
        <input type="password" id="client-profile-password" autocomplete="new-password" required minlength="4" />
      </label>
      <label>
        <span>Confirmer le code</span>
        <input type="password" id="client-profile-password-confirm" autocomplete="new-password" required minlength="4" />
      </label>
      <button type="submit" class="btn btn-primary">Mettre à jour le code</button>
    </form>`;

  document.getElementById("client-profile-security-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("client-profile-password").value;
    const confirm = document.getElementById("client-profile-password-confirm").value;
    if (password !== confirm) {
      showToast("Les codes ne correspondent pas", "error");
      return;
    }
    try {
      const result = await api("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ account_id: state.user.id, password }),
      });
      state.user = result.user;
      sessionStorage.setItem("citi_session", JSON.stringify(state.user));
      showToast("Code personnel mis à jour");
      renderClientProfile();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

async function renderClientProfilePayments(el) {
  if (!state.paymentMethods.length) {
    try {
      state.paymentMethods = await api("/api/payment-methods");
    } catch {
      state.paymentMethods = [];
    }
  }

  let usedMethods = [];
  try {
    const reservations = await api(`/api/employees/${state.user.employee_id}/reservations`);
    usedMethods = [...new Set(reservations.map((r) => r.payment_method).filter(Boolean))];
  } catch {
    usedMethods = [];
  }

  el.innerHTML = `
    <div class="card-header"><h3>Mode de paiements</h3></div>
    <p class="text-muted" style="margin-bottom:1rem">Moyens acceptés pour vos réservations CITI.</p>
    <div class="chips-row client-payment-methods-list">
      ${state.paymentMethods.map((m) => `
        <span class="chip payment-method-chip">${m.icon} ${m.label}</span>`).join("")}
    </div>
    ${usedMethods.length ? `
      <h4 class="profile-section-title">Utilisés récemment</h4>
      <div class="chips-row">
        ${usedMethods.map((id) => `<span class="chip">${paymentMethodLabel(id)}</span>`).join("")}
      </div>` : `<p class="text-muted" style="margin-top:1rem">Aucun paiement enregistré pour le moment.</p>`}`;
}

async function renderClientProfile() {
  const el = document.getElementById("client-profile-content");
  if (!el || !state.user) return;

  syncClientSubnav("client-profile-subnav", "profileTab", state.client.profileTab);

  if (state.client.profileTab === "security") {
    renderClientProfileSecurity(el);
    return;
  }
  if (state.client.profileTab === "payments") {
    await renderClientProfilePayments(el);
    return;
  }
  renderClientProfileInfo(el);
}

function closeClientOptionsMenu() {
  const menu = document.getElementById("client-options-menu");
  const toggle = document.getElementById("client-menu-toggle");
  menu?.classList.add("hidden");
  toggle?.classList.remove("open");
  toggle?.setAttribute("aria-expanded", "false");
  document.querySelectorAll(".client-option-submenu").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll(".client-option-parent").forEach((el) => el.setAttribute("aria-expanded", "false"));
}

function toggleClientOptionsMenu() {
  const menu = document.getElementById("client-options-menu");
  const toggle = document.getElementById("client-menu-toggle");
  const isOpen = menu?.classList.toggle("hidden") === false;
  toggle?.classList.toggle("open", isOpen);
  toggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function applyClientDarkMode(enabled) {
  const shell = document.getElementById("app-client");
  const toggle = document.getElementById("client-dark-mode-toggle");
  shell?.classList.toggle("client-light-mode", !enabled);
  if (toggle) toggle.checked = enabled;
  localStorage.setItem("citi_client_dark_mode", enabled ? "1" : "0");
}

function normalizeSearchText(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function filterAbidjanStops(query, zoneId) {
  const q = normalizeSearchText(query);
  return ABIDJAN_TRANSIT_STOPS.filter((stop) => {
    if (zoneId && zoneId !== "all" && stop.zoneId !== zoneId) return false;
    if (!q) return true;
    const haystack = normalizeSearchText(
      `${stop.name} ${stop.zone} ${stop.type} ${(stop.lines || []).join(" ")}`
    );
    return haystack.includes(q);
  });
}

function renderClientStopsSearchResults() {
  const input = document.getElementById("client-stops-search-input");
  const resultsEl = document.getElementById("client-stops-search-results");
  if (!input || !resultsEl) return;

  const activeZone = document.querySelector(".client-zone-chip.active")?.dataset.zone || "all";
  const query = input.value.trim();
  const hasFilter = Boolean(query) || activeZone !== "all";

  if (!hasFilter) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    return;
  }

  const matches = filterAbidjanStops(query, activeZone).slice(0, 8);
  resultsEl.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");

  if (!matches.length) {
    resultsEl.innerHTML = `<p class="client-stops-empty">Aucune station ou arrêt disponible pour cette recherche.</p>`;
    return;
  }

  resultsEl.innerHTML = matches.map((stop) => `
    <button type="button" class="client-stop-result" role="option" data-stop-name="${stop.name}">
      <span class="client-stop-result-main">
        <strong>${stop.name}</strong>
        <span class="client-stop-type ${stop.type}">${stop.type === "station" ? "Station" : "Arrêt"}</span>
      </span>
      <span class="client-stop-result-meta">${stop.zone}${stop.lines?.length ? ` · ${stop.lines.join(" · ")}` : ""}</span>
    </button>`).join("");
}

function setupClientStopsSearch() {
  const input = document.getElementById("client-stops-search-input");
  const resultsEl = document.getElementById("client-stops-search-results");
  const searchBox = document.querySelector(".client-stops-search");
  if (!input || !resultsEl) return;

  input.addEventListener("input", renderClientStopsSearchResults);
  input.addEventListener("focus", renderClientStopsSearchResults);

  document.querySelectorAll(".client-zone-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".client-zone-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderClientStopsSearchResults();
      input.focus();
    });
  });

  resultsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".client-stop-result");
    if (!btn) return;
    const name = btn.dataset.stopName;
    input.value = name;
    resultsEl.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    showToast(`${name} sélectionné`, "info");
  });

  document.addEventListener("click", (e) => {
    if (searchBox && !searchBox.contains(e.target)) {
      resultsEl.classList.add("hidden");
      input.setAttribute("aria-expanded", "false");
    }
  });
}

function setupClientNav() {
  document.getElementById("client-menu-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleClientOptionsMenu();
  });

  document.addEventListener("click", (e) => {
    const head = document.querySelector(".client-sidebar-head");
    if (head && !head.contains(e.target)) closeClientOptionsMenu();
  });

  document.querySelectorAll("[data-client-option]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const option = btn.dataset.clientOption;
      closeClientOptionsMenu();
      if (option === "logout") {
        logout();
        return;
      }
      if (option === "subscription") {
        await openClientHistoryTab("subscription");
        openSubscriptionModal();
      }
    });
  });

  document.querySelectorAll("[data-client-menu]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleClientMenuSection(btn.dataset.clientMenu);
    });
  });

  document.querySelectorAll("[data-client-profile]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeClientOptionsMenu();
      await openClientProfileTab(btn.dataset.clientProfile);
    });
  });

  document.querySelectorAll("[data-client-history]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeClientOptionsMenu();
      await openClientHistoryTab(btn.dataset.clientHistory);
    });
  });

  document.querySelectorAll("#client-profile-subnav [data-profile-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await openClientProfileTab(btn.dataset.profileTab);
    });
  });

  document.querySelectorAll("#client-history-subnav [data-history-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await openClientHistoryTab(btn.dataset.historyTab);
    });
  });

  document.getElementById("client-dark-mode-toggle")?.addEventListener("change", (e) => {
    e.stopPropagation();
    applyClientDarkMode(e.target.checked);
  });

  document.getElementById("client-dark-mode-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.getElementById("client-back-to-trips").addEventListener("click", async () => {
    setClientView("trips");
    await renderClientTripsList();
  });
  document.getElementById("client-refresh-trips").addEventListener("click", renderClientTripsList);
  document.getElementById("client-trip-date-filter").addEventListener("change", renderClientTripsList);
  document.getElementById("client-confirm-reservation").addEventListener("click", openPaymentModal);
  bindGotoButtons(document.getElementById("app-client"));
  setupClientStopsSearch();
}

async function initClientApp() {
  setClientView("dashboard");
  await renderClientDashboard();
}

/* ─── Interface Chauffeur ─── */

function setDriverView(view) {
  state.driver.view = view;
  setRoleView("app-driver", view);
  const titles = DRIVER_TITLES[view] || DRIVER_TITLES.dashboard;
  document.getElementById("driver-page-title").textContent = titles[0];
  document.getElementById("driver-page-subtitle").textContent = titles[1];
}

async function renderDriverDashboard() {
  const driverName = state.user.driver_name;
  const trips = await api(`/api/trips?driver=${encodeURIComponent(driverName)}`);

  const today = new Date().toISOString().slice(0, 10);
  const todayTrips = trips.filter((t) => t.date === today);
  const totalPassengers = trips.reduce((s, t) => s + (t.reserved_count || 0), 0);
  const completed = trips.filter((t) => t.status === "completed").length;
  const inProgress = trips.filter((t) => t.status === "in_progress").length;

  renderHero(
    "driver-hero",
    "driver",
    `Bonjour ${driverName.split(" ")[0]} 🧑‍✈️`,
    `Vous avez ${todayTrips.length} mission(s) aujourd'hui. Pensez à valider chaque trajet à l'arrivée.`,
    inProgress ? "1 trajet en cours" : `${completed} trajet(s) effectué(s)`
  );

  document.getElementById("driver-stats-grid").innerHTML = `
    <div class="stat-card"><div class="value">${todayTrips.length}</div><div class="label">Missions aujourd'hui</div></div>
    <div class="stat-card"><div class="value">${totalPassengers}</div><div class="label">Passagers attendus</div></div>
    <div class="stat-card"><div class="value">${completed}</div><div class="label">Trajets effectués</div></div>
    <div class="stat-card"><div class="value">${trips.length - completed}</div><div class="label">Restants (3 j)</div></div>`;

  renderDriverChecklist();
  renderDriverTimeline(trips);

  const container = document.getElementById("driver-trips-list");
  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🚌</div><p>Aucune mission assignée pour le moment.</p></div>`;
    return;
  }
  container.innerHTML = trips.map((t) => renderTripCard(t, true, true)).join("");
  bindTripCards(container, openDriverTripDetail);
}

async function renderDriverPassengersOverview() {
  const driverName = state.user.driver_name;
  const trips = await api(`/api/trips?driver=${encodeURIComponent(driverName)}`);
  const container = document.getElementById("driver-passengers-content");

  if (!trips.length) {
    container.innerHTML = `<div class="empty-state"><p>Aucun passager à afficher.</p></div>`;
    return;
  }

  let html = "";
  for (const trip of trips) {
    const data = await api(`/api/trips/${trip.id}`);
    const passengers = data.reservations;
    html += `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-header">
          <h3>${trip.route} — ${formatDate(trip.date)} ${trip.departure}</h3>
          <span class="badge badge-success">${passengers.length}/${trip.capacity} passagers</span>
        </div>
        ${passengers.length ? `<div class="passenger-list">${passengers.map((p) => `
          <div class="passenger-row">
            <span class="seat-num">💺 ${p.seat_number}</span>
            <span><strong>${p.name}</strong> — ${p.department}</span>
            <span class="text-muted">${p.matricule}</span>
          </div>`).join("")}</div>` : `<p class="empty-state" style="padding:1rem">Aucun passager inscrit.</p>`}
      </div>`;
  }
  container.innerHTML = html;
}

async function openDriverTripDetail(tripId) {
  const data = await api(`/api/trips/${tripId}`);
  state.driver.currentTrip = data.trip;
  const trip = data.trip;
  const icon = VEHICLE_ICONS[trip.vehicle_type] || "🚐";

  document.getElementById("driver-trip-info").innerHTML = `
    <h3 style="margin-bottom:1rem">${trip.route} ${tripStatusBadge(trip.status)}</h3>
    <dl>
      <div><dt>Véhicule</dt><dd>${icon} ${trip.vehicle_name} (${trip.plate})</dd></div>
      <div><dt>Date</dt><dd>${formatDate(trip.date)}</dd></div>
      <div><dt>Horaires</dt><dd>${trip.departure} → ${trip.arrival}</dd></div>
      <div><dt>Capacité</dt><dd>${data.reservations.length} / ${trip.capacity} places</dd></div>
      ${trip.completed_at ? `<div><dt>Terminé le</dt><dd>${new Date(trip.completed_at).toLocaleString("fr-FR")}</dd></div>` : ""}
    </dl>`;

  const actions = document.getElementById("driver-trip-actions");
  if (trip.status === "pending") {
    actions.innerHTML = `
      <button class="btn btn-primary" id="start-trip-btn">Démarrer le trajet</button>
      <button class="btn btn-ghost" id="complete-trip-btn">Marquer comme effectué</button>`;
    document.getElementById("start-trip-btn").addEventListener("click", () => updateDriverTripStatus(tripId, "in_progress"));
    document.getElementById("complete-trip-btn").addEventListener("click", () => updateDriverTripStatus(tripId, "completed"));
  } else if (trip.status === "in_progress") {
    actions.innerHTML = `<button class="btn btn-primary" id="complete-trip-btn">Marquer comme effectué</button>`;
    document.getElementById("complete-trip-btn").addEventListener("click", () => updateDriverTripStatus(tripId, "completed"));
  } else {
    actions.innerHTML = `<p class="text-muted">✅ Trajet effectué par le chauffeur</p>`;
  }

  const list = document.getElementById("driver-passenger-list");
  if (!data.reservations.length) {
    list.innerHTML = `<div class="empty-state"><p>Aucun passager pour ce trajet.</p></div>`;
  } else {
    list.innerHTML = data.reservations.map((p) => `
      <div class="passenger-row">
        <span class="seat-num">Siège ${p.seat_number}</span>
        <div>
          <strong>${p.name}</strong><br>
          <small>${p.department} — ${p.matricule}</small>
        </div>
        <span>${paymentMethodLabel(p.payment_method)}</span>
      </div>`).join("");
  }

  setDriverView("trip-detail");
}

async function updateDriverTripStatus(tripId, status) {
  try {
    const result = await api(`/api/trips/${tripId}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        driver_name: state.user.driver_name,
      }),
    });
    showToast(result.message);
    await openDriverTripDetail(tripId);
    if (state.driver.view === "dashboard") await renderDriverDashboard();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function setupDriverNav() {
  document.querySelectorAll("#app-driver .nav-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const view = btn.dataset.view;
      setDriverView(view);
      if (view === "dashboard") await renderDriverDashboard();
      if (view === "passengers") await renderDriverPassengersOverview();
    });
  });
  document.getElementById("driver-back-to-trips").addEventListener("click", async () => {
    setDriverView("dashboard");
    await renderDriverDashboard();
  });
  document.getElementById("logout-driver").addEventListener("click", logout);
}

async function initDriverApp() {
  setDriverView("dashboard");
  await renderDriverDashboard();
}

/* ─── Interface Direction ─── */

function setDirectionView(view) {
  state.direction.view = view;
  setRoleView("app-direction", view);
  const titles = DIRECTION_TITLES[view] || DIRECTION_TITLES.dashboard;
  document.getElementById("direction-page-title").textContent = titles[0];
  document.getElementById("direction-page-subtitle").textContent = titles[1];
}

function renderReservationRow(r, showEmployee = true) {
  return `
    <div class="reservation-card read-only">
      <div>
        <h4>${r.route}</h4>
        <p>
          ${showEmployee ? `<strong>${r.employee_name || r.name}</strong> — ${r.department || ""} (${r.matricule || ""})<br>` : ""}
          📅 ${formatDate(r.date)} — 🕐 ${r.departure || ""}<br>
          💺 Siège n°${r.seat_number} — ${r.driver || ""}<br>
          ${r.vehicle_name ? `${VEHICLE_ICONS[r.vehicle_type] || "🚐"} ${r.vehicle_name} (${r.plate})<br>` : ""}
          💰 ${r.amount ? formatPrice(r.amount) : "—"} — ${paymentMethodLabel(r.payment_method)}
          ${r.payment_status ? paymentStatusLabel(r.payment_status) : ""}
          ${r.payment_ref ? `<br><small>Réf. ${r.payment_ref}</small>` : ""}
        </p>
      </div>
    </div>`;
}

function renderDirectionTripList(trips, emptyMsg) {
  if (!trips.length) return `<div class="empty-state" style="padding:1.5rem"><p>${emptyMsg}</p></div>`;
  return trips.map((t) => renderTripCard(t, false, true)).join("");
}

async function renderDirectionDashboard() {
  const data = await api("/api/admin/overview");
  state.direction.data = data;
  state.tripDays = data.trip_days || 3;

  renderHero(
    "direction-hero",
    "direction",
    `Pilotage CTI — ${state.user.display_name}`,
    `Supervisez la flotte, les trajets et les recettes sur le réseau Abidjan.`,
    `${data.today_reservations} clients aujourd'hui`
  );

  document.getElementById("direction-stats-grid").innerHTML = `
    <div class="stat-card"><div class="value">${data.fleet_count || data.vehicles}</div><div class="label">Véhicules en flotte</div></div>
    <div class="stat-card"><div class="value">${data.today_reservations}</div><div class="label">Clients aujourd'hui</div></div>
    <div class="stat-card"><div class="value">${data.trips_completed_count || 0}</div><div class="label">Trajets effectués</div></div>
    <div class="stat-card"><div class="value">${data.trips_remaining_count || 0}</div><div class="label">Trajets restants</div></div>
    <div class="stat-card"><div class="value">${formatPrice(data.total_revenue)}</div><div class="label">Recettes du jour</div></div>
    <div class="stat-card"><div class="value">${data.active_subscriptions || 0}</div><div class="label">Abonnements actifs</div></div>`;

  renderDirectionAlerts(data);
  renderFleetBreakdown(data.fleet);

  document.getElementById("dash-completed-count").textContent = data.trips_completed_count || 0;
  document.getElementById("dash-remaining-count").textContent = data.trips_remaining_count || 0;
  document.getElementById("direction-completed-trips").innerHTML =
    renderDirectionTripList(data.completed_trips || [], "Aucun trajet effectué pour le moment.");
  document.getElementById("direction-remaining-trips").innerHTML =
    renderDirectionTripList(data.remaining_trips || [], "Tous les trajets sont effectués.");

  const container = document.getElementById("direction-recent-reservations");
  if (!data.reservations.length) {
    container.innerHTML = `<div class="empty-state"><p>Aucune réservation enregistrée.</p></div>`;
    return;
  }
  container.innerHTML = data.reservations.slice(0, 6).map((r) => renderReservationRow(r)).join("");
}

function initFleetMap() {
  if (state.direction.fleetMap) {
    state.direction.fleetMap.remove();
    state.direction.fleetMap = null;
    state.direction.fleetMarkers = [];
  }
  const map = L.map("fleet-map").setView([5.3364, -4.0267], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 18,
  }).addTo(map);
  state.direction.fleetMap = map;
  return map;
}

function renderFleetMap(data) {
  const map = state.direction.fleetMap || initFleetMap();

  state.direction.fleetMarkers.forEach((m) => map.removeLayer(m));
  state.direction.fleetMarkers = [];

  const statusColors = { pending: "#5c6f82", in_progress: "#f97316", completed: "#16a34a" };

  Object.values(data.locations || {}).forEach((loc) => {
    const marker = L.circleMarker([loc.lat, loc.lng], {
      radius: 6,
      color: "#0c2340",
      fillColor: "#0c2340",
      fillOpacity: 0.25,
      weight: 2,
    }).addTo(map);
    marker.bindPopup(`<strong>${loc.label}</strong>`);
    state.direction.fleetMarkers.push(marker);
  });

  data.vehicles.forEach((v) => {
    if (v.latitude == null || v.longitude == null) return;
    const status = v.active_trip?.status || "pending";
    const color = statusColors[status] || statusColors.pending;
    const marker = L.marker([v.latitude, v.longitude], {
      icon: L.divIcon({
        className: "vehicle-marker",
        html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4);display:grid;place-items:center;font-size:14px">🚐</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(map);
    const tripInfo = v.active_trip
      ? `<br>${v.active_trip.route}<br>${tripStatusBadge(v.active_trip.status)}`
      : "<br>Aucun trajet actif";
    marker.bindPopup(`<strong>${v.name}</strong><br>${v.plate} — ${v.type}${tripInfo}`);
    state.direction.fleetMarkers.push(marker);
  });

  setTimeout(() => map.invalidateSize(), 100);
}

async function renderDirectionFleet() {
  const data = await api("/api/admin/fleet-map");

  document.getElementById("fleet-stats-grid").innerHTML = `
    <div class="stat-card"><div class="value">${data.fleet_count}</div><div class="label">Véhicules en flotte</div></div>
    <div class="stat-card"><div class="value">${data.trips_completed_count}</div><div class="label">Trajets effectués</div></div>
    <div class="stat-card"><div class="value">${data.trips_remaining_count}</div><div class="label">Trajets restants</div></div>
    <div class="stat-card"><div class="value">${data.vehicles.filter((v) => v.active_trip?.status === "in_progress").length}</div><div class="label">En déplacement</div></div>`;

  document.getElementById("fleet-count-badge").textContent = `${data.fleet_count} véhicule${data.fleet_count > 1 ? "s" : ""}`;

  document.getElementById("fleet-vehicle-list").innerHTML = data.vehicles.map((v) => `
    <div class="fleet-vehicle-card">
      <h4>${VEHICLE_ICONS[v.type] || "🚐"} ${v.name}</h4>
      <p>🔖 ${v.plate} — ${v.capacity} places — ${v.type}</p>
      <p>Trajets : ${v.trips_completed}/${v.trips_total} effectués</p>
      ${v.active_trip ? `<p>Actif : ${v.active_trip.route} ${tripStatusBadge(v.active_trip.status)}</p>` : "<p>Statut : Au dépôt</p>"}
    </div>`).join("");

  document.getElementById("fleet-completed-trips").innerHTML =
    renderDirectionTripList(data.completed_trips, "Aucun trajet marqué effectué.");
  document.getElementById("fleet-remaining-trips").innerHTML =
    renderDirectionTripList(data.remaining_trips, "Aucun trajet restant.");

  renderFleetMap(data);
}

async function renderDirectionTrips() {
  const data = state.direction.data || await api("/api/admin/overview");
  const container = document.getElementById("direction-trips-list");
  if (!data.trips.length) {
    container.innerHTML = `<div class="empty-state"><p>Aucun trajet planifié.</p></div>`;
    return;
  }
  container.innerHTML = data.trips.map((t) => renderTripCard(t, false, true)).join("");
}

async function renderDirectionVehicles() {
  const vehicles = await api("/api/admin/vehicles");
  document.getElementById("direction-vehicles-list").innerHTML = vehicles.map((v) => `
    <div class="fleet-vehicle-card" data-vehicle-id="${v.id}">
      <h4>${VEHICLE_ICONS[v.type] || "🚐"} ${v.name}</h4>
      <p>🔖 ${v.plate} — ${v.capacity} places — ${v.type}</p>
      <p>Chauffeur : ${v.driver_assigned || "—"}</p>
      <p>Statut : <strong>${v.on_trip ? "En trajet" : (v.status === "available" ? "Disponible" : v.status)}</strong></p>
      <div class="driver-trip-actions">
        <select class="veh-status-select" data-id="${v.id}">
          <option value="available" ${v.status === "available" ? "selected" : ""}>Disponible</option>
          <option value="on_trip" ${v.status === "on_trip" ? "selected" : ""}>En trajet</option>
          <option value="maintenance" ${v.status === "maintenance" ? "selected" : ""}>Maintenance</option>
        </select>
        <button class="btn btn-danger btn-sm veh-delete" data-id="${v.id}">Retirer</button>
      </div>
    </div>`).join("");

  document.querySelectorAll(".veh-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      try {
        await api(`/api/admin/vehicles/${sel.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: sel.value }),
        });
        showToast("Statut véhicule mis à jour");
        await renderDirectionVehicles();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
  document.querySelectorAll(".veh-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Retirer ce véhicule de la flotte ?")) return;
      try {
        await api(`/api/admin/vehicles/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Véhicule retiré");
        await renderDirectionVehicles();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function renderDirectionDrivers() {
  const data = state.direction.data || await api("/api/admin/overview");
  document.getElementById("direction-drivers-list").innerHTML = (data.drivers_stats || []).map((d) => `
    <div class="fleet-vehicle-card">
      <h4>👨‍✈️ ${d.driver}</h4>
      <p>${d.trips_count} missions planifiées · ${d.completed} effectuées</p>
    </div>`).join("") || `<div class="empty-state"><p>Aucun chauffeur.</p></div>`;

  document.getElementById("direction-clients-by-vehicle").innerHTML =
    (data.clients_by_vehicle_today || []).map((v) => `
    <div class="fleet-vehicle-card">
      <h4>${v.name}</h4>
      <p>${v.plate} — <strong>${v.clients_today} client(s)</strong> aujourd'hui</p>
    </div>`).join("") || `<div class="empty-state"><p>Aucune réservation aujourd'hui.</p></div>`;
}

async function handleAddVehicle(e) {
  e.preventDefault();
  try {
    await api("/api/admin/vehicles", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("veh-name").value.trim(),
        plate: document.getElementById("veh-plate").value.trim(),
        capacity: Number(document.getElementById("veh-capacity").value),
        type: document.getElementById("veh-type").value,
        driver_assigned: document.getElementById("veh-driver").value.trim(),
      }),
    });
    showToast("Véhicule ajouté");
    e.target.reset();
    await renderDirectionVehicles();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function renderDirectionReservations() {
  const data = state.direction.data || await api("/api/admin/overview");
  renderPaymentSummary(data.reservations);
  const container = document.getElementById("direction-all-reservations");
  if (!data.reservations.length) {
    container.innerHTML = `<div class="empty-state"><p>Aucune transaction enregistrée.</p></div>`;
    return;
  }
  container.innerHTML = data.reservations.map((r) => renderReservationRow(r)).join("");
}

function setupDirectionNav() {
  document.querySelectorAll("#app-direction .nav-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const view = btn.dataset.view;
      setDirectionView(view);
      if (view === "dashboard") await renderDirectionDashboard();
      if (view === "fleet") await renderDirectionFleet();
      if (view === "trips") await renderDirectionTrips();
      if (view === "vehicles") await renderDirectionVehicles();
      if (view === "drivers") await renderDirectionDrivers();
      if (view === "reservations") await renderDirectionReservations();
    });
  });
  document.getElementById("refresh-fleet-map").addEventListener("click", renderDirectionFleet);
  document.getElementById("logout-direction").addEventListener("click", logout);
  document.getElementById("direction-add-vehicle-form")?.addEventListener("submit", handleAddVehicle);
}

async function initDirectionApp() {
  setDirectionView("dashboard");
  await renderDirectionDashboard();
}

/* ─── Initialisation ─── */

function setupAuth() {
  document.getElementById("unified-login-form").addEventListener("submit", handleLogin);
  document.getElementById("unified-register-form").addEventListener("submit", handleRegister);
  document.querySelectorAll("[data-auth-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchAuthTab(btn.dataset.authTab));
  });

  document.getElementById("direction-verify-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("direction-verify-code").value.trim();
    const feedback = document.getElementById("direction-verify-feedback");
    try {
      const result = await api("/api/auth/direction/verify-code", {
        method: "POST",
        body: JSON.stringify({ account_id: state.user.id, code }),
      });
      if (result.verified) {
        showToast(result.message || "Accès direction confirmé", "success");
        await enterDirectionApp();
        return;
      }
      feedback.textContent = result.message || "Code validé.";
      feedback.classList.remove("hidden");
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.remove("hidden");
      showToast(err.message, "error");
    }
  });

  document.getElementById("direction-pending-logout")?.addEventListener("click", logout);

  document.getElementById("pay-and-reserve").addEventListener("click", confirmReservation);
  document.getElementById("cancel-payment").addEventListener("click", closePaymentModal);
  document.getElementById("close-payment-modal").addEventListener("click", closePaymentModal);
  document.getElementById("payment-backdrop").addEventListener("click", closePaymentModal);

  document.getElementById("confirm-subscription")?.addEventListener("click", confirmSubscription);
  document.getElementById("cancel-subscription")?.addEventListener("click", closeSubscriptionModal);
  document.getElementById("close-subscription-modal")?.addEventListener("click", closeSubscriptionModal);
  document.getElementById("subscription-backdrop")?.addEventListener("click", closeSubscriptionModal);
}

async function init() {
  mountCitiLogos();
  setupAuth();
  setupClientNav();
  setupDriverNav();
  setupDirectionNav();

  const saved = sessionStorage.getItem("citi_session");
  if (saved) {
    try {
      state.paymentMethods = await api("/api/payment-methods");
      state.user = JSON.parse(saved);
      document.body.classList.remove("intro-active");
      document.getElementById("intro-cinematic")?.classList.add("hidden");
      document.getElementById("login-screen").classList.add("hidden");
      await launchRoleApp(state.user.role);
      return;
    } catch {
      sessionStorage.removeItem("citi_session");
    }
  }

  if (shouldPlayIntro()) {
    startIntroCinematic();
  } else {
    document.body.classList.remove("intro-active");
    showLoginScreen();
  }

  api("/api/payment-methods")
    .then((methods) => { state.paymentMethods = methods; })
    .catch((err) => console.error(err));
}

init().catch((err) => {
  showToast("Impossible de charger l'application. Lancez le serveur Flask.", "error");
  console.error(err);
});
