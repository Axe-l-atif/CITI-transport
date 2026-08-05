# CTI Transport Abidjan

Plateforme de réservation de places pour les trajets à travers Abidjan, inspirée du projet **CITI Transport**.

## Fonctionnalités

- **Client** : choix d'arrêt, heure, véhicule, siège, paiement Wave / Orange Money, abonnement
- **Chauffeur** : planning, embarquement, démarrage / clôture des trajets
- **Directeur** : vue d'ensemble, flotte live, gestion véhicules, stats clients par jour / véhicule, chauffeurs

## Démarrage local

```bash
pip install -r requirements.txt
python app.py
```

Ouvrir : http://127.0.0.1:5000

## Accès public (lien partageable)

### Option 1 — Tunnel Cloudflare (rapide)

Double-cliquer sur `start-public.bat` puis copier l'URL `https://....trycloudflare.com`.

### Option 2 — Render.com (permanent)

1. Pousser ce dossier sur GitHub
2. Créer un compte sur [render.com](https://render.com)
3. New → Blueprint → connecter le dépôt (`render.yaml` inclus)
4. Le site sera accessible via `https://cti-transport-abidjan.onrender.com` (ou l'URL Render assignée)

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| Client | Créer via « Créer mon accès » | votre code |
| Chauffeur | CH-001 | 5678 |
| Directeur | admin | cti2026 |

Code direction (interface directeur) : **2250**

## Lignes Abidjan

Plateau ↔ Yopougon · Plateau ↔ Cocody · Marcory ↔ Koumassi · Cocody ↔ Bingerville · Adjamé ↔ Plateau
