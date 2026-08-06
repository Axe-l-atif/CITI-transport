import os
import secrets
import socket
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory

from payments_service import (
    demo_payment_instructions,
    enrich_payment_methods,
    format_phone_display,
    merchant_config,
    new_payment_ref,
    normalize_phone,
    payment_mode,
    verify_wave_webhook_signature,
    wave_checkout_session,
)

APP_DIR = Path(__file__).parent
DB_PATH = APP_DIR / "cti.db"
TRIP_DAYS = 7
DIRECTION_ACCESS_CODE = "2250"
_db_initialized = False

LOCATIONS = {
    "plateau": (5.3192, -4.0281),
    "yopougon": (5.3378, -4.0899),
    "cocody": (5.3599, -3.9873),
    "koumassi": (5.2892, -3.9511),
    "marcory": (5.3014, -3.9870),
    "adjame": (5.3530, -4.0247),
    "bingerville": (5.3556, -3.8944),
}

ABIDJAN_STOPS = [
    {"zone": "Plateau", "zoneId": "plateau", "name": "Station Plateau — BCEAO", "type": "station", "lines": ["Ligne Nord", "Ligne Centre"]},
    {"zone": "Plateau", "zoneId": "plateau", "name": "Arrêt St-Paul", "type": "arret", "lines": ["Ligne Centre"]},
    {"zone": "Yopougon", "zoneId": "yopougon", "name": "Station Yopougon Siporex", "type": "station", "lines": ["Ligne Nord", "Ligne Ouest"]},
    {"zone": "Yopougon", "zoneId": "yopougon", "name": "Arrêt Wassakara", "type": "arret", "lines": ["Ligne Ouest"]},
    {"zone": "Cocody", "zoneId": "cocody", "name": "Station Cocody Riviera 2", "type": "station", "lines": ["Ligne Est", "Ligne Nord"]},
    {"zone": "Cocody", "zoneId": "cocody", "name": "Arrêt Angré 8e Tranche", "type": "arret", "lines": ["Ligne Est"]},
    {"zone": "Koumassi", "zoneId": "koumassi", "name": "Station Koumassi Remblais", "type": "station", "lines": ["Ligne Sud", "Ligne Centre"]},
    {"zone": "Koumassi", "zoneId": "koumassi", "name": "Arrêt Grand Campement", "type": "arret", "lines": ["Ligne Sud"]},
    {"zone": "Marcory", "zoneId": "marcory", "name": "Station Marcory Zone 4", "type": "station", "lines": ["Ligne Sud", "Ligne Est"]},
    {"zone": "Adjamé", "zoneId": "adjame", "name": "Station Adjamé Gare Routière", "type": "station", "lines": ["Ligne Nord", "Ligne Centre"]},
    {"zone": "Bingerville", "zoneId": "bingerville", "name": "Station Bingerville Centre", "type": "station", "lines": ["Ligne Est"]},
    {"zone": "Bingerville", "zoneId": "bingerville", "name": "Arrêt Abatta", "type": "arret", "lines": ["Ligne Est"]},
]

VEHICLE_OFFSETS = [
    (0.004, -0.003),
    (-0.003, 0.005),
    (0.006, 0.002),
    (-0.005, -0.004),
]

PRICES_BY_TYPE = {
    "berline": 3000,
    "minibus": 2000,
    "bus": 1000,
    "gbaka": 500,
}

PAYMENT_METHODS = {
    "orange_money": {"label": "Orange Money", "icon": "🟠", "phone_prefix": "+225"},
    "wave": {"label": "Wave", "icon": "🌊", "phone_prefix": "+225"},
}

SUBSCRIPTION_PLANS = {
    "mensuel": {"label": "Abonnement mensuel", "price": 35000, "days": 30},
    "hebdo": {"label": "Abonnement hebdomadaire", "price": 12000, "days": 7},
}

app = Flask(__name__, static_folder="static", static_url_path="/static")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            matricule TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            email TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            plate TEXT UNIQUE NOT NULL,
            capacity INTEGER NOT NULL,
            type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL,
            route TEXT NOT NULL,
            departure TEXT NOT NULL,
            arrival TEXT NOT NULL,
            date TEXT NOT NULL,
            driver TEXT NOT NULL,
            price INTEGER NOT NULL DEFAULT 1500,
            status TEXT NOT NULL DEFAULT 'pending',
            completed_at TEXT,
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        );

        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            seat_number INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            payment_method TEXT,
            amount INTEGER,
            payment_status TEXT DEFAULT 'pending',
            payment_ref TEXT,
            UNIQUE(trip_id, seat_number),
            UNIQUE(trip_id, employee_id),
            FOREIGN KEY (trip_id) REFERENCES trips(id),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            display_name TEXT NOT NULL,
            employee_id INTEGER,
            driver_name TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            plan TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            payment_phone TEXT NOT NULL,
            payment_ref TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS payment_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            phone TEXT NOT NULL,
            label TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(employee_id, method, phone),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS payment_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_ref TEXT UNIQUE NOT NULL,
            employee_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            payer_phone TEXT NOT NULL,
            amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            purpose TEXT NOT NULL,
            purpose_data TEXT,
            wave_session_id TEXT,
            wave_launch_url TEXT,
            created_at TEXT NOT NULL,
            paid_at TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );
        """
    )
    conn.commit()
    migrate_db(conn)
    seed_accounts(conn)

    cur.execute("SELECT COUNT(*) FROM employees")
    if cur.fetchone()[0] == 0:
        employees = [
            ("CTI-001", "Kouadio N'Guessan", "Client", "k.nguessan@cti.ci"),
            ("CTI-002", "Aya Traoré", "Client", "a.traore@cti.ci"),
            ("CTI-003", "Yao Kouassi", "Client", "y.kouassi@cti.ci"),
            ("CTI-004", "Adjoua Bamba", "Client", "a.bamba@cti.ci"),
            ("CTI-005", "Serge Koné", "Client", "s.kone@cti.ci"),
        ]
        cur.executemany(
            "INSERT INTO employees (matricule, name, department, email) VALUES (?, ?, ?, ?)",
            employees,
        )

        vehicles = [
            ("Navette Plateau", "CI-1234-AB", 14, "minibus"),
            ("Express Yopougon", "CI-5678-CD", 18, "bus"),
            ("Berline Cocody", "CI-9012-EF", 4, "berline"),
            ("Gbaka CTI Sud", "CI-3456-GH", 22, "gbaka"),
            ("Minibus Adjamé", "CI-7890-IJ", 12, "minibus"),
        ]
        cur.executemany(
            "INSERT INTO vehicles (name, plate, capacity, type) VALUES (?, ?, ?, ?)",
            vehicles,
        )

        conn.commit()

    sync_trips(conn)
    conn.close()


def migrate_db(conn):
    cur = conn.cursor()

    trip_cols = {row[1] for row in cur.execute("PRAGMA table_info(trips)").fetchall()}
    if "price" not in trip_cols:
        cur.execute("ALTER TABLE trips ADD COLUMN price INTEGER NOT NULL DEFAULT 1500")

    res_cols = {row[1] for row in cur.execute("PRAGMA table_info(reservations)").fetchall()}
    if "payment_method" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN payment_method TEXT")
    if "amount" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN amount INTEGER")
    if "payment_status" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN payment_status TEXT DEFAULT 'pending'")
    if "payment_ref" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN payment_ref TEXT")
    if "pickup_stop" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN pickup_stop TEXT")
    if "dropoff_stop" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN dropoff_stop TEXT")
    if "payment_phone" not in res_cols:
        cur.execute("ALTER TABLE reservations ADD COLUMN payment_phone TEXT")

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            plan TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            amount INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            payment_phone TEXT NOT NULL,
            payment_ref TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            phone TEXT NOT NULL,
            label TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(employee_id, method, phone),
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS payment_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_ref TEXT UNIQUE NOT NULL,
            employee_id INTEGER NOT NULL,
            method TEXT NOT NULL,
            payer_phone TEXT NOT NULL,
            amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            purpose TEXT NOT NULL,
            purpose_data TEXT,
            wave_session_id TEXT,
            wave_launch_url TEXT,
            created_at TEXT NOT NULL,
            paid_at TEXT,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS direction_access (
            account_id INTEGER PRIMARY KEY,
            email TEXT NOT NULL,
            verification_token TEXT,
            token_expires TEXT,
            verified_at TEXT,
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
        """
    )

    cur.execute(
        """
        UPDATE trips
        SET price = (
            SELECT CASE v.type
                WHEN 'berline' THEN ?
                WHEN 'minibus' THEN ?
                WHEN 'bus' THEN ?
                ELSE 1500
            END
            FROM vehicles v WHERE v.id = trips.vehicle_id
        )
        WHERE price IS NULL OR price = 0
        """,
        (PRICES_BY_TYPE["berline"], PRICES_BY_TYPE["minibus"], PRICES_BY_TYPE["bus"]),
    )
    cur.execute("DELETE FROM accounts WHERE role = 'client' AND password = '1234'")

    if "status" not in trip_cols:
        cur.execute("ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'")
    if "completed_at" not in trip_cols:
        cur.execute("ALTER TABLE trips ADD COLUMN completed_at TEXT")

    vehicle_cols = {row[1] for row in cur.execute("PRAGMA table_info(vehicles)").fetchall()}
    if "latitude" not in vehicle_cols:
        cur.execute("ALTER TABLE vehicles ADD COLUMN latitude REAL")
    if "longitude" not in vehicle_cols:
        cur.execute("ALTER TABLE vehicles ADD COLUMN longitude REAL")
    if "status" not in vehicle_cols:
        cur.execute("ALTER TABLE vehicles ADD COLUMN status TEXT NOT NULL DEFAULT 'available'")
    if "driver_assigned" not in vehicle_cols:
        cur.execute("ALTER TABLE vehicles ADD COLUMN driver_assigned TEXT")

    seed_vehicle_positions(conn)
    conn.commit()


