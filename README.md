# ANPDP Registre des Traitements — Web App

## Structure des fichiers
```
anpdp_app/
├── app.py                  ← Backend Flask (serveur)
├── requirements.txt        ← Dépendances Python
├── Procfile               ← Pour Railway/Render
├── generate_excel.py      ← Générateur Excel (copiez depuis votre dossier local)
├── anpdp_server.py        ← Serveur injection ANPDP (optionnel en prod)
└── templates/
    ├── login.html         ← Page de connexion
    ├── hub.html           ← Dashboard sociétés
    ├── company.html       ← Page d'une société
    └── traitement.html    ← Formulaire traitement
```

---

## 🚀 Déploiement sur Railway (recommandé — gratuit)

### Étape 1 — Préparer les fichiers
1. Copiez `generate_excel.py` dans ce dossier (depuis votre dossier local)
2. Zippez tout le dossier `anpdp_app/`

### Étape 2 — Créer un compte Railway
1. Allez sur **railway.app**
2. Connectez-vous avec GitHub (créez un compte GitHub gratuit si besoin)

### Étape 3 — Déployer
1. Sur Railway → cliquez **"New Project"**
2. Choisissez **"Deploy from GitHub repo"** ou **"Empty project"**
3. Si "Empty project" → cliquez **"Add a service"** → **"GitHub Repo"**
4. Uploadez votre dossier ou connectez votre repo GitHub

### Étape 4 — Variables d'environnement (IMPORTANT)
Dans Railway → votre service → onglet **"Variables"**, ajoutez :

| Variable       | Valeur                          |
|---------------|---------------------------------|
| `PASSWORD`    | Votre mot de passe (ex: MonPass2024) |
| `SECRET_KEY`  | Une chaîne aléatoire longue (ex: abc123xyz789...) |
| `PORT`        | 8080                            |

### Étape 5 — Accéder à votre app
Railway vous donne une URL du type :
`https://anpdp-production-xxxx.up.railway.app`

Partagez cette URL avec votre équipe + le mot de passe → c'est tout !

---

## 💻 Utilisation locale (test avant déploiement)

```bash
# 1. Installer les dépendances
pip install -r requirements.txt

# 2. Lancer l'app
python app.py

# 3. Ouvrir dans le navigateur
# http://localhost:5000
# Mot de passe par défaut: anpdp2024
```

---

## 📋 Fonctionnalités

### Hub des sociétés
- Créer / modifier / supprimer une société (nom + NIT)
- Voir le nombre de traitements et leur statut en un coup d'œil

### Gestion des traitements
- Créer autant de traitements que nécessaire par société
- **Statuts** : 📝 Brouillon → ✅ Prêt → 🚀 Soumis
- **Sauvegarde automatique** toutes les 60 secondes
- **Sauvegarde manuelle** bouton "💾 Sauvegarder"
- Les données sont rechargées automatiquement à chaque ouverture

### Export Excel
- Bouton **"📊 Export Excel complet"** sur la page société
- Génère un `.xlsx` avec **un onglet par traitement**
- Même style que votre fichier original (en-têtes verts, sections, etc.)

### Injection ANPDP
- Toujours disponible depuis chaque formulaire traitement
- Nécessite le serveur local `anpdp_server.py` + vos cookies

---

## 🔧 Changer le mot de passe

### En local
Modifiez dans `app.py` :
```python
APP_PASSWORD = os.environ.get('PASSWORD', 'VOTRE_NOUVEAU_MOT_DE_PASSE')
```

### En production (Railway)
Modifiez la variable d'environnement `PASSWORD` dans Railway → Variables.
L'app redémarre automatiquement.

---

## 💾 Sauvegarde des données

Les données sont stockées dans **SQLite** (fichier `anpdp.db`).

### Sur Railway (production)
Railway réinitialise le disque à chaque déploiement.
**Solution** : Railway offre un volume persistant (gratuit) — activez-le dans
Settings → Volumes → montez sur `/app` ou configurez `DATABASE_URL`.

Ou exportez régulièrement l'Excel par société avant de supprimer.

---

## ❓ Problèmes courants

**"Module not found: flask"**
```bash
pip install -r requirements.txt
```

**L'app démarre mais la page est blanche**
Vérifiez que `generate_excel.py` est bien dans le même dossier que `app.py`.

**Erreur 500 sur l'export Excel**
```bash
pip install openpyxl
```
