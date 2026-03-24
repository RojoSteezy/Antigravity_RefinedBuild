/**
 * traitement_ai.js
 * AI Assistant, KB Suggestions, and Notes logic
 */

const SECTION_NAMES = {
  s1:  'Section 1 — Informations sur le traitement',
  s2:  'Section 2 — Sous-traitements',
  s3:  'Section 3 — Données collectées',
  s4:  'Section 4 — Catégories des données',
  s5:  'Section 5 — Conservation des données',
  s6:  'Section 6 — Sécurité des traitements',
  s7:  'Section 7 — Interconnexion / Communication',
  s8:  'Section 8 — Transfert à l\'étranger',
  s9:  'Section 9 — Consentement',
  s10: 'Section 10 — Droits des personnes',
  exp: 'Export & Configuration'
};

const KB_FIELD_MAP = {
  finalite:'f_but', finalite_ar:'f_but_ar',
  cadre:'f_cadre', cadre_ar:'f_cadre_ar',
  comment:'f_dr_com', comment_ar:'f_dr_com_ar',
  service_droits:'f_dr_svc', service_droits_ar:'f_dr_svc_ar',
  adresse_droits:'f_dr_adr', adresse_droits_ar:'f_dr_adr_ar',
  mesures_droits:'f_dr_mes', mesures_droits_ar:'f_dr_mes_ar',
  methode_consent:'f_methode', methode_consent_ar:'f_methode_ar',
  pourquoi_consent:'f_pourquoi',
  nom_bdd:'f_nom_bdd', lieu_bdd:'f_lieu_bdd',
  nom_fm:'f_nom_fm', lieu_fm:'f_lieu_fm',
};

const KB_FIELD_LABELS = {
  finalite:'🎯 Finalité (FR)', finalite_ar:'🎯 الغاية (AR)',
  cadre:'⚖️ Cadre légal (FR)', cadre_ar:'⚖️ الإطار القانوني (AR)',
  comment:'💬 Droits — Comment (FR)', comment_ar:'💬 حقوق — كيف (AR)',
  service_droits:'🏢 Service droits (FR)', service_droits_ar:'🏢 المصلحة (AR)',
  adresse_droits:'📍 Adresse droits (FR)', adresse_droits_ar:'📍 العنوان (AR)',
  mesures_droits:'🛡 Mesures droits (FR)', mesures_droits_ar:'🛡 التدابير (AR)',
  methode_consent:'✅ Méthode consentement (FR)', methode_consent_ar:'✅ طريقة الموافقة (AR)',
  nom_bdd:'💾 Nom base de données', lieu_bdd:'📍 Lieu stockage info',
  nom_fm:'📂 Nom fichier manuel', lieu_fm:'📍 Lieu stockage manuel',
};

const KB_SECTION_FIELDS = {
  s1:['finalite','finalite_ar','cadre','cadre_ar'],
  s5:['nom_bdd','lieu_bdd','nom_fm','lieu_fm'],
  s9:['methode_consent','methode_consent_ar','pourquoi_consent'],
  s10:['comment','comment_ar','service_droits','service_droits_ar',
       'adresse_droits','adresse_droits_ar','mesures_droits','mesures_droits_ar'],
};

let _kbLoaded=false, _currentKBTypeId=null;

function toggleAI() {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  document.body.classList.toggle('ai-open', open);
  const fab = document.getElementById('ai-fab');
  if (fab) fab.innerHTML = open ? '✕ Fermer' : '✨ Assistant &amp; Notes';
  if (open) {
    if (typeof checkAPIKey === 'function') checkAPIKey();
    const chatInput = document.getElementById('chat-input');
    if (chatInput) chatInput.focus();
  }
}

function switchAITab(tab) {
  const chatP = document.getElementById('chat-panel');
  const kbP = document.getElementById('kb-panel');
  const notesP = document.getElementById('notes-panel');
  const tChat = document.getElementById('tab-chat');
  const tKb = document.getElementById('tab-kb');
  const tNotes = document.getElementById('tab-notes');

  if(chatP) chatP.classList.toggle('hidden', tab !== 'chat');
  if(kbP) kbP.classList.toggle('hidden', tab !== 'kb');
  if(notesP) notesP.classList.toggle('hidden', tab !== 'notes');
  if(tChat) tChat.classList.toggle('active', tab === 'chat');
  if(tKb) tKb.classList.toggle('active', tab === 'kb');
  if(tNotes) tNotes.classList.toggle('active', tab === 'notes');
}