def route_endpoints(route_name):
    route_lower = route_name.lower()
    if "yopougon" in route_lower:
        if route_name.startswith("Plateau") or route_name.startswith("Adjamé"):
            return LOCATIONS["plateau"], LOCATIONS["yopougon"]
        return LOCATIONS["yopougon"], LOCATIONS["plateau"]
    if "cocody" in route_lower:
        if route_name.startswith("Plateau") or route_name.startswith("Marcory"):
            return LOCATIONS["plateau"], LOCATIONS["cocody"]
        return LOCATIONS["cocody"], LOCATIONS["plateau"]
    if "koumassi" in route_lower:
        return LOCATIONS["marcory"], LOCATIONS["koumassi"]
    if "bingerville" in route_lower:
        return LOCATIONS["cocody"], LOCATIONS["bingerville"]
    if "adjamé" in route_lower or "adjame" in route_lower:
        return LOCATIONS["adjame"], LOCATIONS["plateau"]
    return LOCATIONS["plateau"], LOCATIONS["plateau"]


def seed_vehicle_positions(conn):
    vehicles = conn.execute("SELECT id, latitude, longitude FROM vehicles").fetchall()
    for i, vehicle in enumerate(vehicles):
        if vehicle["latitude"] is not None and vehicle["longitude"] is not None:
            continue
        offset = VEHICLE_OFFSETS[i % len(VEHICLE_OFFSETS)]
        lat = LOCATIONS["plateau"][0] + offset[0]
        lng = LOCATIONS["plateau"][1] + offset[1]
        conn.execute(
            "UPDATE vehicles SET latitude = ?, longitude = ? WHERE id = ?",
            (lat, lng, vehicle["id"]),
        )


def update_vehicle_position_for_trip(conn, trip_id, status):
    trip = conn.execute(
        "SELECT vehicle_id, route FROM trips WHERE id = ?",
        (trip_id,),
    ).fetchone()
    if not trip:
        return

    start, end = route_endpoints(trip["route"])
    if status == "pending":
        lat, lng = start
    elif status == "in_progress":
        lat = (start[0] + end[0]) / 2
        lng = (start[1] + end[1]) / 2
    else:
        lat, lng = end

    conn.execute(
        "UPDATE vehicles SET latitude = ?, longitude = ? WHERE id = ?",
        (lat, lng, trip["vehicle_id"]),
    )


def seed_accounts(conn):
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM accounts WHERE role != 'client'")
    if cur.fetchone()[0] > 0:
        return

    accounts = []
    drivers = [
        ("CH-001", "5678", "driver", "Jean-Baptiste Kouamé", None, "Jean-Baptiste Kouamé"),
        ("CH-002", "5678", "driver", "Mariam Diabaté", None, "Mariam Diabaté"),
        ("CH-003", "5678", "driver", "Ibrahim Touré", None, "Ibrahim Touré"),
        ("CH-004", "5678", "driver", "Fatou Sanogo", None, "Fatou Sanogo"),
        ("CH-005", "5678", "driver", "Koffi Assi", None, "Koffi Assi"),
    ]
    accounts.extend(drivers)
    accounts.append(("admin", "cti2026", "direction", "Directeur CTI", None, None))
    accounts.append(("direction", "cti2026", "direction", "Superviseur Abidjan", None, None))

    cur.executemany(
        """
        INSERT INTO accounts (username, password, role, display_name, employee_id, driver_name)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        accounts,
    )
    conn.commit()


def sync_trips(conn):
    today = datetime.now().date()
    last_day = (today + timedelta(days=TRIP_DAYS - 1)).isoformat()
    first_day = today.isoformat()

    cur = conn.cursor()
    cur.execute("DELETE FROM trips WHERE date < ? OR date > ?", (first_day, last_day))

    routes = [
        ("Plateau → Yopougon", "06:30", "07:15"),
        ("Yopougon → Plateau", "17:00", "17:45"),
        ("Plateau → Cocody", "07:00", "07:40"),
        ("Cocody → Plateau", "17:30", "18:10"),
        ("Marcory → Koumassi", "06:45", "07:20"),
        ("Koumassi → Marcory", "16:30", "17:05"),
        ("Cocody → Bingerville", "06:00", "06:45"),
        ("Bingerville → Cocody", "18:00", "18:45"),
        ("Adjamé → Plateau", "07:15", "07:45"),
        ("Plateau → Adjamé", "17:15", "17:45"),
    ]
    drivers = [
        "Jean-Baptiste Kouamé", "Mariam Diabaté", "Ibrahim Touré",
        "Fatou Sanogo", "Koffi Assi",
    ]

    vehicles = cur.execute("SELECT id, type FROM vehicles").fetchall()
    if not vehicles:
        return

    for day_offset in range(TRIP_DAYS):
        trip_date = (today + timedelta(days=day_offset)).isoformat()
        for i, (route, dep, arr) in enumerate(routes):
            vehicle = vehicles[i % len(vehicles)]
            price = PRICES_BY_TYPE.get(vehicle[1], 1500)
            exists = cur.execute(
                "SELECT id FROM trips WHERE vehicle_id = ? AND route = ? AND date = ?",
                (vehicle[0], route, trip_date),
            ).fetchone()
            if not exists:
                cur.execute(
                    """
                    INSERT INTO trips (vehicle_id, route, departure, arrival, date, driver, price)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (vehicle[0], route, dep, arr, trip_date, drivers[i % len(drivers)], price),
                )

    conn.commit()


