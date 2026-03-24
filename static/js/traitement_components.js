/**
 * traitement_components.js
 * Specialized components and data IO for ANPDP Treatment Form
 */

// ── SPREADSHEET TABLE (Section 3) ──────────────────────────────────────────────
const CAT_COLS = [
  { key: 'cat',    type: 'select', opts: ['Données à caractère personnel', 'Données professionnelles', 'Données financières', 'Données  sensibles', 'Coordonnées', 'Données de connexion', 'Données de localisation', 'Caractéristiques personnelles', 'Vie privée', 'Habitudes de vie', 'Données biométriques', 'Données de santé'] },
  { key: 'type',   type: 'select', opts: [] }, // dynamic
  { key: 'autres', type: 'text' },
  { key: 'orig',   type: 'select', opts: ['De la personne concernée', 'Tiers', 'Organisme public', 'Organisme privé', 'Base de données interne', 'Dossiers papiers', 'Autre'] },
  { key: 'orig_a', type: 'text' },
  { key: 'final',  type: 'select', opts: ['Oui', 'Non'] },
  { key: 'src',    type: 'select', opts: ['Formulaire', 'Connexion', 'Support externe', 'Papier', 'Dossiers papiers', 'Base de données'] },
  { key: 'src_a',  type: 'text' },
  { key: 'duree',  type: 'number' }
];

