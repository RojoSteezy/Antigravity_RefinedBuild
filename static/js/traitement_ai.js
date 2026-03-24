/**
 * traitement_ai.js
 * Agentic Compliance Co-pilot logic
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

/**
 * Toggle the AI side panel
 */
function toggleAI() {
  const panel = document.getElementById('ai-assistant-panel');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  document.body.classList.toggle('ai-open', open);
  
  if (open && !_kbLoaded) {
    initKBSelector();
  }
}

/**
 * Switch between Suggestions and Notes tabs
 */
function switchAITab(tab) {
  const sugP = document.getElementById('ai-tab-suggestions');
  const notesP = document.getElementById('ai-tab-notes');
  const tabs = document.querySelectorAll('.ai-tab');

  if(sugP) sugP.classList.toggle('active', tab === 'suggestions');
  if(notesP) notesP.classList.toggle('active', tab === 'notes');
  
  tabs.forEach(t => {
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab));
  });
}

/**
 * Initialize the KB Type selector from the API
 */
async function initKBSelector() {
  const sel = document.getElementById('kb-type-sel');
  if (!sel) return;
  
  try {
    const r = await fetch('/api/kb/types');
    const types = await r.json();
    
    sel.innerHTML = '<option value="">— Sélectionner un modèle —</option>' + 
      types.map(t => `<option value="${t.id}">${t.icon} ${t.name}</option>`).join('');
    
    // Auto-select based on TRAITEMENT_TYPE (if name matches)
    if (typeof TRAITEMENT_TYPE !== 'undefined' && TRAITEMENT_TYPE) {
      const target = types.find(t => t.name === TRAITEMENT_TYPE || t.id.toString() === TRAITEMENT_TYPE);
      if (target) {
        sel.value = target.id;
        loadKBSuggestions(target.id);
      }
    }
    
    // Check for "Agentic Nudge" (if no type is selected)
    checkAgenticNudges();
  } catch (e) {
    console.error("Failed to load KB types", e);
  }
}

/**
 * Proactive Compliance Nudges
 */
function checkAgenticNudges() {
  const list = document.getElementById('suggestions-list');
  if (!list) return;
  
  const sel = document.getElementById('kb-type-sel');
  if (sel && !sel.value) {
    list.innerHTML = `
      <div class="ai-nudge">
        <div class="ai-nudge-icon">💡</div>
        <div class="ai-nudge-text">
          <strong>Besoin d'aide ?</strong> Sélectionnez un modèle (ex: RH, CCTV) pour que je puisse vous suggérer des textes conformes à la loi 18-07.
        </div>
      </div>
    `;
  }
}

/**
 * Agentic Arabic Drafting
 * This uses the /api/chat endpoint with a specialized prompt
 */
async function draftArabic(fieldIdFr, fieldIdAr) {
  const frVal = document.getElementById(fieldIdFr)?.value;
  if (!frVal || frVal.length < 5) {
    if(typeof toast==='function') toast("Veuillez d'abord remplir le texte en français", true);
    return;
  }
  
  if(typeof toast==='function') toast("🪄 L'IA rédige la version arabe...");
  
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: `Traduis ce texte administratif en arabe formel (Fousha) pour un formulaire ANPDP. Sois précis et utilise le jargon juridique algérien : "${frVal}"` }
        ],
        context: {
          activeField: fieldIdFr,
          denom: document.getElementById('f_denom')?.value
        }
      })
    });
    
    const j = await r.json();
    if (j.reply) {
      // Look for Arabic text in the reply or use the whole reply if it's mostly Arabic
      const arMatch = j.reply.match(/[\u0600-\u06FF\s،؛؟]+/g);
      const arText = arMatch ? arMatch.join(' ').trim() : j.reply;
      
      const elAr = document.getElementById(fieldIdAr);
      if (elAr) {
        elAr.value = arText;
        elAr.dispatchEvent(new Event('input'));
        elAr.classList.add('field-highlight');
        setTimeout(() => elAr.classList.remove('field-highlight'), 2000);
        if(typeof toast==='function') toast("✓ Traduction générée");
      }
    }
  } catch (e) {
    console.error("AI Drafting failed", e);
    if(typeof toast==='function') toast("❌ Échec de la génération AI", true);
  }
}

/**
 * Load suggestions for a selected KB type
 */