async function loadKBSuggestions(typeId) {
  _currentKBTypeId = typeId;
  _kbLoaded = true;
  const box = document.getElementById('kb-suggestions');
  if (!box) return;
  if (!typeId) { box.innerHTML = '<div style="text-align:center;padding:30px;color:#8aab9c;font-size:12px">Choisissez un type</div>'; return; }
  box.innerHTML = '<div style="text-align:center;padding:20px;color:#8aab9c;font-size:12px">⏳ Chargement...</div>';

  fetch(`/company/${COMPANY_ID}/traitement/${TRAITEMENT_ID}/set_type`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify({ type_id: typeId })
  });

  const r = await fetch(`/api/kb/suggestions/${typeId}`);
  const grouped = await r.json();

  if (!Object.keys(grouped).length) {
    box.innerHTML = `<div style="text-align:center;padding:30px;color:#8aab9c;font-size:12px">Aucune suggestion.<br><a href="/kb" target="_blank" style="color:#6c47ff">Ajouter →</a></div>`;
    return;
  }

  const activeSect = getActiveSection();
  const sectFields = KB_SECTION_FIELDS[activeSect] || [];
  const sortedKeys = Object.keys(grouped).sort((a, b) => (sectFields.includes(a) ? 0 : 1) - (sectFields.includes(b) ? 0 : 1));

  let html = '';
  for (const fkey of sortedKeys) {
    const entries = grouped[fkey];
    const label = KB_FIELD_LABELS[fkey] || fkey;
    const targetId = KB_FIELD_MAP[fkey];
    const isActive = sectFields.includes(fkey);
    const currentVal = targetId ? (document.getElementById(targetId)?.value || '') : '';
    html += `<div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <div style="font-size:10.5px;font-weight:700;color:${isActive ? '#5234e0' : '#4a6358'};text-transform:uppercase;letter-spacing:.05em">
          ${isActive ? '● ' : ''}${label}</div>
        ${currentVal ? '<div style="font-size:9.5px;color:#00B074;font-family:JetBrains Mono,monospace">✓ rempli</div>' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${entries.map(e => `
          <div style="padding:8px 10px;background:#f9fbfa;border:1px solid #e2ece8;border-radius:7px;cursor:pointer;transition:all .12s"
               onmouseover="this.style.borderColor='#6c47ff';this.style.background='rgba(108,71,255,.04)'"
               onmouseout="this.style.borderColor='#e2ece8';this.style.background='#f9fbfa'"
               onclick="applyKBSuggestion('${targetId}','${e.value.replace(/'/g, "\\'")}','${fkey}')">
            <div style="font-size:12px;color:#1a2e26;line-height:1.5;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <span style="${e.is_arabic ? 'font-family:Noto Sans Arabic,sans-serif;direction:rtl;text-align:right;flex:1' : ''}">${e.value}</span>
              <span style="font-size:10px;color:#6c47ff;font-weight:700;white-space:nowrap;padding-top:2px">Utiliser →</span>
            </div>
          </div>`).join('')}
      </div></div>`;
  }
  box.innerHTML = html;
}

function applyKBSuggestion(fieldId, value, fkey) {
  if (!fieldId) { if(typeof toast==='function') toast(`⚠ Champ "${fkey}" non mappé`, true); return; }
  const el = document.getElementById(fieldId);
  if (!el) { if(typeof toast==='function') toast(`⚠ Introuvable: ${fieldId}`, true); return; }
  if (el.value && el.value.trim() && !confirm('Ce champ contient déjà une valeur. Remplacer ?')) return;
  el.value = value;
  el.dispatchEvent(new Event('input'));
  if (typeof vc === 'function') vc(el, 200);
  _dirty = true;
  if (typeof setSaveStatus === 'function') setSaveStatus('⚪ Modifié');
  el.style.transition = 'box-shadow .3s,border-color .3s';
  el.style.borderColor = '#6c47ff';
  el.style.boxShadow = '0 0 0 3px rgba(108,71,255,.2)';
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 1800);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  if (typeof toast === 'function') toast(`✓ "${KB_FIELD_LABELS[fkey] || fkey}" rempli`);
  setTimeout(() => loadKBSuggestions(_currentKBTypeId), 400);
}

function getActiveSection() {
  const active = document.querySelector('.sec.active');
  return active ? active.id : 's1';
}

// Watch for section changes to refresh AI context
document.addEventListener('sectionChanged', (e) => {
  const label = SECTION_NAMES[e.detail.id] || e.detail.id;
  const ctxLabel = document.getElementById('ctx-label');
  if (ctxLabel) ctxLabel.textContent = label;
  if (_kbLoaded && _currentKBTypeId) loadKBSuggestions(_currentKBTypeId);
});

// Notes autosave logic
let _notesSaveTimer;
const notesArea = document.getElementById('notes-area');
if (notesArea) {
  notesArea.addEventListener('input', () => {
    _dirty = true;
    clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(() => {
      const savedAt = document.getElementById('notes-saved-at');
      if (savedAt) savedAt.textContent = 'Sauvegardé à ' + new Date().toLocaleTimeString('fr-DZ');
    }, 800);
  });
}