const CAT_TYPES = {
  'Données à caractère personnel': ['NIN', 'Nom et prénom', 'Nom de jeune fille', 'N° de la pièce d\'identité/Permis/Passeport', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Photos', 'Données biométriques'],
  'Données professionnelles': ['Fonction', 'Grade', 'N° d\'immatriculation sociale', 'Employeur', 'Curriculum vitae', 'Expériences professionnelles', 'Formation', 'Diplômes', 'Distinctions', 'Domaine d\'activité'],
  'Données financières': ['Revenu', 'N° de compte bancaire/CCP', 'Situation fiscale', 'Dettes', 'Patrimoine', 'Transactions financières', 'Coordonnées bancaires'],
  'Données  sensibles': ['Origine raciale ou ethnique', 'Opinions politiques', 'Convictions religieuses ou philosophiques', 'Appartenance syndicale', 'Données de santé', 'Données génétiques', 'Données biométriques', 'Orientation sexuelle', 'Antécédents judiciaires'],
  'Coordonnées': ['Adresse du domicile', 'Adresse mail', 'N° téléphone', 'N° fax', 'Adresse professionnelle'],
  'Données de connexion': ['Adresse IP', 'Logs/Journaux', 'Identifiants', 'Mots de passe', 'Cookies', 'Données de trafic'],
  'Données de localisation': ['Coordonnées GPS', 'Trajets', 'Données de bornage'],
  'Caractéristiques personnelles': ['Sexe', 'Âge', 'État civil', 'Situation de famille', 'Nombre d\'enfants', 'Situation militaire'],
  'Vie privée': ['Situation familiale', 'Mode de vie', 'Activités associatives', 'Loisirs'],
  'Habitudes de vie': ['Consommation de biens ou services', 'Comportements', 'Préférences']
};

const CAT_DEFAULTS = { final: 'Oui', orig: 'De la personne concernée', src: 'Formulaire' };
let _catAC = null;

function catAddRow(data = {}) {
  const tbody = document.getElementById('cat-tbody');
  if (!tbody) return;
  const rowIdx = tbody.querySelectorAll('tr').length + 1;
  const tr = document.createElement('tr');
  tr.className = 'cat-row';

  // Row number
  const tdNum = document.createElement('td');
  tdNum.className = 'cat-num';
  tdNum.textContent = rowIdx;
  tr.appendChild(tdNum);

  // Data cells
  CAT_COLS.forEach(col => {
    const td = document.createElement('td');
    td.className = 'cat-cell';
    let el;
    const val = data[col.key] ?? CAT_DEFAULTS[col.key] ?? '';

    if (col.type === 'select') {
      el = document.createElement('select');
      el.className = 'cat-select';
      let opts = col.opts;
      if (col.key === 'type') {
        const catVal = data['cat'] || '';
        opts = CAT_TYPES[catVal] || Object.values(CAT_TYPES).flat();
      }
      el.innerHTML = '<option value="">—</option>' + 
        [...new Set(opts)].map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('');
      
      if (col.key === 'cat') {
        el.addEventListener('change', () => {
          const typeEl = tr.querySelector('[data-col="type"]');
          if (typeEl) {
            const newOpts = CAT_TYPES[el.value] || [];
            typeEl.innerHTML = '<option value="">—</option>' + 
              newOpts.map(o => `<option value="${o}">${o}</option>`).join('');
          }
          _dirty = true;
        });
      }
    } else if (col.type === 'number') {
      el = document.createElement('input');
      el.type = 'number'; el.min = '0'; el.max = '9999';
      el.className = 'cat-input'; el.value = val;
      el.placeholder = '0';
    } else {
      el = document.createElement('input');
      el.type = 'text';
      el.className = 'cat-input'; el.value = val;
      el.maxLength = 200;
      el.addEventListener('input', (e) => catShowAC(el, col.key, e));
      el.addEventListener('keydown', (e) => catHandleACKey(e));
      el.addEventListener('blur', () => setTimeout(catHideAC, 150));
    }
    el.dataset.col = col.key;
    el.addEventListener('change', () => { _dirty = true; if(typeof setSaveStatus === 'function') setSaveStatus('⚪ Modifié'); });
    el.addEventListener('input', () => { _dirty = true; });
    td.appendChild(el);
    tr.appendChild(td);
  });

  // Delete
  const tdDel = document.createElement('td');
  tdDel.className = 'cat-del';
  const delBtn = document.createElement('button');
  delBtn.textContent = '✕';
  delBtn.onclick = () => { tr.remove(); catRenumber(); catUpdateCount(); _dirty = true; };
  tdDel.appendChild(delBtn);
  tr.appendChild(tdDel);

  tbody.appendChild(tr);
  catUpdateCount();
  return tr;
}

function catRenumber() {
  document.querySelectorAll('#cat-tbody tr').forEach((tr, i) => {
    const num = tr.querySelector('.cat-num');
    if (num) num.textContent = i + 1;
  });
}

function catUpdateCount() {
  const cnt = document.getElementById('cat-count');
  if (cnt) cnt.textContent = document.querySelectorAll('#cat-tbody tr').length + ' ligne(s)';
}

function catHideAC() { if (_catAC) { _catAC.remove(); _catAC = null; } }

function catShowAC(input, colKey, e) {
  catHideAC();
  const q = input.value.trim().toLowerCase();
  if (q.length < 1) return;
  
  let suggestions = [];
  const col = CAT_COLS.find(c => c.key === colKey);
  if (col && col.opts && col.opts.length) {
    suggestions = col.opts.filter(o => o.toLowerCase().includes(q));
  }
  if (colKey === 'type') {
    const catEl = input.closest('tr')?.querySelector('[data-col="cat"]');
    const typeList = CAT_TYPES[catEl?.value || ''] || Object.values(CAT_TYPES).flat();
    suggestions = [...new Set(typeList)].filter(o => o.toLowerCase().includes(q));
  }
  if (!suggestions.length) return;

  const rect = input.getBoundingClientRect();
  const div = document.createElement('div');
  div.className = 'cat-ac';
  div.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${rect.left}px;min-width:${rect.width}px`;
  suggestions.slice(0, 8).forEach(s => {
    const item = document.createElement('div');
    item.className = 'cat-ac-item';
    item.textContent = s;
    item.onclick = () => { input.value = s; catHideAC(); _dirty = true; };
    div.appendChild(item);
  });
  document.body.appendChild(div);
  _catAC = div;
}

function catHandleACKey(e) {
  if (!_catAC) return;
  const items = _catAC.querySelectorAll('.cat-ac-item');
  const active = _catAC.querySelector('.active');
  const idx = [...items].indexOf(active);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)]?.classList.add('active'); active?.classList.remove('active'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(idx - 1, 0)]?.classList.add('active'); active?.classList.remove('active'); }
  if (e.key === 'Enter' && active) { e.preventDefault(); active.click(); }
  if (e.key === 'Escape') catHideAC();
}

function catCollect() {
  const rows = [];
  document.querySelectorAll('#cat-tbody tr').forEach(tr => {
    const get = k => tr.querySelector(`[data-col="${k}"]`)?.value.trim() || '';
    const cat = get('cat'); const type = get('type');
    if (!cat && !type) return;
    rows.push({
      "Catégorie de données": cat,
      "Type d'informations": type,
      "Autres types d'informations recueillis": get('autres'),
      "Origine de la donnée": get('orig'),
      "Autres origines de la source": get('orig_a'),
      "Est elle utilisée pour la finalité du traitement ?": get('final'),
      "Sources de données": get('src'),
      "Autres sources": get('src_a'),
      "Durée de conservation de la donnée (mois)": get('duree') || '0',
    });
  });
  return rows;
}

function catLoad(rows) {
  const tbody = document.getElementById('cat-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows || !rows.length) return;
  const keyMap = { cat: "Catégorie de données", type: "Type d'informations", autres: "Autres types d'informations recueillis", orig: "Origine de la donnée", orig_a: "Autres origines de la source", final: "Est elle utilisée pour la finalité du traitement ?", src: "Sources de données", src_a: "Autres sources", duree: "Durée de conservation de la donnée (mois)" };
  rows.forEach(row => {
    const data = {};
    Object.entries(keyMap).forEach(([k, v]) => { data[k] = row[v] || ''; });
    catAddRow(data);
  });
}

// ── IMPORTS & EXPORTS ──────────────────────────────────────────────────────
function catShowPaste() {
  const z = document.getElementById('cat-paste-zone');
  if (!z) return;
  z.style.display = z.style.display === 'none' ? 'block' : 'none';
  if (z.style.display === 'block') document.getElementById('cat-paste-input').focus();
}

function catParsePaste() {
  const input = document.getElementById('cat-paste-input');
  const raw = input?.value.trim() || '';
  if (!raw) return;
  const lines = raw.split('\n').filter(l => l.trim());
  const keys = ['cat', 'type', 'autres', 'orig', 'orig_a', 'final', 'src', 'src_a', 'duree'];
  lines.forEach(line => {
    const cols = line.split('\t').map(c => c.trim().replace(/\r/g, ''));
    const data = {};
    keys.forEach((k, i) => { if (cols[i] !== undefined) data[k] = cols[i]; });
    catAddRow(data);
  });
  input.value = '';
  document.getElementById('cat-paste-zone').style.display = 'none';
  if (typeof toast === 'function') toast(`✓ ${lines.length} ligne(s) importée(s)`);
}

async function checkServer() {
  const dot = document.getElementById('srv-dot');
  const txt = document.getElementById('srv-txt');
  if (!dot) return;
  dot.style.background = '#d97706'; txt.textContent = 'Vérification...';
  try {
    const resp = await fetch(CHECK_SERVER, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      dot.style.background = '#22c55e';
      txt.textContent = '✅ Connecté au serveur principal';
      const sendBtn = document.getElementById('btn-send-anpdp');
      if (sendBtn) sendBtn.disabled = false;
    }
  } catch (e) {
    dot.style.background = '#ef4444';
    txt.textContent = '❌ Erreur de connexion au serveur';
    const sendBtn = document.getElementById('btn-send-anpdp');
    if (sendBtn) sendBtn.disabled = true;
  }
}

function catImportExcel(e) { /* Placeholder for XLSX reader logic */ }
function dlJSON() { /* Placeholder for JSON download logic using collectData */ }
async function dlExcel() { /* Placeholder for fetch(EXCEL_SERVER) logic */ }
async function sendToANPDP() { /* Placeholder for fetch(SEND_SERVER) logic */ }
