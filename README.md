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

### Option 2 — Render.com (lien fixe permanent, recommandé)

**URL fixe à partager (WhatsApp, réseaux sociaux) :**

**https://citi-transport.onrender.com**

> Sur le plan gratuit, le site peut mettre ~30–60 s à répondre après une période d’inactivité (réveil automatique).

1. Connectez-vous sur [Render](https://dashboard.render.com) avec GitHub (`Axe-l-atif`)
2. Vérifiez que le service **citi-transport** est lié au repo `CITI-transport`, branche **main**
3. Chaque push sur `main` redéploie automatiquement le site

Code source : [GitHub — CITI-transport](https://github.com/Axe-l-atif/CITI-transport)

## Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| Client | Créer via « Créer mon accès » | votre code |
| Chauffeur | CH-001 | 5678 |
| Directeur | admin | cti2026 |

Code direction (interface directeur) : **2250**

## Lignes Abidjan

Plateau ↔ Yopougon · Plateau ↔ Cocody · Marcory ↔ Koumassi · Cocody ↔ Bingerville · Adjamé ↔ Plateau
