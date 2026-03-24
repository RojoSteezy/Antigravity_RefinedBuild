"""
anpdp_server.py
================
Unified local server for the ANPDP Registre tool.
Handles:
  POST /generate_excel  → returns styled .xlsx file
  POST /send_to_anpdp   → injects data into portail.anpdp.dz using cookies
  POST /check           → ping/health check

Usage:
  pip install requests beautifulsoup4 openpyxl
  python3 anpdp_server.py
Then open anpdp_registre_tool.html in your browser.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os, sys, tempfile, subprocess, traceback
from datetime import date

PORT = 5757

# ─── ANPDP injection (SendData.py logic) ──────────────────────────────────────
try:
    import requests
    from bs4 import BeautifulSoup
    REQUESTS_OK = True
except ImportError:
    REQUESTS_OK = False

HEADERS_BASE = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.58 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://portail.anpdp.dz",
    "Referer": "https://portail.anpdp.dz/declaration_traitement/index.php?page=aj_tr"
}

BASE = "https://portail.anpdp.dz/declaration_traitement"

def log(logs, msg):
    print(msg)
    logs.append(msg)

def post(url, cookies, data=None, files=None, logs=None):
    r = requests.post(url, headers=HEADERS_BASE, cookies=cookies,
                      data=data, files=files, timeout=30)
    if logs is not None:
        log(logs, f"  → {r.status_code} {url.split('/')[-1]}")
    return r


def ajouter_traitement(data, cookies, logs):
    url = f"{BASE}/action/traitement.php"
    info = data["1. Informations sur le traitement"][0]

    # Determine type list
    types = info.get("Type de traitement", "").split(", ") if info.get("Type de traitement") else ["Manuel", "Automatique"]

    base_payload = {
        "denom_traitement":    info.get("Dénomination du traitement", ""),
        "denom_traitement_ar": info.get("Dénomination du traitement (AR)", ""),
        "type_trait[]":        types,
        "date_traitement":     info.get("Date de mise en œuvre du traitement", ""),
        "but_traitement":      info.get("Finalité (but) du traitement ", "") or info.get("Finalité (but) du traitement", ""),
        "but_traitement_ar":   info.get("Finalité (but) du traitement (AR)", ""),
        "cadre_traitement":    info.get("Cadre légal du traitement", ""),
        "cadre_traitement_ar": info.get("Cadre légal du traitement (AR)", ""),
        "check_autrecat":      info.get("Catégories des traitements ", "") or info.get("Catégories des traitements", ""),
        "autre_cat":           info.get("Précisez les autres catégories", ""),
        "ext_trait":           info.get("Existence de sous traitements", "Non"),
        "nom_prenom_contact_ar": "",
        "nom_prenom_contact": "",
        "qualite": "",
        "qualite_ar": "",
        "NIN": ""
    }

    log(logs, "1️⃣  Traitement — brouillon...")
    r = post(url, cookies, data={**base_payload, "action": "brouillon_traitement",
                                  "id_traitement": "premiere insertion",
                                  "id_contact": "premiere insertion"}, logs=logs)
    try:
        rj = r.json()
        id_traitement = rj["id_traitement"]
        id_contact    = rj["id_contact"]
    except Exception:
        raise RuntimeError(f"Réponse inattendue (brouillon_traitement): {r.text[:300]}")

    log(logs, f"   id_traitement={id_traitement}  id_contact={id_contact}")

    # traitement_final with premiere insertion (duplicate step from original script)
    post(url, cookies, data={**base_payload, "action": "traitement_final",
                              "id_traitement": "premiere insertion",
                              "id_contact": "premiere insertion"}, logs=logs)

    log(logs, "   traitement_final (real IDs)...")
    post(url, cookies, data={**base_payload, "action": "traitement_final",
                              "id_traitement": id_traitement,
                              "id_contact": id_contact}, logs=logs)

    log(logs, f"✅ Traitement créé (id={id_traitement})")
    return id_traitement, id_contact


def ajouter_sous_traitement(id_traitement, st_data, cookies, logs):
    url = f"{BASE}/action/sous_traitement.php?nit={id_traitement}"
    types = st_data.get("Type du sous traitement", "").split(", ") if st_data.get("Type du sous traitement") else []

    payload = {
        "id_traitement":    id_traitement,
        "id_straitement":   "",
        "id_soustraitement": "",
        "denom_straitement":    st_data.get("Dénomination du sous traitement", ""),
        "denom_straitement_ar": st_data.get("Dénomination du sous traitement (AR)", ""),
        "type_strait[]":        types,
        "obj_straitement_ar":   st_data.get("Objectifs", ""),
        "ext_strait":           st_data.get("Sous traité", "Non"),
        "nom_straitement_ar":   "",
        "observation_ar":       st_data.get("Observations", "")
    }
    r = post(url, cookies, data=payload, logs=logs)
    try:
        id_soustraitement = r.json()["id_soustraitement"]
        log(logs, f"   sous-traitement id={id_soustraitement}")
        return id_soustraitement
    except Exception:
        raise RuntimeError(f"Réponse inattendue (sous_traitement): {r.text[:300]}")


def ajouter_straitant(id_traitement, id_soustraitement, st_data, cookies, logs):
    # Step 1: link sous-traitant slot
    post(f"{BASE}/action/traitement.php", cookies, data={
        "action": "ajouter_straitant",
        "id_soustraitement": id_soustraitement,
        "id_traitement": id_traitement
    }, logs=logs)

    # Step 2: fill sous-traitant details
    payload = {
        "action":          "straitant_soustraitement_final",
        "id_straitement":  id_soustraitement,
        "id_traitement":   id_traitement,
        "type_pers1":      st_data.get("Type de personne", "Morale"),
        "nomrs_fr1":       st_data.get("Nom/Raison sociale", ""),
        "nomrs_ar1":       st_data.get("Nom/Raison sociale (AR)", ""),
        "prenom_siglefr1": st_data.get("Prénom/Sigle", ""),
        "prenom_siglear1": st_data.get("Prénom/Sigle (AR)", ""),
        "adresse_str_fr1": st_data.get("Adresse", ""),
        "adresse_str_ar1": st_data.get("Adresse (AR)", ""),
        "pays_fr1":        st_data.get("Pays", ""),
        "pays_ar1":        st_data.get("Pays (AR)", ""),
        "ville_fr1":       st_data.get("Ville", ""),
        "ville_ar1":       st_data.get("Ville (AR)", ""),
        "tel_strt1":       st_data.get("N° Tél", ""),
        "fax_strt1":       st_data.get("N° Fax", ""),
        "domaine_activite_fr1": st_data.get("Domaine d'activité", ""),
        "domaine_activite_ar1": st_data.get("Domaine d'activité (AR)", ""),
        "site_strt1":      st_data.get("Site web", ""),
        "ext_contrat1":    st_data.get("Existence d'un contrat signé avec le sous traitant", "Oui")
    }
    post(f"{BASE}/action/sous_traitant.php", cookies, data=payload, logs=logs)
    log(logs, f"   sous-traitant enregistré")


def ajouter_collect(id_traitement, id_contact, s, cookies, logs):
    url = f"{BASE}/action/collect.php"
    log(logs, "3️⃣  Données collectées...")

    payload_brouillon = {
        "action":       "brouillon_collect",
        "id_traitement": id_traitement,
        "id_collect":   "0",
        "id_src":       "",
        "type_collect": s.get("Type de collecte de données", ""),
        "mode_collect": s.get("Mode de collecte", ""),
        "trac_collect":        s.get("trac_collect", 0),
        "signelect_collect":   s.get("signelect_collect", 0),
        "chiffr_collect":      s.get("chiffr_collect", 0),
        "charte_collect":      s.get("charte_collect", 0),
        "cat_salaries_collect":    s.get("cat_salaries_collect", 0),
        "cat_usages_collect":      s.get("cat_usages_collect", 0),
        "cat_patients_collect":    s.get("cat_patients_collect", 0),
        "cat_adherant_collect":    s.get("cat_adherant_collect", 0),
        "cat_fournisseurs_collect": s.get("cat_fournisseurs_collect", 0),
        "cat_etudiant_collect":    s.get("cat_etudiant_collect", 0),
        "cat_client_collect":      s.get("cat_client_collect", 0),
        "cat_autre_collect":       s.get("cat_autre_collect", 0),
        "cat_descautre_collect":   s.get("Autres catégories", ""),
        "existautrecat_collect":   s.get("Existe-il d'autres sources de données utilisées dans la collecte des données ?", "Non"),
        "nombdfm_src":    s.get("Nom (BD) ou (FM)", ""),
        "nomproprio_src": s.get("Nom structure propriétaire", ""),
        "cadrelegal_src": s.get("Cadre légal d'utilisation", ""),
        "objectif_src":   s.get("Objectifs ", "") or s.get("Objectifs", ""),
    }
    post(url, cookies, data=payload_brouillon, logs=logs)

    payload_valider = {**payload_brouillon,
        "action":     "valider_collect",
        "id_collect": id_contact,
    }
    post(url, cookies, data=payload_valider, logs=logs)
    log(logs, "✅ Données collectées enregistrées")


def ajouter_categorie(id_traitement, id_contact, s, cookies, logs):
    # First: get current id_collect from page
    r = requests.get(f"{BASE}/index.php?page=aj_tr&nit={id_traitement}",
                     headers=HEADERS_BASE, cookies=cookies, timeout=30)
    soup = BeautifulSoup(r.text, 'html.parser')
    inp = soup.find('input', {'name': 'id_collect'})
    id_collect = inp['value'] if inp else id_contact

    url = f"{BASE}/action/categorie.php"
    payload = {
        "action":            "save_categorie",
        "id_cat":            "",
        "id_traitement":     id_traitement,
        "id_collect":        id_collect,
        "catperson_cat":     s.get("Catégorie de données", ""),
        "type_cat":          s.get("Type d'informations", ""),
        "type_cat_autre":    s.get("Autres types d'informations recueillis", ""),
        "origine_cat":       s.get("Origine de la donnée", ""),
        "origine_autre_cat": s.get("Autres origines de la source", ""),
        "utilise_finalite_cat": s.get("Est elle utilisée pour la finalité du traitement ?", ""),
        "source_cat":        s.get("Sources de données", ""),
        "source_autre_cat":  s.get("Autres sources", ""),
        "duree_cat":         int(s.get("Durée de conservation de la donnée (mois)", 0) or 0)
    }
    post(url, cookies, data=payload, logs=logs)

    # valider
    r2 = requests.get(f"{BASE}/index.php?page=aj_tr&nit={id_traitement}",
                      headers=HEADERS_BASE, cookies=cookies, timeout=30)
    soup2 = BeautifulSoup(r2.text, 'html.parser')
    inp2 = soup2.find('input', {'name': 'id_collect'})
    id_collect2 = inp2['value'] if inp2 else id_collect

    post(url, cookies, data={
        "action": "valider_categorie", "id_cat": "", "id_traitement": id_traitement,
        "id_collect": id_collect2, "catperson_cat": "", "type_cat": "",
        "type_cat_autre": "", "origine_cat": "", "origine_autre_cat": "",
        "utilise_finalite_cat": "", "source_cat": "", "source_autre_cat": "", "duree_cat": ""
    }, logs=logs)


def ajouter_conservation(id_traitement, data, cookies, logs):
    log(logs, "5️⃣  Conservation...")
    url = f"{BASE}/action/conservation.php"
    conserv = data.get("Comment les données sont conservées ?", "")
    man  = "Manuel"      if "Manuel"      in conserv else ""
    auto = "Informatique" if "Informatique" in conserv else ""

    files = {
        "action":               (None, "save_conservation"),
        "id_traitement":        (None, id_traitement),
        "id_conservation":      (None, ""),
        "modeconserv_conservdata_m": (None, man),
        "modeconserv_conservdata_i": (None, auto),
        "nom_conservdata_i":    (None, data.get("Nom de la base de données", "")),
        "lieu_conservdata_i":   (None, data.get("Lieu de stockage de la base de données", "")),
        "nom_conservdata_m":    (None, data.get("Nom du fichier manuel", "")),
        "lieu_conservdata_m":   (None, data.get("Lieu de stockage du fichier", ""))
    }
    r = post(url, cookies, files=files, logs=logs)

    # get id_conservation from response
    try:
        id_conservation = r.json().get("id_conservation", "")
    except Exception:
        id_conservation = ""

    files_v = {**files, "action": (None, "valider_conservation"),
                "id_conservation": (None, str(id_conservation))}
    post(url, cookies, files=files_v, logs=logs)
    log(logs, "✅ Conservation enregistrée")


def envoyer_securite(id_traitement, s, cookies, logs):
    log(logs, "6️⃣  Sécurité...")
    url = f"{BASE}/action/securite.php"
    payload = {
        "action":      "save_securite",
        "id_traitement": id_traitement,
        "id_securite": "",
        "engagement_securite":    s.get("engagement_securite", "Oui"),
        "signe_securite":         s.get("signe_securite", "Oui"),
        "datacenter_securite":    s.get("datacenter_securite", 0),
        "backup_securite":        s.get("backup_securite", 0),
        "telesurveillance_securite": s.get("telesurveillance_securite", 0),
        "securite_poste_securite":   s.get("securite_poste_securite", 0),
        "politique_sauv_securite":   s.get("politique_sauv_securite", 0),
        "chiffrement_securite":      s.get("chiffrement_securite", 0),
        "tracabilite_securite":      s.get("tracabilite_securite", 0),
        "documentation_securite":    s.get("documentation_securite", 0),
        "securite_acces_securite":   s.get("securite_acces_securite", 0),
        "mesure_securite":           s.get("mesure_securite", 0),
    }
    r_save = post(url, cookies, data=payload, logs=logs)
    try:
        id_securite = r_save.json().get("id_securite", "")
    except Exception:
        id_securite = ""

    post(url, cookies, data={**payload, "action": "valider_securite",
                              "id_securite": str(id_securite)}, logs=logs)
    log(logs, "✅ Sécurité enregistrée")


def ajouter_interconnexion(id_traitement, s, cookies, logs):
    url = f"{BASE}/action/interconnexion.php"
    payload_save = {
        "action":          "save_interconnexion",
        "id_traitement":   id_traitement,
        "id_interconnexion": "",
        "com_personnel_interconnexion": s.get("Est-ce que vous communiquez des données à caractère personnel à des tiers ou avez des interconnexions ?", "Non"),
        "nom_interconnexion":    s.get("Nom de l'organisme destinataire", ""),
        "modec_interconnexion":  s.get("Mode de communication", ""),
        "objectif_interconnexion": s.get("Objectifs", ""),
        "cadrelegal_interconnexion": s.get("Cadre légal", "")
    }
    r = post(url, cookies, data=payload_save, logs=logs)
    try:
        id_interconnexion = r.json().get("interconnexions", {}).get("numseq_interconnexion", "")
    except Exception:
        id_interconnexion = ""

    if id_interconnexion:
        post(url, cookies, data={**payload_save,
            "action": "valider_interconnexion",
            "id_interconnexion": id_interconnexion}, logs=logs)


def ajouter_transfert(id_traitement, s, cookies, logs):
    log(logs, "8️⃣  Transfert étranger...")
    url = f"{BASE}/action/transfert.php"
    val = s.get("Les données traitées sont-elles transférées vers un pays étranger?", "Non")
    r = post(url, cookies, data={
        "action": "save_transfert", "id_traitement": id_traitement,
        "id_transfert": "", "transferer_transfert": val
    }, logs=logs)
    try:
        id_transfert = r.json().get("id_transfert", "")
    except Exception:
        id_transfert = ""
    post(url, cookies, data={
        "action": "valider_transfert", "id_traitement": id_traitement,
        "id_transfert": str(id_transfert), "transferer_transfert": val
    }, logs=logs)
    log(logs, "✅ Transfert enregistré")


def ajouter_consent(id_traitement, s, cookies, logs):
    log(logs, "9️⃣  Consentement...")
    url = f"{BASE}/action/consentement.php"
    payload = {
        "action":        "save_consentement",
        "id_traitement": id_traitement,
        "id_consent":    "",
        "exist_consent": s.get("Consentement des personnes concernées ", "Oui"),
        "methode_consent":    s.get("Méthode de consentement", ""),
        "methode_consent_ar": s.get("Méthode de consentement (AR)", ""),
        "pourquoi_consent":   s.get("Précisez pourquoi y'a pas de consentement des personnes", "")
    }
    r = post(url, cookies, data=payload, logs=logs)
    try:
        id_consent = r.json()["id_consent"]
    except Exception:
        id_consent = ""
    post(url, cookies, data={**payload, "action": "valider_consentement",
                              "id_consent": str(id_consent)}, logs=logs)
    log(logs, "✅ Consentement enregistré")


def ajouter_droit_personne(id_traitement, s, cookies, logs):
    log(logs, "🔟 Droits des personnes (Art.32/34/35/36)...")
    url = f"{BASE}/action/droit_personne.php"
    articles = [
        ("save_droit_personne_com",   "valide_droit_personne_com",   "droit_com"),
        ("save_droit_personne_acces", "valide_droit_personne_acces", "droit_acces"),
        ("save_droit_personne_rectif","valide_droit_personne_rectif","droit_rectif"),
        ("save_droit_personne_reclam","valide_droit_personne_reclam","droit_reclam"),
    ]
    long_key_fr = "le nom du service auprès duquel la personne concernée pourra exercer le droit à l'information/l'accès/  la rectification / l'opposition"
    long_key_ar = long_key_fr + " (AR)"
    mesure_fr   = "Quelles sont les mesures prises pour faciliter l'exercice du droit d'information / d'accès / de rectification / d'opposition"
    mesure_ar   = mesure_fr + " (AR)"

    # s can be a list of rows (one per article) or a single dict
    rows_list = s if isinstance(s, list) else [s] * 4

    for idx, (save_action, valide_action, prefix) in enumerate(articles):
        # Use matching row if available, otherwise fall back to first row
        row = rows_list[idx] if idx < len(rows_list) else (rows_list[0] if rows_list else {})
        payload = {
            "action":        save_action,
            "id_traitement": id_traitement,
            f"{prefix}_comment_fr":    row.get("Comment", ""),
            f"{prefix}_comment_ar":    row.get("Comment (AR)", ""),
            f"{prefix}_precesion_ar":  row.get(long_key_ar, ""),
            f"{prefix}_precesion_fr":  row.get(long_key_fr, ""),
            f"{prefix}_adr_fr":        row.get("Adresse", ""),
            f"{prefix}_adr_ar":        row.get("Adresse (AR)", ""),
            f"{prefix}_tel":           row.get("Mobile", ""),
            f"{prefix}_fax":           row.get("Fax", ""),
            f"{prefix}_email":         row.get("e-Mail", ""),
            f"{prefix}_mesure_ar":     row.get(mesure_ar, ""),
            f"{prefix}_mesure_fr":     row.get(mesure_fr, ""),
        }
        post(url, cookies, data=payload, logs=logs)
        post(url, cookies, data={**payload, "action": valide_action}, logs=logs)
        log(logs, f"   {prefix} ✓")

    log(logs, "✅ Droits des personnes enregistrés")


def send_to_anpdp(data, cookies, logs):
    """Main injection sequence — mirrors send() from SendData.py"""
    if not REQUESTS_OK:
        raise RuntimeError("Module 'requests' manquant. Installez: pip install requests beautifulsoup4")

    def get_section(key, index=0, required=True):
        """Safely get a section from data with a clear error message."""
        items = data.get(key, [])
        if not items:
            if required:
                raise RuntimeError(f"Section manquante ou vide : «{key}»")
            return {}
        if index >= len(items):
            if required:
                raise RuntimeError(f"Section «{key}» : entrée [{index}] introuvable (seulement {len(items)} entrée(s))")
            return {}
        return items[index]

    # 1. Traitement
    log(logs, "1️⃣  Création du traitement...")
    try:
        id_traitement, id_contact = ajouter_traitement(data, cookies, logs)
    except Exception as e:
        raise RuntimeError(f"Section 1 (Informations traitement) : {e}")

    # 2. Sous-traitements
    try:
        existence = get_section("1. Informations sur le traitement").get("Existence de sous traitements", "Non")
        if str(existence).strip().lower() == "oui":
            log(logs, "2️⃣  Sous-traitements...")
            index = 1
            items = data["1. Informations sur le traitement"]
            while index < len(items):
                current = items[index]
                id_soustraitement = ajouter_sous_traitement(id_traitement, current, cookies, logs)
                if str(current.get("Sous traité", "")).strip().lower() == "oui":
                    index += 1
                    if index < len(items):
                        ajouter_straitant(id_traitement, id_soustraitement, items[index], cookies, logs)
                index += 1
            log(logs, "✅ Sous-traitements enregistrés")
        else:
            log(logs, "2️⃣  Pas de sous-traitements")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 2 (Sous-traitements) : {e}")

    # 3. Données collectées
    log(logs, "3️⃣  Données collectées...")
    try:
        sec2 = get_section("2. Données collectées et leur catégories")
        ajouter_collect(id_traitement, id_contact, sec2, cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 3 (Données collectées) : {e}")

    # 4. Catégories
    log(logs, "4️⃣  Catégories de données...")
    try:
        categories = data.get("3. Catégories des données collectées et traitées", [])
        if not categories:
            raise RuntimeError("Section «3. Catégories des données collectées et traitées» est vide — ajoutez au moins une ligne dans le tableau Section 3")
        for s in categories:
            for info in s.get("Type d'informations", "").split(", "):
                if not info.strip():
                    continue
                copie = s.copy()
                copie["Type d'informations"] = info.strip()
                ajouter_categorie(id_traitement, id_contact, copie, cookies, logs)
                log(logs, f"   catégorie '{copie.get('Catégorie de données','')}' / '{info.strip()}' ✓")
        log(logs, "✅ Catégories enregistrées")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 4 (Catégories données) : {e}")

    # 5. Conservation
    log(logs, "5️⃣  Conservation...")
    try:
        ajouter_conservation(id_traitement, get_section("4. Conservation des données"), cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 5 (Conservation) : {e}")

    # 6. Sécurité
    log(logs, "6️⃣  Sécurité...")
    try:
        ajouter_securite = envoyer_securite
        ajouter_securite(id_traitement, get_section("5. Sécurité des traitements et des données"), cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 6 (Sécurité) : {e}")

    # 7. Interconnexion
    log(logs, "7️⃣  Interconnexion...")
    try:
        for entry in data.get("6. Interconnexion et/ou communication des données collectées à des tiers", []):
            ajouter_interconnexion(id_traitement, entry, cookies, logs)
        log(logs, "✅ Interconnexion enregistrée")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 7 (Interconnexion) : {e}")

    # 8. Transfert
    log(logs, "8️⃣  Transfert étranger...")
    try:
        ajouter_transfert(id_traitement, get_section("7. Transfert des données à l'étranger"), cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 8 (Transfert étranger) : {e}")

    # 9. Consentement
    log(logs, "9️⃣  Consentement...")
    try:
        ajouter_consent(id_traitement, get_section("8. Consentement des personnes concernées"), cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 9 (Consentement) : {e}")

    # 10. Droits
    log(logs, "🔟  Droits des personnes...")
    try:
        sec9 = data.get("9. Droits des personnes concernées", [])
        if not sec9:
            raise RuntimeError("Section «9. Droits des personnes concernées» est vide — remplissez la section Droits")
        ajouter_droit_personne(id_traitement, sec9, cookies, logs)
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Section 10 (Droits personnes) : {e}")

    log(logs, f"\n🎉 INJECTION COMPLÈTE — id_traitement={id_traitement}")
    return id_traitement


# ─── HTTP SERVER ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass  # silence default logs

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == '/check':
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type','application/json')
            self.end_headers()
            status = {"ok": True, "requests": REQUESTS_OK}
            self.wfile.write(json.dumps(status).encode())
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            payload = json.loads(body)
        except Exception as e:
            self._error(400, str(e)); return

        # ── /generate_excel ──────────────────────────────────────────────────
        if self.path == '/generate_excel':
            try:
                with tempfile.NamedTemporaryFile('w', suffix='.json',
                                                  delete=False, encoding='utf-8') as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                    json_path = f.name

                xlsx_path = json_path.replace('.json', '.xlsx')
                script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate_excel.py')
                result = subprocess.run([sys.executable, script, json_path, xlsx_path],
                                        capture_output=True, text=True)
                os.unlink(json_path)

                if result.returncode != 0 or not os.path.exists(xlsx_path):
                    self._error(500, result.stderr or "Erreur génération Excel"); return

                with open(xlsx_path, 'rb') as f:
                    content = f.read()
                os.unlink(xlsx_path)

                nom = payload.get("1. Informations sur le traitement", [{}])[0].get("Dénomination du traitement", "registre")
                nom = nom.replace(' ', '_').lower()[:40]
                filename = f"Registre_{nom}_{date.today()}.xlsx"

                self.send_response(200)
                self._cors()
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            except Exception as e:
                self._error(500, traceback.format_exc())

        # ── /send_to_anpdp ───────────────────────────────────────────────────
        elif self.path == '/send_to_anpdp':
            logs = []
            try:
                cookies = payload.get("_cookies", {})
                if not cookies.get("PHPSESSID"):
                    self._error(400, "PHPSESSID manquant dans _cookies"); return
                if not REQUESTS_OK:
                    self._error(500, "Module 'requests' non installé. Exécutez: pip install requests beautifulsoup4")
                    return

                log(logs, "🚀 Démarrage injection ANPDP...")
                id_traitement = send_to_anpdp(payload, cookies, logs)

                resp = {"success": True, "id_traitement": id_traitement, "logs": logs}
                self.send_response(200)
                self._cors()
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode())

            except Exception as e:
                log(logs, f"❌ ERREUR: {str(e)}")
                resp = {"success": False, "error": str(e), "logs": logs}
                self.send_response(500)
                self._cors()
                self.send_header('Content-Type','application/json')
                self.end_headers()
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode())

        else:
            self.send_response(404); self.end_headers()

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _error(self, code, msg):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type','text/plain')
        self.end_headers()
        self.wfile.write(msg.encode())


if __name__ == '__main__':
    print("=" * 55)
    print("  ANPDP Server — Registre des Traitements")
    print("=" * 55)
    if not REQUESTS_OK:
        print("⚠  'requests' ou 'beautifulsoup4' non installé.")
        print("   Installez: pip install requests beautifulsoup4")
        print("   (Excel export fonctionnera quand même)")
    print(f"\n✅ Serveur démarré sur http://localhost:{PORT}")
    print("   Endpoints:")
    print("     GET  /check            → statut serveur")
    print("     POST /generate_excel   → télécharger .xlsx stylisé")
    print("     POST /send_to_anpdp    → injecter dans le portail ANPDP")
    print("\n   Ouvrez anpdp_registre_tool.html dans votre navigateur.")
    print("   Ctrl+C pour arrêter.\n")
    server = HTTPServer(('localhost', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")
