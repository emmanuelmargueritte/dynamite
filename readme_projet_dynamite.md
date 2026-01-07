# 🧨 Dynamite — Mini plateforme e‑commerce (Stripe)

## 📌 État du projet

**Statut : FIGÉ — Stable, fonctionnel, prêt pour audit** ✅

Dynamite est une mini‑plateforme e‑commerce développée avec Node.js, Express et Stripe. Le projet couvre l’intégralité du **tunnel d’achat réel** :
- boutique produits
- panier multi‑produits (session serveur)
- paiement Stripe Checkout (mode test)
- webhook Stripe fiable
- persistance des commandes
- page de confirmation complète

Le socle est considéré **fiable**. Les prochaines évolutions sont volontaires et hors scope du cœur.

---

## 🧠 Objectifs du projet

- Construire un **vrai tunnel e‑commerce**, pas un prototype
- Utiliser Stripe selon les **bonnes pratiques** (price_id, webhooks)
- Séparer clairement front / back / logique métier
- Avoir une architecture lisible, maintenable et sécurisée

---

## 🧱 Architecture générale

```
Dynamite/
├─ backend/
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ routes/
│  │  │  ├─ cart.routes.js
│  │  │  ├─ checkout.routes.js
│  │  │  ├─ checkout.cart.routes.js
│  │  │  ├─ orders.routes.js
│  │  │  ├─ admin.*.routes.js
│  │  │  └─ webhooks.routes.js
│  │  ├─ webhooks/
│  │  │  └─ stripeWebhookHandler.js
│  │  ├─ middlewares/
│  │  ├─ utils/
│  │  └─ config/
│  └─ .env
│
├─ frontend/
│  ├─ index.html
│  ├─ shop.html
│  ├─ cart.html
│  ├─ success.html
│  └─ js/
│     ├─ shop.js
│     ├─ cart.js
│     ├─ success.js
│     └─ api.js
│
└─ README.md
```

---

## 🛒 Fonctionnalités principales

### Boutique
- Chargement des produits depuis PostgreSQL
- Affichage dynamique
- Ajout au panier sans rechargement

### Panier
- Panier **multi‑produits**
- Stocké en **session serveur** (pas localStorage)
- Modification des quantités
- Suppression d’articles
- Total recalculé côté backend

### Paiement Stripe
- Stripe Checkout (mode **TEST**)
- Paiement multi‑produits via `price_id + quantity`
- Aucune logique de prix côté front

### Webhook Stripe
- Réception sécurisée (signature Stripe)
- Traitement `checkout.session.completed`
- Création des commandes **après paiement**
- 1 ligne `orders` par produit

### Confirmation de commande
- Attente asynchrone du webhook (retry)
- Affichage détaillé :
  - produit
  - quantité
  - prix unitaire
  - sous‑total
  - total global
- Vidage du panier après succès

---

## 🗄️ Base de données (PostgreSQL)

### Table `products`

| champ | type | description |
|-----|-----|-------------|
| id | UUID | identifiant produit |
| name | TEXT | nom |
| description | TEXT | description |
| price_xpf | INTEGER | prix unitaire |
| stripe_price_id | TEXT | lien Stripe |
| active | BOOLEAN | produit actif |

### Table `orders`

| champ | type | description |
|------|------|-------------|
| id | UUID | id commande |
| product_id | UUID | produit |
| quantity | INTEGER | quantité |
| amount_xpf | INTEGER | sous‑total |
| status | TEXT | paid / pending |
| stripe_session_id | TEXT | session Stripe |
| stripe_payment_intent_id | TEXT | payment intent |

---

## 🔐 Sécurité & choix techniques

- Sessions serveur (cookies HTTP‑only)
- Pas de calcul de prix côté client
- Stripe Checkout (pas d’API custom paiement)
- Webhook = source de vérité
- CSRF prévu côté admin
- Pas de dépendance Stripe côté front

---

## ▶️ Lancer le projet en local

### Prérequis
- Node.js
- PostgreSQL
- Stripe CLI

### Installation

```bash
npm install
```

### Variables d’environnement

```env
PORT=3000
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
```

### Lancer le serveur

```bash
npm run dev
```

### Lancer Stripe CLI

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 🔜 Évolutions possibles (hors scope actuel)

- Emails transactionnels
- Passage Stripe LIVE
- Déploiement (Render / autre)
- Back‑office admin avancé
- Gestion stock

---

## 🏁 Conclusion

Ce projet constitue un **socle e‑commerce solide**, pensé comme une vraie application et non un exercice.

Le tunnel d’achat est **complet, cohérent et fiable**.

> Le projet est volontairement figé à ce stade.

---

✍️ Développé dans une logique pédagogique, pragmatique et orientée produit.

