"""Intégration Wave & Orange Money — CTI Transport Abidjan."""

import hashlib
import hmac
import json
import os
import secrets
import urllib.error
import urllib.request
from datetime import datetime

WAVE_API_BASE = "https://api.wave.com/v1"


def normalize_phone(phone):
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if digits.startswith("225"):
        digits = digits[3:]
    return digits


def format_phone_display(phone):
    d = normalize_phone(phone)
    if len(d) == 10:
        return f"{d[:2]} {d[2:4]} {d[4:6]} {d[6:8]} {d[8:10]}"
    return phone or ""


def payment_mode():
    if os.environ.get("WAVE_API_KEY", "").strip():
        return "live"
    return os.environ.get("CTI_PAYMENT_MODE", "demo").lower()


def merchant_config():
    return {
        "mode": payment_mode(),
        "wave_merchant_phone": os.environ.get("CTI_WAVE_MERCHANT_PHONE", "07 07 00 00 00"),
        "orange_merchant_phone": os.environ.get("CTI_ORANGE_MERCHANT_PHONE", "07 08 00 00 00"),
        "currency": "XOF",
        "wave_checkout_enabled": bool(os.environ.get("WAVE_API_KEY", "").strip()),
    }


def new_payment_ref(prefix="CTI"):
    return f"{prefix}-{secrets.token_hex(4).upper()}"


def wave_checkout_session(amount, client_reference, success_url, error_url, payer_mobile=None):
    api_key = os.environ.get("WAVE_API_KEY", "").strip()
    if not api_key:
        return None, "Wave API non configurée"

    payload = {
        "amount": str(int(amount)),
        "currency": "XOF",
        "client_reference": client_reference,
        "success_url": success_url,
        "error_url": error_url,
    }
    if payer_mobile:
        payload["restrict_payer_mobile"] = normalize_phone(payer_mobile)

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{WAVE_API_BASE}/checkout/sessions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data, None
    except urllib.error.HTTPError as exc:
        try:
            err = json.loads(exc.read().decode("utf-8"))
            msg = err.get("message") or err.get("error") or str(err)
        except Exception:
            msg = exc.reason or "Erreur Wave API"
        return None, msg
    except Exception as exc:
        return None, str(exc)


def verify_wave_webhook_signature(payload_bytes, signature_header, secret):
    if not secret or not signature_header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(",") if "=" in p)
        timestamp = parts.get("t", "")
        signature = parts.get("v1", "")
        signed = f"{timestamp}.{payload_bytes.decode('utf-8')}".encode("utf-8")
        expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def demo_payment_instructions(method, amount, payment_ref, payer_phone):
    cfg = merchant_config()
    amount_fmt = f"{int(amount):,}".replace(",", " ") + " FCFA"
    payer = format_phone_display(payer_phone)

    if method == "wave":
        return {
            "title": "Payer avec Wave",
            "steps": [
                f"Ouvrez l'application Wave sur le téléphone {payer}",
                f"Transférez {amount_fmt} au numéro CTI : {cfg['wave_merchant_phone']}",
                f"Indiquez la référence : {payment_ref}",
                "Revenez ici et confirmez le paiement",
            ],
            "merchant_phone": cfg["wave_merchant_phone"],
            "reference": payment_ref,
            "amount": amount,
        }

    return {
        "title": "Payer avec Orange Money",
        "steps": [
            f"Composez *144*21*{normalize_phone(cfg['orange_merchant_phone'])}*{int(amount)}#",
            f"Ou transférez {amount_fmt} au {cfg['orange_merchant_phone']} (Orange Money)",
            f"Référence obligatoire : {payment_ref}",
            "Revenez ici et confirmez le paiement",
        ],
        "merchant_phone": cfg["orange_merchant_phone"],
        "ussd": f"*144*21*{normalize_phone(cfg['orange_merchant_phone'])}*{int(amount)}#",
        "reference": payment_ref,
        "amount": amount,
    }


def enrich_payment_methods(base_methods):
    cfg = merchant_config()
    enriched = []
    for key, meta in base_methods.items():
        item = {"id": key, **meta}
        if key == "wave":
            item["merchant_phone"] = cfg["wave_merchant_phone"]
            item["checkout_enabled"] = cfg["wave_checkout_enabled"]
            item["description"] = (
                "Paiement sécurisé via l'app Wave"
                if cfg["wave_checkout_enabled"]
                else f"Transfert Wave vers {cfg['wave_merchant_phone']}"
            )
        elif key == "orange_money":
            item["merchant_phone"] = cfg["orange_merchant_phone"]
            item["checkout_enabled"] = False
            item["description"] = f"Transfert Orange Money vers {cfg['orange_merchant_phone']}"
        enriched.append(item)
    return enriched