def ensure_db():
    global _db_initialized
    if not _db_initialized:
        init_db()
        _db_initialized = True


@app.before_request
def prepare_db():
    if request.path in ("/health", "/"):
        return
    ensure_db()


@app.route("/")
def index():
    return send_from_directory(APP_DIR, "index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "cti-transport-abidjan"}), 200


def build_user_response(account):
    user = dict(account)
    user.pop("password", None)
    return user


def is_direction_verified(account_id):
    conn = get_db()
    row = conn.execute(
        "SELECT verified_at FROM direction_access WHERE account_id = ?",
        (account_id,),
    ).fetchone()
    conn.close()
    return bool(row and row["verified_at"])


def require_direction_access():
    account_id = request.headers.get("X-Citi-Account-Id") or request.args.get("account_id")
    if not account_id:
        return jsonify({"error": "Accès direction refusé."}), 403
    try:
        account_id = int(account_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Accès direction refusé."}), 403

    conn = get_db()
    account = conn.execute(
        "SELECT id, role FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    conn.close()
    if not account or account["role"] != "direction":
        return jsonify({"error": "Accès direction refusé."}), 403
    if not is_direction_verified(account_id):
        return jsonify({"error": "Saisissez le code direction pour accéder à l'interface."}), 403
    return None


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not all([username, password]):
        return jsonify({"error": "Identifiant et mot de passe requis"}), 400

    conn = get_db()
    account = conn.execute(
        """
        SELECT id, username, role, display_name, employee_id, driver_name, password
        FROM accounts
        WHERE password = ?
          AND (username = ? OR LOWER(display_name) = LOWER(?))
        """,
        (password, username, username),
    ).fetchone()
    conn.close()

    if not account:
        return jsonify(
            {"error": "Identifiants incorrects. Vérifiez vos informations ou créez votre accès client."}
        ), 401

    role_labels = {
        "client": "Espace client",
        "driver": "Espace chauffeur",
        "direction": "Espace direction",
    }
    return jsonify(
        {
            "user": build_user_response(account),
            "message": f"Connexion réussie — {role_labels.get(account['role'], 'CTI Transport')}",
            "direction_verified": account["role"] != "direction" or is_direction_verified(account["id"]),
        }
    )


@app.route("/api/auth/direction/status")
def direction_access_status():
    account_id = request.args.get("account_id")
    if not account_id:
        return jsonify({"error": "Compte requis"}), 400
    try:
        account_id = int(account_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Compte invalide"}), 400

    conn = get_db()
    account = conn.execute(
        "SELECT id, role FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if not account or account["role"] != "direction":
        conn.close()
        return jsonify({"error": "Compte direction introuvable"}), 404

    row = conn.execute(
        "SELECT verified_at FROM direction_access WHERE account_id = ?",
        (account_id,),
    ).fetchone()
    conn.close()

    verified = bool(row and row["verified_at"])
    return jsonify({"verified": verified})


@app.route("/api/auth/direction/verify-code", methods=["POST"])
def direction_verify_code():
    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")
    code = (data.get("code") or "").strip()

    if not account_id or not code:
        return jsonify({"error": "Code requis"}), 400

    if code != DIRECTION_ACCESS_CODE:
        return jsonify({"error": "Code incorrect."}), 403

    try:
        account_id = int(account_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Compte invalide"}), 400

    conn = get_db()
    account = conn.execute(
        "SELECT id, role FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if not account or account["role"] != "direction":
        conn.close()
        return jsonify({"error": "Compte direction introuvable"}), 404

    if is_direction_verified(account_id):
        conn.close()
        return jsonify({"verified": True, "message": "Accès direction déjà confirmé."})

    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        """
        INSERT INTO direction_access (account_id, email, verification_token, token_expires, verified_at)
        VALUES (?, '', NULL, NULL, ?)
        ON CONFLICT(account_id) DO UPDATE SET verified_at = excluded.verified_at
        """,
        (account_id, now),
    )
    conn.commit()
    conn.close()

    return jsonify({"verified": True, "message": "Accès direction confirmé."})


@app.route("/api/auth/register-client", methods=["POST"])
def register_client():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    password = (data.get("password") or "").strip()
    password_confirm = (data.get("password_confirm") or "").strip()

    if not all([name, password, password_confirm]):
        return jsonify({"error": "Nom, code et confirmation requis"}), 400

    if len(name) < 2:
        return jsonify({"error": "Le nom doit contenir au moins 2 caractères"}), 400

    if len(password) < 4:
        return jsonify({"error": "Le code doit contenir au moins 4 caractères"}), 400

    if password != password_confirm:
        return jsonify({"error": "Les codes ne correspondent pas"}), 400

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM accounts WHERE role = 'client' AND LOWER(display_name) = LOWER(?)",
        (name,),
    ).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Ce nom est déjà utilisé. Connectez-vous ou choisissez un autre nom."}), 409

    cur = conn.cursor()
    matricule = f"CLIENT-{secrets.token_hex(3).upper()}"
    email = f"{matricule.lower()}@cti.client"
    cur.execute(
        "INSERT INTO employees (matricule, name, department, email) VALUES (?, ?, ?, ?)",
        (matricule, name, "Client", email),
    )
    employee_id = cur.lastrowid
    cur.execute(
        """
        INSERT INTO accounts (username, password, role, display_name, employee_id, driver_name)
        VALUES (?, ?, 'client', ?, ?, NULL)
        """,
        (name, password, name, employee_id),
    )
    conn.commit()
    account = conn.execute(
        """
        SELECT id, username, role, display_name, employee_id, driver_name, password
        FROM accounts WHERE id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    conn.close()

    return jsonify(
        {
            "user": build_user_response(account),
            "message": "Code personnel créé avec succès",
        }
    ), 201


@app.route("/api/auth/profile", methods=["PATCH"])
def update_profile():
    data = request.get_json(silent=True) or {}
    account_id = data.get("account_id")
    display_name = (data.get("display_name") or "").strip()
    password = (data.get("password") or "").strip()

    if not account_id:
        return jsonify({"error": "Compte introuvable"}), 400

    if display_name and len(display_name) < 2:
        return jsonify({"error": "Le nom doit contenir au moins 2 caractères"}), 400

    if password and len(password) < 4:
        return jsonify({"error": "Le code doit contenir au moins 4 caractères"}), 400

    conn = get_db()
    account = conn.execute(
        "SELECT id, role FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if not account:
        conn.close()
        return jsonify({"error": "Compte introuvable"}), 404

    if display_name:
        duplicate = conn.execute(
            """
            SELECT id FROM accounts
            WHERE role = 'client' AND LOWER(display_name) = LOWER(?) AND id != ?
            """,
            (display_name, account_id),
        ).fetchone()
        if duplicate:
            conn.close()
            return jsonify({"error": "Ce nom est déjà utilisé"}), 409

    if display_name:
        conn.execute(
            "UPDATE accounts SET display_name = ?, username = ? WHERE id = ?",
            (display_name, display_name, account_id),
        )
        if account["role"] == "client":
            conn.execute(
                """
                UPDATE employees SET name = ?
                WHERE id = (SELECT employee_id FROM accounts WHERE id = ?)
                """,
                (display_name, account_id),
            )

    if password:
        conn.execute("UPDATE accounts SET password = ? WHERE id = ?", (password, account_id))

    conn.commit()
    updated = conn.execute(
        """
        SELECT id, username, role, display_name, employee_id, driver_name, password
        FROM accounts WHERE id = ?
        """,
        (account_id,),
    ).fetchone()
    conn.close()

    return jsonify({"user": build_user_response(updated), "message": "Profil mis à jour"})


@app.route("/api/employees")
def list_employees():
    conn = get_db()
    rows = conn.execute(
        """
        SELECT e.id, e.matricule, e.name, e.department, e.email,
               CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS has_account
        FROM employees e
        LEFT JOIN accounts a ON a.employee_id = e.id AND a.role = 'client'
        ORDER BY e.name
        """
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        item["has_account"] = bool(item.pop("has_account"))
        result.append(item)
    return jsonify(result)


@app.route("/api/trips")
def list_trips():
    date_filter = request.args.get("date")
    driver_filter = request.args.get("driver")
    conn = get_db()
    query = """
        SELECT
            t.id, t.route, t.departure, t.arrival, t.date, t.driver, t.price, t.status, t.completed_at,
            v.id AS vehicle_id, v.name AS vehicle_name, v.plate, v.capacity, v.type AS vehicle_type,
            COUNT(r.id) AS reserved_count
        FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN reservations r ON r.trip_id = t.id
    """
    params = []
    conditions = []
    if date_filter:
        conditions.append("t.date = ?")
        params.append(date_filter)
    if driver_filter:
        conditions.append("t.driver = ?")
        params.append(driver_filter)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " GROUP BY t.id ORDER BY t.date, t.departure"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        item["available_seats"] = item["capacity"] - item["reserved_count"]
        result.append(item)
    return jsonify(result)


@app.route("/api/trips/<int:trip_id>")
def get_trip(trip_id):
    conn = get_db()
    trip = conn.execute(
        """
        SELECT
            t.id, t.route, t.departure, t.arrival, t.date, t.driver, t.price, t.status, t.completed_at,
            v.id AS vehicle_id, v.name AS vehicle_name, v.plate, v.capacity, v.type AS vehicle_type
        FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.id = ?
        """,
        (trip_id,),
    ).fetchone()

    if not trip:
        conn.close()
        return jsonify({"error": "Trajet introuvable"}), 404

    reservations = conn.execute(
        """
        SELECT
            r.seat_number, r.created_at, r.payment_method, r.amount,
            r.payment_status, r.payment_ref,
            e.id AS employee_id, e.name, e.department, e.matricule
        FROM reservations r
        JOIN employees e ON e.id = r.employee_id
        WHERE r.trip_id = ?
        ORDER BY r.seat_number
        """,
        (trip_id,),
    ).fetchall()
    conn.close()

    return jsonify({"trip": dict(trip), "reservations": [dict(r) for r in reservations]})


@app.route("/api/trips/<int:trip_id>/status", methods=["PATCH"])
def update_trip_status(trip_id):
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    driver_name = (data.get("driver_name") or "").strip()

    if new_status not in ("in_progress", "completed"):
        return jsonify({"error": "Statut invalide"}), 400

    conn = get_db()
    trip = conn.execute(
        "SELECT id, driver, status, vehicle_id, route FROM trips WHERE id = ?",
        (trip_id,),
    ).fetchone()

    if not trip:
        conn.close()
        return jsonify({"error": "Trajet introuvable"}), 404

    if driver_name and trip["driver"] != driver_name:
        conn.close()
        return jsonify({"error": "Ce trajet ne vous est pas assigné"}), 403

    current = trip["status"]
    if new_status == "in_progress" and current != "pending":
        conn.close()
        return jsonify({"error": "Ce trajet ne peut plus être démarré"}), 409
    if new_status == "completed" and current not in ("pending", "in_progress"):
        conn.close()
        return jsonify({"error": "Ce trajet est déjà terminé"}), 409

    completed_at = datetime.now().isoformat() if new_status == "completed" else None
    conn.execute(
        "UPDATE trips SET status = ?, completed_at = ? WHERE id = ?",
        (new_status, completed_at, trip_id),
    )
    update_vehicle_position_for_trip(conn, trip_id, new_status)
    conn.commit()
    conn.close()

    labels = {
        "in_progress": "Trajet démarré",
        "completed": "Trajet marqué comme effectué",
    }
    return jsonify({"message": labels[new_status], "status": new_status})


@app.route("/api/admin/fleet-map")
def admin_fleet_map():
    denied = require_direction_access()
    if denied:
        return denied
    conn = get_db()
    vehicles = conn.execute(
        """
        SELECT id, name, plate, capacity, type, latitude, longitude
        FROM vehicles ORDER BY name
        """
    ).fetchall()

    trips = conn.execute(
        """
        SELECT
            t.id, t.route, t.departure, t.arrival, t.date, t.driver, t.status, t.completed_at,
            t.vehicle_id, v.name AS vehicle_name, v.plate, v.type AS vehicle_type,
            COUNT(r.id) AS reserved_count, v.capacity
        FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN reservations r ON r.trip_id = t.id
        GROUP BY t.id
        ORDER BY t.date, t.departure
        """
    ).fetchall()
    conn.close()

    trip_list = [dict(t) for t in trips]
    completed = [t for t in trip_list if t["status"] == "completed"]
    remaining = [t for t in trip_list if t["status"] != "completed"]

    fleet = []
    for v in vehicles:
        vehicle_trips = [t for t in trip_list if t["vehicle_id"] == v["id"]]
        active = next(
            (t for t in vehicle_trips if t["status"] == "in_progress"),
            None,
        ) or next(
            (t for t in vehicle_trips if t["status"] == "pending"),
            None,
        )
        fleet.append(
            {
                **dict(v),
                "active_trip": active,
                "trips_total": len(vehicle_trips),
                "trips_completed": sum(1 for t in vehicle_trips if t["status"] == "completed"),
            }
        )

    return jsonify(
        {
            "fleet_count": len(fleet),
            "vehicles": fleet,
            "trips_completed_count": len(completed),
            "trips_remaining_count": len(remaining),
            "completed_trips": completed,
            "remaining_trips": remaining,
            "locations": {
                "plateau": {"lat": LOCATIONS["plateau"][0], "lng": LOCATIONS["plateau"][1], "label": "Plateau"},
                "yopougon": {"lat": LOCATIONS["yopougon"][0], "lng": LOCATIONS["yopougon"][1], "label": "Yopougon"},
                "cocody": {"lat": LOCATIONS["cocody"][0], "lng": LOCATIONS["cocody"][1], "label": "Cocody"},
                "koumassi": {"lat": LOCATIONS["koumassi"][0], "lng": LOCATIONS["koumassi"][1], "label": "Koumassi"},
                "marcory": {"lat": LOCATIONS["marcory"][0], "lng": LOCATIONS["marcory"][1], "label": "Marcory"},
                "adjame": {"lat": LOCATIONS["adjame"][0], "lng": LOCATIONS["adjame"][1], "label": "Adjamé"},
                "bingerville": {"lat": LOCATIONS["bingerville"][0], "lng": LOCATIONS["bingerville"][1], "label": "Bingerville"},
            },
        }
    )


@app.route("/api/stops")
def list_stops():
    zone = request.args.get("zone")
    query = request.args.get("q", "").strip().lower()
    stops = ABIDJAN_STOPS
    if zone and zone != "all":
        stops = [s for s in stops if s["zoneId"] == zone]
    if query:
        stops = [
            s for s in stops
            if query in s["name"].lower() or query in s["zone"].lower()
        ]
    return jsonify(stops)


@app.route("/api/subscription-plans")
def list_subscription_plans():
    return jsonify(
        [{"id": key, **value} for key, value in SUBSCRIPTION_PLANS.items()]
    )


@app.route("/api/subscriptions", methods=["POST"])
def create_subscription():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id")
    plan = data.get("plan")
    payment_method = data.get("payment_method")
    payment_phone = (data.get("payment_phone") or "").strip()

    if not all([employee_id, plan, payment_method, payment_phone]):
        return jsonify({"error": "Plan, moyen de paiement et numéro requis"}), 400

    if plan not in SUBSCRIPTION_PLANS:
        return jsonify({"error": "Formule d'abonnement invalide"}), 400

    if payment_method not in PAYMENT_METHODS:
        return jsonify({"error": "Moyen de paiement invalide"}), 400

    phone_digits = "".join(c for c in payment_phone if c.isdigit())
    if len(phone_digits) < 8:
        return jsonify({"error": "Numéro Wave ou Orange Money invalide"}), 400

    conn = get_db()
    active = conn.execute(
        """
        SELECT id FROM subscriptions
        WHERE employee_id = ? AND status = 'active' AND end_date >= ?
        """,
        (employee_id, datetime.now().date().isoformat()),
    ).fetchone()
    if active:
        conn.close()
        return jsonify({"error": "Vous avez déjà un abonnement actif"}), 409

    plan_info = SUBSCRIPTION_PLANS[plan]
    start = datetime.now().date()
    end = start + timedelta(days=plan_info["days"])
    now = datetime.now().isoformat(timespec="seconds")
    payment_ref = f"CTI-ABO-{secrets.token_hex(3).upper()}"

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO subscriptions (
            employee_id, plan, start_date, end_date, amount,
            payment_method, payment_phone, payment_ref, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        """,
        (
            employee_id, plan, start.isoformat(), end.isoformat(),
            plan_info["price"], payment_method, payment_phone,
            payment_ref, now,
        ),
    )
    conn.commit()
    sub_id = cur.lastrowid
    conn.close()

    return jsonify(
        {
            "id": sub_id,
            "message": "Abonnement activé",
            "plan": plan_info["label"],
            "amount": plan_info["price"],
            "end_date": end.isoformat(),
            "payment_ref": payment_ref,
        }
    ), 201


@app.route("/api/employees/<int:employee_id>/subscriptions")
def employee_subscriptions(employee_id):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT id, plan, start_date, end_date, amount, payment_method,
               payment_phone, payment_ref, status, created_at
        FROM subscriptions WHERE employee_id = ?
        ORDER BY created_at DESC
        """,
        (employee_id,),
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        item["plan_label"] = SUBSCRIPTION_PLANS.get(item["plan"], {}).get("label", item["plan"])
        result.append(item)
    return jsonify(result)


@app.route("/api/payment-config")
def payment_config():
    return jsonify(merchant_config())


@app.route("/api/payment-methods")
def list_payment_methods():
    return jsonify(enrich_payment_methods(PAYMENT_METHODS))


def public_base_url():
    base = os.environ.get("CTI_PUBLIC_URL", "").strip()
    if base:
        return base.rstrip("/")
    return request.url_root.rstrip("/")


def get_payment_session(conn, payment_ref):
    return conn.execute(
        "SELECT * FROM payment_sessions WHERE payment_ref = ?",
        (payment_ref,),
    ).fetchone()


@app.route("/api/employees/<int:employee_id>/payment-wallets", methods=["GET", "POST"])
def payment_wallets(employee_id):
    conn = get_db()
    if request.method == "GET":
        rows = conn.execute(
            """
            SELECT id, method, phone, label, is_default, created_at
            FROM payment_wallets WHERE employee_id = ?
            ORDER BY is_default DESC, created_at DESC
            """,
            (employee_id,),
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json(silent=True) or {}
    method = data.get("method")
    phone = (data.get("phone") or "").strip()
    label = (data.get("label") or "").strip()
    set_default = bool(data.get("is_default"))

    if method not in PAYMENT_METHODS:
        conn.close()
        return jsonify({"error": "Moyen de paiement invalide"}), 400
    if len(normalize_phone(phone)) < 8:
        conn.close()
        return jsonify({"error": "Numéro invalide"}), 400

    now = datetime.now().isoformat(timespec="seconds")
    if set_default:
        conn.execute(
            "UPDATE payment_wallets SET is_default = 0 WHERE employee_id = ?",
            (employee_id,),
        )

    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO payment_wallets (employee_id, method, phone, label, is_default, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (employee_id, method, phone, label or None, 1 if set_default else 0, now),
        )
        conn.commit()
        wallet = conn.execute(
            "SELECT * FROM payment_wallets WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        conn.close()
        return jsonify(dict(wallet)), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Ce numéro est déjà enregistré pour ce moyen de paiement"}), 409


@app.route("/api/employees/<int:employee_id>/payment-wallets/<int:wallet_id>", methods=["DELETE"])
def delete_payment_wallet(employee_id, wallet_id):
    conn = get_db()
    conn.execute(
        "DELETE FROM payment_wallets WHERE id = ? AND employee_id = ?",
        (wallet_id, employee_id),
    )
    conn.commit()
    deleted = conn.total_changes
    conn.close()
    if not deleted:
        return jsonify({"error": "Compte introuvable"}), 404
    return jsonify({"message": "Numéro retiré"})


@app.route("/api/employees/<int:employee_id>/payment-wallets/<int:wallet_id>/default", methods=["PATCH"])
def set_default_payment_wallet(employee_id, wallet_id):
    conn = get_db()
    wallet = conn.execute(
        "SELECT id FROM payment_wallets WHERE id = ? AND employee_id = ?",
        (wallet_id, employee_id),
    ).fetchone()
    if not wallet:
        conn.close()
        return jsonify({"error": "Compte introuvable"}), 404
    conn.execute(
        "UPDATE payment_wallets SET is_default = 0 WHERE employee_id = ?",
        (employee_id,),
    )
    conn.execute(
        "UPDATE payment_wallets SET is_default = 1 WHERE id = ?",
        (wallet_id,),
    )
    conn.commit()
    updated = conn.execute(
        "SELECT * FROM payment_wallets WHERE id = ?", (wallet_id,)
    ).fetchone()
    conn.close()
    return jsonify(dict(updated))


@app.route("/api/payments/initiate", methods=["POST"])
def initiate_payment():
    data = request.get_json(silent=True) or {}
    employee_id = data.get("employee_id")
    method = data.get("payment_method")
    payer_phone = (data.get("payment_phone") or "").strip()
    amount = data.get("amount")
    purpose = (data.get("purpose") or "reservation").strip()
    purpose_data = data.get("purpose_data") or {}

    if not all([employee_id, method, payer_phone, amount]):
        return jsonify({"error": "Données de paiement incomplètes"}), 400
    if method not in PAYMENT_METHODS:
        return jsonify({"error": "Moyen de paiement invalide"}), 400
    if len(normalize_phone(payer_phone)) < 8:
        return jsonify({"error": "Numéro Wave ou Orange Money invalide"}), 400

    amount = int(amount)
    if amount < 0:
        return jsonify({"error": "Montant invalide"}), 400

    payment_ref = new_payment_ref()
    now = datetime.now().isoformat(timespec="seconds")
    base = public_base_url()
    success_url = f"{base}/api/payments/return/success?ref={payment_ref}"
    error_url = f"{base}/api/payments/return/error?ref={payment_ref}"

    wave_launch_url = None
    wave_session_id = None
    instructions = None

    if amount == 0:
        status = "paid"
        paid_at = now
    elif method == "wave" and payment_mode() == "live":
        wave_data, err = wave_checkout_session(
            amount, payment_ref, success_url, error_url, payer_phone
        )
        if err:
            return jsonify({"error": f"Wave : {err}"}), 502
        wave_launch_url = wave_data.get("wave_launch_url")
        wave_session_id = wave_data.get("id")
        status = "pending"
        paid_at = None
    else:
        status = "pending"
        paid_at = None
        instructions = demo_payment_instructions(method, amount, payment_ref, payer_phone)

    conn = get_db()
    conn.execute(
        """
        INSERT INTO payment_sessions (
            payment_ref, employee_id, method, payer_phone, amount, status,
            purpose, purpose_data, wave_session_id, wave_launch_url, created_at, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payment_ref, employee_id, method, payer_phone, amount, status,
            purpose, json.dumps(purpose_data), wave_session_id, wave_launch_url,
            now, paid_at,
        ),
    )
    conn.commit()
    conn.close()

    return jsonify(
        {
            "payment_ref": payment_ref,
            "status": status,
            "amount": amount,
            "method": method,
            "wave_launch_url": wave_launch_url,
            "instructions": instructions,
            "mode": payment_mode(),
        }
    ), 201


@app.route("/api/payments/<payment_ref>/status")
def payment_status(payment_ref):
    conn = get_db()
    session = get_payment_session(conn, payment_ref)
    conn.close()
    if not session:
        return jsonify({"error": "Paiement introuvable"}), 404
    return jsonify(
        {
            "payment_ref": session["payment_ref"],
            "status": session["status"],
            "amount": session["amount"],
            "method": session["method"],
            "paid_at": session["paid_at"],
        }
    )


@app.route("/api/payments/<payment_ref>/confirm", methods=["POST"])
def confirm_payment(payment_ref):
    """Confirmation manuelle en mode démo (transfert Wave / Orange Money)."""
    if payment_mode() == "live":
        return jsonify({"error": "Confirmation automatique en mode production"}), 400

    conn = get_db()
    session = get_payment_session(conn, payment_ref)
    if not session:
        conn.close()
        return jsonify({"error": "Paiement introuvable"}), 404
    if session["status"] == "paid":
        conn.close()
        return jsonify({"status": "paid", "message": "Paiement déjà confirmé"})
    if session["amount"] == 0:
        conn.close()
        return jsonify({"status": "paid", "message": "Gratuit (abonnement)"})

    now = datetime.now().isoformat(timespec="seconds")
    conn.execute(
        "UPDATE payment_sessions SET status = 'paid', paid_at = ? WHERE payment_ref = ?",
        (now, payment_ref),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "paid", "message": "Paiement confirmé", "paid_at": now})


@app.route("/api/payments/webhook/wave", methods=["POST"])
def wave_webhook():
    secret = os.environ.get("WAVE_WEBHOOK_SECRET", "").strip()
    payload = request.get_data()
    signature = request.headers.get("Wave-Signature", "")

    if secret and not verify_wave_webhook_signature(payload, signature, secret):
        return jsonify({"error": "Signature invalide"}), 403

    try:
        event = request.get_json(silent=True) or {}
    except Exception:
        return jsonify({"error": "Payload invalide"}), 400

    ref = event.get("client_reference") or event.get("data", {}).get("client_reference")
    status = event.get("type") or event.get("data", {}).get("checkout_status")

    if ref and status in ("checkout.session.completed", "complete", "checkout.session.completed"):
        conn = get_db()
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute(
            "UPDATE payment_sessions SET status = 'paid', paid_at = ? WHERE payment_ref = ?",
            (now, ref),
        )
        conn.commit()
        conn.close()

    return jsonify({"received": True})


@app.route("/api/payments/return/success")
def payment_return_success():
    ref = request.args.get("ref", "")
    return redirect(f"/?payment=success&ref={ref}")


@app.route("/api/payments/return/error")
def payment_return_error():
    ref = request.args.get("ref", "")
    return redirect(f"/?payment=error&ref={ref}")


@app.route("/api/payment-methods-legacy")
def list_payment_methods_legacy():
    return jsonify(
        [
            {"id": key, **value}
            for key, value in PAYMENT_METHODS.items()
        ]
    )


@app.route("/api/reservations", methods=["POST"])
def create_reservation():
    data = request.get_json(silent=True) or {}
    trip_id = data.get("trip_id")
    employee_id = data.get("employee_id")
    seat_number = data.get("seat_number")
    payment_method = data.get("payment_method")
    payment_phone = (data.get("payment_phone") or "").strip()
    pickup_stop = (data.get("pickup_stop") or "").strip()
    dropoff_stop = (data.get("dropoff_stop") or "").strip()
    payment_ref = (data.get("payment_ref") or "").strip()

    if not all([trip_id, employee_id, seat_number, payment_method]):
        return jsonify(
            {"error": "trip_id, employee_id, seat_number et payment_method sont requis"}
        ), 400

    if payment_method not in PAYMENT_METHODS:
        return jsonify({"error": "Moyen de paiement invalide"}), 400

    conn = get_db()
    trip = conn.execute(
        """
        SELECT t.id, t.price, v.capacity
        FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.id = ?
        """,
        (trip_id,),
    ).fetchone()

    if not trip:
        conn.close()
        return jsonify({"error": "Trajet introuvable"}), 404

    if seat_number < 1 or seat_number > trip["capacity"]:
        conn.close()
        return jsonify({"error": f"Siège invalide (1-{trip['capacity']})"}), 400

    existing_seat = conn.execute(
        "SELECT id FROM reservations WHERE trip_id = ? AND seat_number = ?",
        (trip_id, seat_number),
    ).fetchone()
    if existing_seat:
        conn.close()
        return jsonify({"error": "Ce siège est déjà réservé"}), 409

    existing_employee = conn.execute(
        "SELECT id FROM reservations WHERE trip_id = ? AND employee_id = ?",
        (trip_id, employee_id),
    ).fetchone()
    if existing_employee:
        conn.close()
        return jsonify({"error": "Vous avez déjà une réservation pour ce trajet"}), 409

    amount = trip["price"]
    active_sub = conn.execute(
        """
        SELECT id FROM subscriptions
        WHERE employee_id = ? AND status = 'active' AND end_date >= ?
        """,
        (employee_id, datetime.now().date().isoformat()),
    ).fetchone()
    if active_sub:
        amount = 0

    payment_status_val = "paid"
    if amount > 0:
        if not payment_ref:
            conn.close()
            return jsonify({"error": "Effectuez d'abord le paiement Wave ou Orange Money"}), 400
        session = get_payment_session(conn, payment_ref)
        if not session:
            conn.close()
            return jsonify({"error": "Référence de paiement introuvable"}), 404
        if session["employee_id"] != employee_id:
            conn.close()
            return jsonify({"error": "Paiement non associé à votre compte"}), 403
        if session["status"] != "paid":
            conn.close()
            return jsonify({"error": "Paiement non confirmé. Terminez le transfert Wave ou Orange Money."}), 402
        if session["amount"] != amount:
            conn.close()
            return jsonify({"error": "Montant du paiement incorrect"}), 400
        if session["method"] != payment_method:
            conn.close()
            return jsonify({"error": "Moyen de paiement incompatible"}), 400
        payment_phone = session["payer_phone"]
    else:
        if not payment_ref:
            payment_ref = new_payment_ref("CTI-FREE")
        phone_digits = normalize_phone(payment_phone)
        if len(phone_digits) < 8:
            payment_phone = payment_phone or "—"

    now = datetime.now().isoformat()

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO reservations (
            trip_id, employee_id, seat_number, created_at,
            payment_method, amount, payment_status, payment_ref,
            pickup_stop, dropoff_stop, payment_phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            trip_id, employee_id, seat_number, now,
            payment_method, amount, payment_status_val, payment_ref,
            pickup_stop or None, dropoff_stop or None, payment_phone,
        ),
    )
    conn.commit()
    reservation_id = cur.lastrowid
    conn.close()

    return jsonify(
        {
            "id": reservation_id,
            "message": "Réservation confirmée" + (" (abonnement)" if amount == 0 else ""),
            "amount": amount,
            "payment_method": payment_method,
            "payment_status": payment_status_val,
            "payment_ref": payment_ref,
            "payment_phone": payment_phone,
        }
    ), 201


@app.route("/api/reservations/<int:reservation_id>", methods=["DELETE"])
def cancel_reservation(reservation_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM reservations WHERE id = ?", (reservation_id,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()

    if deleted == 0:
        return jsonify({"error": "Réservation introuvable"}), 404
    return jsonify({"message": "Réservation annulée"})


@app.route("/api/employees/<int:employee_id>/reservations")
def employee_reservations(employee_id):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT
            r.id, r.seat_number, r.created_at,
            r.payment_method, r.amount, r.payment_status, r.payment_ref,
            t.id AS trip_id, t.route, t.departure, t.arrival, t.date, t.driver, t.price,
            v.name AS vehicle_name, v.plate, v.type AS vehicle_type
        FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE r.employee_id = ?
        ORDER BY t.date, t.departure
        """,
        (employee_id,),
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


def admin_history_start_date():
    """Début de la fenêtre d'historique direction (2 mois glissants)."""
    return (datetime.now().date() - timedelta(days=62)).isoformat()


@app.route("/api/admin/clients")
def admin_clients():
    denied = require_direction_access()
    if denied:
        return denied

    conn = get_db()
    today = datetime.now().date().isoformat()
    history_start = admin_history_start_date()

    total_clients = conn.execute(
        "SELECT COUNT(*) FROM accounts WHERE role = 'client'"
    ).fetchone()[0]

    client_rows = conn.execute(
        """
        SELECT
            a.id AS account_id,
            a.username,
            a.display_name,
            e.id AS employee_id,
            e.matricule,
            e.name,
            e.department,
            e.email,
            (
                SELECT COUNT(*) FROM reservations r WHERE r.employee_id = e.id
            ) AS total_reservations,
            (
                SELECT COUNT(*)
                FROM reservations r
                JOIN trips t ON t.id = r.trip_id
                WHERE r.employee_id = e.id AND t.date >= ?
            ) AS reservations_2m,
            (
                SELECT COALESCE(SUM(r.amount), 0)
                FROM reservations r
                JOIN trips t ON t.id = r.trip_id
                WHERE r.employee_id = e.id AND t.date >= ?
                  AND r.payment_status IN ('paid', 'charged_to_company')
            ) AS spent_2m,
            (
                SELECT MAX(t.date)
                FROM reservations r
                JOIN trips t ON t.id = r.trip_id
                WHERE r.employee_id = e.id
            ) AS last_trip_date,
            (
                SELECT s.plan
                FROM subscriptions s
                WHERE s.employee_id = e.id
                  AND s.status = 'active'
                  AND s.end_date >= ?
                ORDER BY s.end_date DESC
                LIMIT 1
            ) AS active_plan
        FROM accounts a
        JOIN employees e ON e.id = a.employee_id
        WHERE a.role = 'client'
        ORDER BY e.name COLLATE NOCASE
        """,
        (history_start, history_start, today),
    ).fetchall()

    wallet_rows = conn.execute(
        """
        SELECT employee_id, method, phone, label, is_default
        FROM payment_wallets
        ORDER BY is_default DESC, method
        """
    ).fetchall()
    wallets_by_employee = {}
    for row in wallet_rows:
        wallets_by_employee.setdefault(row["employee_id"], []).append(
            {
                "method": row["method"],
                "phone": row["phone"],
                "label": row["label"],
                "is_default": bool(row["is_default"]),
            }
        )

    history = conn.execute(
        """
        SELECT
            r.id, r.seat_number, r.amount, r.payment_method, r.payment_status,
            r.payment_ref, r.pickup_stop, r.dropoff_stop, r.payment_phone, r.created_at,
            e.id AS employee_id, e.matricule, e.name AS employee_name, e.email,
            a.username, a.display_name,
            t.route, t.date, t.departure, t.arrival, t.driver,
            v.name AS vehicle_name, v.plate, v.type AS vehicle_type
        FROM reservations r
        JOIN employees e ON e.id = r.employee_id
        JOIN accounts a ON a.employee_id = e.id AND a.role = 'client'
        JOIN trips t ON t.id = r.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        WHERE t.date >= ?
        ORDER BY t.date DESC, t.departure DESC, e.name COLLATE NOCASE
        """,
        (history_start,),
    ).fetchall()

    active_clients_2m = conn.execute(
        """
        SELECT COUNT(DISTINCT r.employee_id)
        FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        JOIN accounts a ON a.employee_id = r.employee_id AND a.role = 'client'
        WHERE t.date >= ?
        """,
        (history_start,),
    ).fetchone()[0]

    total_reservations_2m = conn.execute(
        """
        SELECT COUNT(*)
        FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        JOIN accounts a ON a.employee_id = r.employee_id AND a.role = 'client'
        WHERE t.date >= ?
        """,
        (history_start,),
    ).fetchone()[0]

    conn.close()

    clients = []
    for row in client_rows:
        item = dict(row)
        item["payment_wallets"] = wallets_by_employee.get(item["employee_id"], [])
        item["active_plan"] = item["active_plan"] or None
        clients.append(item)

    return jsonify(
        {
            "total_clients": total_clients,
            "active_clients_2m": active_clients_2m,
            "total_reservations_2m": total_reservations_2m,
            "history_from": history_start,
            "history_to": today,
            "clients": clients,
            "history": [dict(h) for h in history],
        }
    )


@app.route("/api/admin/overview")
def admin_overview():
    denied = require_direction_access()
    if denied:
        return denied
    conn = get_db()
    today = datetime.now().date().isoformat()

    today_trips = conn.execute("SELECT COUNT(*) FROM trips WHERE date = ?", (today,)).fetchone()[0]
    today_reservations = conn.execute(
        """
        SELECT COUNT(*) FROM reservations r
        JOIN trips t ON t.id = r.trip_id WHERE t.date = ?
        """,
        (today,),
    ).fetchone()[0]
    total_capacity = conn.execute(
        """
        SELECT COALESCE(SUM(v.capacity), 0) FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id WHERE t.date = ?
        """,
        (today,),
    ).fetchone()[0]
    total_revenue = conn.execute(
        """
        SELECT COALESCE(SUM(r.amount), 0) FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        WHERE t.date = ? AND r.payment_status IN ('paid', 'charged_to_company')
        """,
        (today,),
    ).fetchone()[0]
    vehicles = conn.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
    employees = conn.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    total_clients = conn.execute(
        "SELECT COUNT(*) FROM accounts WHERE role = 'client'"
    ).fetchone()[0]
    occupancy = round((today_reservations / total_capacity) * 100, 1) if total_capacity else 0

    fleet = conn.execute(
        "SELECT id, name, plate, capacity, type, latitude, longitude, status, driver_assigned FROM vehicles ORDER BY name"
    ).fetchall()

    trips = conn.execute(
        """
        SELECT
            t.id, t.route, t.departure, t.arrival, t.date, t.driver, t.price, t.status, t.completed_at,
            v.name AS vehicle_name, v.plate, v.capacity, v.type AS vehicle_type, t.vehicle_id,
            COUNT(r.id) AS reserved_count
        FROM trips t
        JOIN vehicles v ON v.id = t.vehicle_id
        LEFT JOIN reservations r ON r.trip_id = t.id
        GROUP BY t.id
        ORDER BY t.date, t.departure
        """
    ).fetchall()

    completed_count = sum(1 for t in trips if t["status"] == "completed")
    remaining_count = sum(1 for t in trips if t["status"] != "completed")

    reservations = conn.execute(
        """
        SELECT
            r.id, r.seat_number, r.amount, r.payment_method, r.payment_status, r.payment_ref,
            r.pickup_stop, r.dropoff_stop, r.payment_phone,
            e.name AS employee_name, e.department, e.matricule,
            t.route, t.date, t.departure, t.driver, t.vehicle_id,
            v.name AS vehicle_name, v.plate
        FROM reservations r
        JOIN employees e ON e.id = r.employee_id
        JOIN trips t ON t.id = r.trip_id
        JOIN vehicles v ON v.id = t.vehicle_id
        ORDER BY t.date DESC, t.departure
        LIMIT 50
        """
    ).fetchall()

    today_by_vehicle = conn.execute(
        """
        SELECT v.id, v.name, v.plate, COUNT(r.id) AS clients_today
        FROM vehicles v
        LEFT JOIN trips t ON t.vehicle_id = v.id AND t.date = ?
        LEFT JOIN reservations r ON r.trip_id = t.id
        GROUP BY v.id
        ORDER BY clients_today DESC
        """,
        (today,),
    ).fetchall()

    drivers = conn.execute(
        """
        SELECT driver, COUNT(*) AS trips_count,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
        FROM trips GROUP BY driver ORDER BY trips_count DESC
        """
    ).fetchall()

    subscriptions_count = conn.execute(
        "SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND end_date >= ?",
        (today,),
    ).fetchone()[0]

    conn.close()

    trip_list = []
    for row in trips:
        item = dict(row)
        item["available_seats"] = item["capacity"] - item["reserved_count"]
        trip_list.append(item)

    return jsonify(
        {
            "today_trips": today_trips,
            "today_reservations": today_reservations,
            "total_revenue": total_revenue,
            "vehicles": vehicles,
            "fleet_count": vehicles,
            "employees": employees,
            "total_clients": total_clients,
            "trip_days": TRIP_DAYS,
            "occupancy_rate": occupancy,
            "trips_completed_count": completed_count,
            "trips_remaining_count": remaining_count,
            "fleet": [dict(v) for v in fleet],
            "trips": trip_list,
            "completed_trips": [dict(t) for t in trips if t["status"] == "completed"],
            "remaining_trips": [dict(t) for t in trips if t["status"] != "completed"],
            "reservations": [dict(r) for r in reservations],
            "clients_by_vehicle_today": [dict(v) for v in today_by_vehicle],
            "drivers_stats": [dict(d) for d in drivers],
            "active_subscriptions": subscriptions_count,
        }
    )


@app.route("/api/admin/vehicles", methods=["GET", "POST"])
def admin_vehicles():
    denied = require_direction_access()
    if denied:
        return denied

    conn = get_db()
    if request.method == "GET":
        rows = conn.execute(
            """
            SELECT v.*, COUNT(DISTINCT t.id) AS trips_total,
                   SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS on_trip
            FROM vehicles v
            LEFT JOIN trips t ON t.vehicle_id = v.id
            GROUP BY v.id ORDER BY v.name
            """
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    plate = (data.get("plate") or "").strip().upper()
    capacity = data.get("capacity")
    vtype = (data.get("type") or "minibus").strip()
    driver_assigned = (data.get("driver_assigned") or "").strip()

    if not all([name, plate, capacity]):
        conn.close()
        return jsonify({"error": "Nom, immatriculation et capacité requis"}), 400

    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO vehicles (name, plate, capacity, type, status, driver_assigned)
            VALUES (?, ?, ?, ?, 'available', ?)
            """,
            (name, plate, int(capacity), vtype, driver_assigned or None),
        )
        conn.commit()
        vehicle_id = cur.lastrowid
        seed_vehicle_positions(conn)
        conn.commit()
        vehicle = conn.execute("SELECT * FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
        conn.close()
        return jsonify(dict(vehicle)), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Immatriculation déjà utilisée"}), 409


@app.route("/api/admin/vehicles/<int:vehicle_id>", methods=["PATCH", "DELETE"])
def admin_vehicle_detail(vehicle_id):
    denied = require_direction_access()
    if denied:
        return denied

    conn = get_db()
    vehicle = conn.execute("SELECT id FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
    if not vehicle:
        conn.close()
        return jsonify({"error": "Véhicule introuvable"}), 404

    if request.method == "DELETE":
        active = conn.execute(
            "SELECT id FROM trips WHERE vehicle_id = ? AND status != 'completed' LIMIT 1",
            (vehicle_id,),
        ).fetchone()
        if active:
            conn.close()
            return jsonify({"error": "Impossible de supprimer un véhicule en service"}), 409
        conn.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Véhicule supprimé"})

    data = request.get_json(silent=True) or {}
    fields = []
    values = []
    for key in ("name", "plate", "capacity", "type", "status", "driver_assigned"):
        if key in data and data[key] is not None:
            val = data[key]
            if key == "plate":
                val = str(val).strip().upper()
            if key == "capacity":
                val = int(val)
            fields.append(f"{key} = ?")
            values.append(val)

    if not fields:
        conn.close()
        return jsonify({"error": "Aucune modification"}), 400

    values.append(vehicle_id)
    conn.execute(f"UPDATE vehicles SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()
    updated = conn.execute("SELECT * FROM vehicles WHERE id = ?", (vehicle_id,)).fetchone()
    conn.close()
    return jsonify(dict(updated))


@app.route("/api/stats")
def stats():
    conn = get_db()
    today = datetime.now().date().isoformat()
    today_trips = conn.execute("SELECT COUNT(*) FROM trips WHERE date = ?", (today,)).fetchone()[0]
    today_reservations = conn.execute(
        """
        SELECT COUNT(*) FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        WHERE t.date = ?
        """,
        (today,),
    ).fetchone()[0]
    vehicles = conn.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0]
    employees = conn.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    total_revenue = conn.execute(
        """
        SELECT COALESCE(SUM(r.amount), 0) FROM reservations r
        JOIN trips t ON t.id = r.trip_id
        WHERE t.date = ? AND r.payment_status IN ('paid', 'charged_to_company')
        """,
        (today,),
    ).fetchone()[0]
    conn.close()
    return jsonify(
        {
            "today_trips": today_trips,
            "today_reservations": today_reservations,
            "vehicles": vehicles,
            "employees": employees,
            "trip_days": TRIP_DAYS,
            "total_revenue": total_revenue,
        }
    )


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def run_server():
    ensure_db()
    host = os.environ.get("CITI_HOST", "0.0.0.0")
    port = int(os.environ.get("CITI_PORT", "5000"))
    debug = os.environ.get("CITI_DEBUG", "0").lower() in ("1", "true", "yes")
    server_mode = os.environ.get("CITI_SERVER", "auto").lower()

    print("=" * 52)
    print("  CTI Transport Abidjan — serveur démarré")
    print(f"  Sur cet appareil : http://127.0.0.1:{port}")
    lan = local_ip()
    if host == "0.0.0.0" and lan:
        print(f"  Sur le réseau    : http://{lan}:{port}")
    print("=" * 52)

    if server_mode == "waitress" or (server_mode == "auto" and not debug):
        try:
            from waitress import serve

            serve(app, host=host, port=port, threads=4)
            return
        except ImportError:
            print("[CITI] Installez waitress : pip install waitress")

    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    run_server()
