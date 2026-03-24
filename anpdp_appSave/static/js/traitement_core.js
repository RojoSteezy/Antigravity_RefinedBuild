/**
 * traitement_core.js
 * Core logic for ANPDP Treatment Registration Form
 */

// Global State
const SECS = ['s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','exp'];
let R = {}; // Radio values
let C = {}; // Checkbox sets
let stCnt = 0; // Sous-traitement counter
let icCnt = 0; // Interconnexion counter
let _dirty = false;
let _saving = false;
let _autosaveTimer = null;

// ── NAVIGATION ───────────────────────────────────────────────────────────────
function showS(id) {
  SECS.forEach(s => {
    const secEl = document.getElementById(s);
    const navEl = document.getElementById('nav-' + s);
    if (secEl) secEl.classList.remove('active');
    if (navEl) navEl.classList.remove('active');
  });
  
  const targetSec = document.getElementById(id);
  const targetNav = document.getElementById('nav-' + id);
  if (targetSec) targetSec.classList.add('active');
  if (targetNav) targetNav.classList.add('active');
  
  const pf = document.getElementById('pf');
  if (pf) {
    const i = SECS.indexOf(id);
    pf.style.width = Math.round((i + 1) / SECS.length * 100) + '%';
  }
  
  if (id === 'exp') {
    if (typeof refreshJ === 'function') refreshJ();
    if (typeof switchTab === 'function') switchTab('j');
    if (typeof checkServer === 'function') setTimeout(checkServer, 300);
  }
  
  window.scrollTo(0, 0);
  document.dispatchEvent(new CustomEvent('sectionChanged', { detail: { id } }));
}

function goFree(id) { showS(id); }

function nextS(cur, nxt) {
  if (validateS(cur)) {
    const navCur = document.getElementById('nav-' + cur);
    if (navCur) navCur.classList.add('done');
    showS(nxt);
  }
}

function prevS(cur, prv) { showS(prv); }

// ── INPUTS & VALIDATION ──────────────────────────────────────────────────────
function selR(k, v, el) {
  R[k] = v;
  const pg = document.getElementById('pg-' + k);
  if (pg) {
    pg.querySelectorAll('.po').forEach(p => p.classList.remove('sr'));
  }
  el.classList.add('sr');
  hideErr('em-' + k);
}

function tck(el, grp, val) {
  if (!C[grp]) C[grp] = new Set();
  el.classList.toggle('sc');
  const sq = el.querySelector('.ps');
  if (el.classList.contains('sc')) {
    C[grp].add(val);
    if (sq) sq.textContent = '✓';
  } else {
    C[grp].delete(val);
    if (sq) sq.textContent = '';
  }
  hideErr('em-' + grp);
  
  // Special toggles
  if (grp === 'cat_trait' && val === 'Autres') {
    const otherCat = document.getElementById('div-autre-cat');
    if (otherCat) otherCat.style.display = el.classList.contains('sc') ? 'block' : 'none';
  }
  if (grp === 'cat_pers' && val === 'cat_autre_collect') {
    const otherPers = document.getElementById('div-cat-ap');
    if (otherPers) otherPers.style.display = el.classList.contains('sc') ? 'block' : 'none';
  }
}

function vc(el, max) {
  const len = el.value.length;
  const cc = document.getElementById('cc-' + el.id);
  if (!cc) return;
  cc.textContent = len + '/' + max;
  cc.className = 'cc' + (len > max * .9 ? (len >= max ? ' o' : ' w') : '');
}

function showErr(id, msg) {
  const e = document.getElementById(id);
  if (e) {
    if (msg) e.textContent = msg;
    e.classList.add('show');
  }
}

function hideErr(id) {
  const e = document.getElementById(id);
  if (e) e.classList.remove('show');
}

function live(el, key) {
  el.classList.remove('err');
}

function gv(id) {
  const e = document.getElementById(id);
  return e ? e.value.trim() : '';
}

function ck(grp, val) {
  return C[grp]?.has(val) ? 1 : 0;
}

// ── SPECIAL UI TOGGLES ──────────────────────────────────────────────────────
function toggleST(v) {}

function toggleModeC(v) {
  const show = v === 'Informatique' || v === 'Informatique et Manuel';
  const modeC = document.getElementById('fld-mode-c');
  if (modeC) modeC.style.opacity = show ? '1' : '0.4';
}

function toggleConservFields() {
  const iBlock = document.getElementById('blk-info-i');
  const mBlock = document.getElementById('blk-info-m');
  if (iBlock) iBlock.style.display = C['modeconserv']?.has('Informatique') ? 'block' : 'none';
  if (mBlock) mBlock.style.display = C['modeconserv']?.has('Manuel') ? 'block' : 'none';
}

function tglConsent(v) {
  const oui = document.getElementById('div-consent-oui');
  const non = document.getElementById('div-consent-non');
  if (oui) oui.style.display = v === 'Oui' ? 'block' : 'none';
  if (non) non.style.display = v === 'Non' ? 'block' : 'none';
}

