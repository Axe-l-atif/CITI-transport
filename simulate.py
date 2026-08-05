"""Simulation complete du parcours CITI."""
import json
import random
import sys
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:5000"


def api(method, path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read()), res.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print("=" * 60)


def ok(msg):
    print(f"  [OK] {msg}")


def info(msg):
    print(f"  --> {msg}")


def main():
    print("\nSIMULATION CITI - Transport entreprise\n")

    # ── 1. Inscription client ──
    section("1. Nouveau client — création de compte")
    client_name = f"Simulateur {random.randint(100, 999)}"
    client_code = "sim2024"
    res, code = api("POST", "/api/auth/register-client", {
        "name": client_name,
        "password": client_code,
        "password_confirm": client_code,
    })
    if code == 201:
        client_user = res["user"]
        ok(f"Compte créé : {client_name} (code: {client_code})")
    else:
        info(f"Inscription : {res.get('error')} — tentative connexion existante")
        res, _ = api("POST", "/api/auth/login", {"username": "Jean Dupont", "password": "abcd"})
        client_user = res["user"]
        client_name = client_user["display_name"]
        ok(f"Connexion client : {client_name}")

    # ── 2. Connexion automatique des 3 profils ──
    section("2. Identification automatique (bloc unique)")
    profiles = [
        ("Client", {"username": client_name, "password": client_code}),
        ("Chauffeur", {"username": "CH-001", "password": "5678"}),
        ("Direction", {"username": "admin", "password": "citi2024"}),
    ]
    users = {}
    for label, creds in profiles:
        res, code = api("POST", "/api/auth/login", creds)
        if code == 200:
            users[label] = res["user"]
            ok(f"{label} -> {res['message']}")
        else:
            print(f"  [ERREUR] {label} : {res.get('error')}")

    client = users.get("Client", client_user)
    driver = users.get("Chauffeur", {})

    # ── 3. Client réserve des places ──
    section("3. Client — réservation de places")
    trips, _ = api("GET", "/api/trips")
    available = [t for t in trips if t.get("available_seats", 0) > 0][:3]
    reservations_made = []

    for trip in available:
        detail, _ = api("GET", f"/api/trips/{trip['id']}")
        occupied = {r["seat_number"] for r in detail.get("reservations", [])}
        seat = next((i for i in range(1, trip["capacity"] + 1) if i not in occupied), None)
        if not seat:
            continue
        methods = ["orange_money", "wave", "card", "company_account"]
        res, code = api("POST", "/api/reservations", {
            "trip_id": trip["id"],
            "employee_id": client["employee_id"],
            "seat_number": seat,
            "payment_method": random.choice(methods),
        })
        if code == 201:
            reservations_made.append(res)
            ok(f"{trip['route']} ({trip['date']}) — Siège {seat} — {res['payment_ref']}")
        else:
            info(f"{trip['route']} : {res.get('error')}")

    info(f"{len(reservations_made)} réservation(s) créée(s)")

    # ── 4. Chauffeur gère ses trajets ──
    section("4. Chauffeur — démarrage et clôture de trajets")
    driver_name = driver.get("driver_name", "Ousmane Gueye")
    driver_trips, _ = api("GET", f"/api/trips?driver={urllib.parse.quote(driver_name)}")
    pending = [t for t in driver_trips if t.get("status", "pending") == "pending"][:2]

    for trip in pending:
        res, code = api("PATCH", f"/api/trips/{trip['id']}/status", {
            "status": "in_progress",
            "driver_name": driver_name,
        })
        if code == 200:
            ok(f"Démarré : {trip['route']} — {trip['date']} {trip['departure']}")

        res, code = api("PATCH", f"/api/trips/{trip['id']}/status", {
            "status": "completed",
            "driver_name": driver_name,
        })
        if code == 200:
            ok(f"Effectué : {trip['route']} — {trip['date']}")

    # ── 5. Direction supervise ──
    section("5. Direction — vue globale et flotte")
    overview, _ = api("GET", "/api/admin/overview")
    fleet, _ = api("GET", "/api/admin/fleet-map")

    ok(f"Flotte : {overview.get('fleet_count', 0)} véhicules")
    ok(f"Trajets effectués : {overview.get('trips_completed_count', 0)}")
    ok(f"Trajets restants : {overview.get('trips_remaining_count', 0)}")
    ok(f"Recettes du jour : {overview.get('total_revenue', 0):,} FCFA".replace(",", " "))
    ok(f"Taux de remplissage : {overview.get('occupancy_rate', 0)}%")
    ok(f"Véhicules géolocalisés : {sum(1 for v in fleet.get('vehicles', []) if v.get('latitude'))}")

    section("6. Résumé de la simulation")
    print(f"""
  Client connecté     : {client_name}
  Réservations        : {len(reservations_made)}
  Chauffeur actif     : {driver_name}
  Trajets clôturés    : {overview.get('trips_completed_count', 0)}
  Recettes CITI       : {overview.get('total_revenue', 0):,} FCFA

  Ouvrez http://127.0.0.1:5000 et connectez-vous pour voir les resultats :
    - Client    : {client_name} / {client_code}
    - Chauffeur : CH-001 / 5678
    - Direction : admin / citi2024
""")
    print("Simulation terminée avec succès.\n")


if __name__ == "__main__":
    main()
