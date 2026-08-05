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

### Option 2 — Render.com (permanent, recommandé)

1. Cliquez ici : **[Deploy to Render](https://render.com/deploy?repo=https://github.com/Axe-l-atif/CITI-transport/tree/cti-abidjan)**
2. Connectez-vous avec **GitHub** (compte `Axe-l-atif`)
3. Validez le déploiement du Blueprint (`render.yaml`)
4. Attendez 2–3 minutes — votre URL sera du type `https://cti-transport-abidjan.onrender.com`

Code source : [branche `cti-abidjan`](https://github.com/Axe-l-atif/CITI-transport/tree/cti-abidjan)

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| Client | Créer via « Créer mon accès » | votre code |
| Chauffeur | CH-001 | 5678 |
| Directeur | admin | cti2026 |

Code direction (interface directeur) : **2250**

## Lignes Abidjan

Plateau ↔ Yopougon · Plateau ↔ Cocody · Marcory ↔ Koumassi · Cocody ↔ Bingerville · Adjamé ↔ Plateau