// ── TOAST ───────────────────────────────────────────────────────────────────
let tT;
function toast(msg, err = false) {
  const t = document.getElementById('toast');
  const tmsg = document.getElementById('tmsg');
  const tico = document.getElementById('tico');
  if (!t || !tmsg || !tico) return;
  
  tmsg.textContent = msg;
  tico.textContent = err ? '⚠' : '✓';
  t.style.borderColor = err ? 'rgba(229,62,62,.3)' : 'var(--bdr)';
  t.classList.add('show');
  clearTimeout(tT);
  tT = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── FORM VALIDATION ──────────────────────────────────────────────────────────
function validateS(id) {
  let ok = true;
  let firstErrEl = null;

  const fail = (eid, msg) => {
    const e = document.getElementById(eid);
    if (e) {
      if (msg) e.textContent = msg;
      e.classList.add('show');
    }
    if (!firstErrEl) firstErrEl = e;
    ok = false;
  };

  // Section 1
  if (id === 's1') {
    if (gv('f_denom').length < 3) fail('em-f_denom', '3 à 200 caractères requis');
    if (gv('f_denom_ar').length < 3) fail('em-f_denom_ar', 'نص عربي مطلوب');
    if (!C['type_trait'] || C['type_trait'].size === 0) fail('em-type_trait', 'Cochez au moins un type');
    if (!gv('f_date')) fail('em-f_date', 'Date obligatoire');
    if (gv('f_but').length < 3) fail('em-f_but', 'Finalité obligatoire');
    if (gv('f_but_ar').length < 3) fail('em-f_but_ar', 'الغاية مطلوبة');
    if (!C['cat_trait'] || C['cat_trait'].size === 0) fail('em-cat_trait', 'Sélectionnez une catégorie');
    if (!R['ext_trait']) fail('em-ext_trait', 'Champ obligatoire');
    if (R['ext_trait'] === 'Oui' && !R['ext_soustraitant']) fail('em-ext_soustraitant', 'Précisez si sous-traitant');
  }

  // Section 3
  if (id === 's3') {
    if (!R['type_collect']) fail('em-type_collect', 'Type de collecte requis');
    if ((R['type_collect'] === 'Informatique' || R['type_collect'] === 'Informatique et Manuel') && !R['mode_collect']) {
      fail('em-mode_collect', 'Mode requis pour informatique');
    }
    if (!R['existautrecat']) fail('em-existautrecat', 'Champ obligatoire');
    if (R['existautrecat'] === 'Oui') {
      if (!gv('f_nombdfm')) fail('em-f_nombdfm', 'Requis');
      if (!gv('f_nomproprio')) fail('em-f_nomproprio', 'Requis');
      if (!gv('f_cadre_src')) fail('em-f_cadre_src', 'Requis');
      if (!gv('f_obj_src')) fail('em-f_obj_src', 'Requis');
    }
  }

  // Section 5
  if (id === 's5') {
    if (!C['modeconserv'] || C['modeconserv'].size === 0) fail('em-modeconserv', 'Mode de conservation requis');
    if (C['modeconserv']?.has('Informatique')) {
      if (!gv('f_nom_bdd')) fail('em-f_nom_bdd', 'Nom BDD requis');
      if (!gv('f_lieu_bdd')) fail('em-f_lieu_bdd', 'Lieu requis');
    }
    if (C['modeconserv']?.has('Manuel')) {
      if (!gv('f_nom_fm')) fail('em-f_nom_fm', 'Nom fichier requis');
      if (!gv('f_lieu_fm')) fail('em-f_lieu_fm', 'Lieu requis');
    }
  }

  // Section 6
  if (id === 's6') {
    if (!R['eng_sec']) fail('em-eng_sec', 'Champ obligatoire');
  }

  if (firstErrEl) {
    firstErrEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('⚠ Certains champs sont invalides', true);
  }
  return ok;
}

// ── SAVE & LOAD ─────────────────────────────────────────────────────────────
async function saveNow() {
  if (typeof collectData !== 'function') return;
  const d = collectData();
  setSaveStatus('⏳ Sauvegarde...');
  try {
    const r = await fetch(SAVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrf()
      },
      body: JSON.stringify(d)
    });
    const j = await r.json();
    if (j.ok) {
      _dirty = false;
      setSaveStatus('✅ Sauvegardé');
      const nameDisp = document.getElementById('t-name-display');
      if (j.name && nameDisp) nameDisp.textContent = j.name;
      setTimeout(() => setSaveStatus('💾 Sauvegardé'), 3000);
    } else {
      setSaveStatus('❌ Erreur');
    }
  } catch (e) {
    setSaveStatus('❌ Erreur réseau');
  }
}

function setSaveStatus(msg) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = msg;
}