async function loadKBSuggestions(typeId) {
  _currentKBTypeId = typeId;
  _kbLoaded = true;
  const list = document.getElementById('suggestions-list');
  if (!list) return;

  if (!typeId) { 
    checkAgenticNudges();
    return; 
  }

  list.innerHTML = '<div class="ai-loading">⏳ Recherche des meilleures suggestions...</div>';

  // Save selection to backend
  fetch(`/company/${COMPANY_ID}/traitement/${TRAITEMENT_ID}/set_type`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
    body: JSON.stringify({ type_id: typeId })
  });

  try {
    const r = await fetch(`/api/kb/suggestions/${typeId}`);
    const grouped = await r.json();

    if (!Object.keys(grouped).length) {
      list.innerHTML = `<div class="ai-empty-state">Aucune suggestion trouvée pour ce modèle. <br><br> <button class="btn bs" onclick="alert('Bientôt : Importation de templates')">Charger un template</button></div>`;
      return;
    }

    const activeSect = getActiveSection();
    const sectFields = KB_SECTION_FIELDS[activeSect] || [];
    
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      const aIn = sectFields.includes(a);
      const bIn = sectFields.includes(b);
      if (aIn && !bIn) return -1;
      if (!aIn && bIn) return 1;
      return 0;
    });

    let html = '';
    
    // Add a specialized "Agentic Section Help" nudge
    if (sectFields.length > 0) {
      html += `
        <div class="ai-section-nudge">
          <strong>Aide pour ${SECTION_NAMES[activeSect]}</strong><br>
          Voici des suggestions adaptées à cette section pour un traitement de type <em>${document.getElementById('kb-type-sel').selectedOptions[0]?.text || ''}</em>.
        </div>
      `;
    }

    for (const fkey of sortedKeys) {
      const entries = grouped[fkey];
      const label = KB_FIELD_LABELS[fkey] || fkey;
      const targetId = KB_FIELD_MAP[fkey];
      const isActive = sectFields.includes(fkey);
      const currentVal = targetId ? (document.getElementById(targetId)?.value || '') : '';
      
      html += `
        <div class="ai-suggestion-group ${isActive ? 'active-section' : ''}">
          <div class="ai-suggestion-header">
            <span class="ai-suggestion-label">${isActive ? '✨ ' : ''}${label}</span>
            ${currentVal ? '<span class="ai-suggestion-status">✓</span>' : ''}
          </div>
          <div class="ai-suggestion-items">
            ${entries.map(e => `
              <div class="ai-suggestion-item" onclick="applyKBSuggestion('${targetId}','${e.value.replace(/'/g, "\\'")}','${fkey}')">
                <div class="ai-suggestion-text ${e.is_arabic ? 'rtl' : ''}">${e.value}</div>
                <div class="ai-suggestion-action">Utiliser</div>
              </div>
            `).join('')}
          </div>
        </div>`;
    }
    list.innerHTML = html;
  } catch (e) {
    list.innerHTML = `<div class="ai-error">Erreur lors du chargement des suggestions.</div>`;
  }
}

/**
 * Apply a suggestion to a form field
 */
function applyKBSuggestion(fieldId, value, fkey) {
  if (!fieldId) { 
    if(typeof toast==='function') toast(`⚠ Champ "${fkey}" non mappé`, true); 
    return; 
  }
  
  const el = document.getElementById(fieldId);
  if (!el) { 
    if(typeof toast==='function') toast(`⚠ Introuvable: ${fieldId}`, true); 
    return; 
  }
  
  if (el.value && el.value.trim() && !confirm('Ce champ contient déjà une valeur. Remplacer ?')) return;
  
  el.value = value;
  el.dispatchEvent(new Event('input'));
  if (typeof vc === 'function') vc(el, 200);
  
  _dirty = true;
  if (typeof setSaveStatus === 'function') setSaveStatus('⚪ Modifié');
  
  // Highlight the field
  el.classList.add('field-highlight');
  setTimeout(() => el.classList.remove('field-highlight'), 2000);
  
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  
  if (typeof toast === 'function') toast(`✓ "${KB_FIELD_LABELS[fkey] || fkey}" rempli`);
  
  // Refresh suggestions to show checkmark
  setTimeout(() => loadKBSuggestions(_currentKBTypeId), 400);
}

function getActiveSection() {
  const active = document.querySelector('.sec.active');
  return active ? active.id : 's1';
}

/**
 * Learn from Form
 * Collects current field values and sends them to the KB as unapproved suggestions
 */
async function learnFromForm() {
  const sel = document.getElementById('kb-type-sel');
  if (!sel || !sel.value) {
    if(typeof toast==='function') toast("Veuillez d'abord sélectionner un modèle de traitement", true);
    return;
  }
  
  const typeId = sel.value;
  const fields = {};
  let count = 0;
  
  for (const [fkey, domId] of Object.entries(KB_FIELD_MAP)) {
    const val = document.getElementById(domId)?.value?.trim();
    if (val && val.length > 5) {
      fields[fkey] = val;
      count++;
    }
  }
  
  if (count === 0) {
    if(typeof toast==='function') toast("Aucun champ rempli n'a été trouvé", true);
    return;
  }
  
  if(typeof toast==='function') toast(`⏳ Envoi de ${count} suggestions au modèle...`);
  
  try {
    const r = await fetch('/api/kb/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': typeof getCsrf === 'function' ? getCsrf() : '' },
      body: JSON.stringify({ type_id: typeId, fields: fields })
    });
    const j = await r.json();
    if (j.ok) {
      if(typeof toast==='function') toast(`✓ ${j.added} suggestions ajoutées pour révision !`);
      // Optional: Refresh suggestions if they show pending ones (currently they don't)
    }
  } catch (e) {
    console.error("Learning failed", e);
    if(typeof toast==='function') toast("❌ Échec de l'enregistrement", true);
  }
}

// Watch for section changes to refresh AI context
document.addEventListener('sectionChanged', (e) => {
  if (_kbLoaded && _currentKBTypeId) {
    loadKBSuggestions(_currentKBTypeId);
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Any init logic if needed
});