function scheduleAutosave() {
  if (_autosaveTimer) clearTimeout(_autosaveTimer);
  setSaveStatus('Non sauvegardé...');
  _autosaveTimer = setTimeout(async () => {
    if (_saving) return;
    _saving = true;
    await saveNow();
    _saving = false;
  }, 1200);
}

function attachAutosave(root) {
  root = root || document;
  root.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.dataset.autosave) return;
    el.dataset.autosave = '1';
    el.addEventListener('input', scheduleAutosave);
    el.addEventListener('change', scheduleAutosave);
  });
}

function getCsrf() {
  const m = document.cookie.match(/csrf_token=([^;]+)/);
  return m ? m[1] : '';
}

async function changeStatus(val) {
  await fetch(STATUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 
      'X-CSRFToken': getCsrf()
    },
    body: JSON.stringify({ status: val })
  });
  await saveNow();
}

function loadFormData(d) {
  if (!d) return;
  const info = (d['1. Informations sur le traitement'] || [{}])[0];

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  };

  setVal('f_denom', info['Dénomination du traitement']);
  setVal('f_denom_ar', info['Dénomination du traitement (AR)']);
  setVal('f_date', info['Date de mise en œuvre du traitement']);
  setVal('f_but', info['Finalité (but) du traitement '] || info['Finalité (but) du traitement']);
  setVal('f_but_ar', info['Finalité (but) du traitement (AR)']);
  setVal('f_cadre', info['Cadre légal du traitement']);
  setVal('f_cadre_ar', info['Cadre légal du traitement (AR)']);
  setVal('f_autre_cat', info['Précisez les autres catégories']);

  // Checkboxes & Radios loading requires corresponding UI interactions
  const triggerClick = (selector, condition) => {
    document.querySelectorAll(selector).forEach(el => {
      if (condition(el)) el.click();
    });
  };

  // type_trait
  const types = (info['Type de traitement'] || '').split(', ').filter(Boolean);
  triggerClick('#pg-type_trait .po', el => {
    const val = el.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1];
    return val && types.includes(val);
  });

  // cat_trait
  const cats = (info['Catégories des traitements '] || info['Catégories des traitements'] || '').split(', ').filter(Boolean);
  triggerClick('#pg-cat_trait .po', el => {
    const val = el.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1];
    return val && cats.some(c => c.trim() === val);
  });

  // ext_trait
  const extT = info['Existence de sous traitements'];
  if (extT) triggerClick('#pg-ext_trait .po', el => el.textContent.includes(extT));

  const extST = info["Existence d'un sous traitant"];
  if (extST) triggerClick('#pg-ext_soustraitant .po', el => el.textContent.includes(extST));

    // Load sous-traitements
    const sec1All = d['1. Informations sur le traitement'] || [];
    sec1All.slice(1).forEach(entry => {
      if (entry['Dénomination du sous traitement'] !== undefined) {
        if (typeof addST === 'function') {
          addST();
          const id = stCnt;
          setVal('st_den_' + id, entry['Dénomination du sous traitement']);
          setVal('st_den_ar_' + id, entry['Dénomination du sous traitement (AR)']);
          setVal('st_obj_' + id, entry['Objectifs']);
          setVal('st_obs_' + id, entry['Observations']);
          const stTypes = (entry['Type du sous traitement'] || '').split(',').map(t => t.trim());
          triggerClick(`#st-${id} .po[onclick*="st_t_"]`, el => {
            const m = el.getAttribute('onclick')?.match(/'([^']+)'\)$/);
            return m && stTypes.some(t => t.toLowerCase().includes(m[1].toLowerCase()));
          });
          const sousTr = entry['Sous traité'] || 'Non';
          triggerClick(`#pg-st_e_${id} .po`, el => el.textContent.trim() === sousTr);
        }
      } else if (entry['Type de personne'] !== undefined) {
        const id = stCnt;
        const trType = entry['Type de personne'] || '';
        triggerClick(`#pg-st_tp_${id} .po`, el => el.textContent.trim() === trType);
        setVal('st_nom_' + id, entry['Nom/Raison sociale']);
        setVal('st_nom_ar_' + id, entry['Nom/Raison sociale (AR)']);
        setVal('st_pre_' + id, entry['Prénom/Sigle']);
        setVal('st_pre_ar_' + id, entry['Prénom/Sigle (AR)']);
        setVal('st_adr_' + id, entry['Adresse']);
        setVal('st_adr_ar_' + id, entry['Adresse (AR)']);
        setVal('st_pay_' + id, entry['Pays']);
        setVal('st_vil_' + id, entry['Ville']);
        setVal('st_tel_' + id, entry['N° Tél']);
        setVal('st_fax_' + id, entry['N° Fax']);
        setVal('st_dom_' + id, entry["Domaine d'activité"]);
      }
    });

  // etc. for other sections...
  if (typeof catLoad === 'function') catLoad(d['3. Catégories des données collectées et traitées'] || []);

  setSaveStatus('✅ Données chargées');
}
