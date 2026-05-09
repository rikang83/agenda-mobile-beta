const firebaseConfig = { databaseURL: "https://agenda-2026-eceb7-default-rtdb.europe-west1.firebasedatabase.app/" };
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let giornoCorrente = "";
let datiGiorno = {};
let giorniSelezionatiRep = [];
let myChart = null;
let notifCount = 0;
let vistaAttuale = 'g'; // 'g' sta per giorno, 'm' per mese

const orariFissi = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
const colMap = { ric:['#2196f3','R'], a:['#4caf50','A'], d:['#ff9800','D'], v:['#fbc02d','V'], def:['#ddd',''] };
const festivi2026 = { "01-01":"Capodanno", "01-06":"Epifania", "04-05":"Pasqua", "04-06":"Pasquetta", "04-25":"Liberazione", "05-01":"Festa Lavoro", "06-02":"Festa Rep.", "08-15":"Ferragosto", "11-01":"Ognissanti", "12-08":"Immacolata", "12-25":"Natale", "12-26":"S. Stefano" };

const categories = [
    { label: 'Matrimoni', keys: ['matrimonio', 'matrimoni'], color: '#1a237e' },
    { label: 'Battesimi', keys: ['battesimo', 'battesimi'], color: '#03a9f4' },
    { label: 'Cresime', keys: ['cresima', 'cresime'], color: '#9c27b0' },
    { label: 'Comunioni', keys: ['comunione', 'comunioni'], color: '#e91e63' },
    { label: 'Compleanni', keys: ['compleanno', 'compleanni'], color: '#ff9800' },
    { label: 'Laurea', keys: ['laurea', 'lauree'], color: '#d32f2f' },
    { label: 'In Studio', keys: ['in studio'], color: '#4caf50' }
];

// --- LOGICA TAB CHIRURGICA ---
document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        setTimeout(() => {
            const el = document.activeElement;
            if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
                const val = el.value;
                if (val.includes(':')) {
                    const pos = val.indexOf(':') + 2;
                    el.setSelectionRange(pos, pos);
                }
            }
        }, 10);
    }
});

// --- LOGICA NOTIFICHE ---
// Helper: restituisce il timestamp di lettura di una notifica, o null se non letta.
// Tiene conto sia delle letture singole (click) sia del "segna tutte come lette".
function getNotifReadTime(key, n) {
    const individuale = localStorage.getItem('read_' + key);
    if (individuale) {
        // Formato nuovo: timestamp numerico. Formato legacy ('true'): la consideriamo letta "adesso"
        // (verrà cancellata fra 24h da ora, non retroattivamente).
        if (individuale === 'true') {
            const ts = Date.now();
            localStorage.setItem('read_' + key, String(ts));
            return ts;
        }
        const parsed = parseInt(individuale);
        if (!isNaN(parsed)) return parsed;
    }
    const massivo = parseInt(localStorage.getItem('notifiche_lette_timestamp')) || 0;
    if (massivo > 0 && n && n.timestamp <= massivo) return massivo;
    return null;
}

function setupNotifiche() {
    const list = document.getElementById('notif-list');
    db.ref('notifiche_log').orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
        const logs = snapshot.val() || {};
        list.innerHTML = "";
        let unread = 0;
        const oraAttuale = Date.now();
        const VENTIQUATTRORE = 86400000;
        Object.keys(logs).reverse().forEach(key => {
            const n = logs[key];
            if (!n) return;
            const readTime = getNotifReadTime(key, n);
            const isRead = readTime !== null;
            
            // Pulizia: cancella SOLO le notifiche già lette da più di 24h.
            // Quelle non lette restano finché non vengono lette.
            if (isRead && (oraAttuale - readTime > VENTIQUATTRORE)) {
                db.ref('notifiche_log/' + key).remove();
                localStorage.removeItem('read_' + key);
                return;
            }
            
            if (!isRead) unread++;
            const item = document.createElement('div');
            item.className = 'notif-item';
            if (!isRead) { item.style.backgroundColor = '#fff9c4'; item.style.borderLeft = '4px solid #2196f3'; } 
            else { item.style.backgroundColor = 'transparent'; item.style.opacity = '0.6'; }
            const dataModifica = new Date(n.timestamp).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            item.innerHTML = `<div style="font-size: 10px; color: #666; margin-bottom: 2px;">Modifica del ${dataModifica} - Giorno ${n.dataGiorno}</div><div style="font-size: 14px; font-weight: bold; color: #333;">${n.testo}</div>`;
            item.onclick = () => {
                // Marca come letta SUBITO e aggiorna il badge senza aspettare
                // un giro dal database (così il numerino sparisce all'istante).
                const giaLetta = isRead;
                if (!giaLetta) {
                    localStorage.setItem('read_' + key, String(Date.now()));
                    notifCount = Math.max(0, notifCount - 1);
                    aggiornaBadge(notifCount);
                    // Riflesso visivo immediato sull'elemento cliccato
                    item.style.backgroundColor = 'transparent';
                    item.style.opacity = '0.6';
                    item.style.borderLeft = 'none';
                }
                if(document.getElementById('vMese').style.display !== 'none') toggleVista('g');
                if (n.dataGiorno) selezionaGiorno(n.dataGiorno, true);
                // Diamo tempo al render di completarsi prima di cercare la riga
                setTimeout(() => {
                    const rigaEl = document.getElementById('slot-' + n.rigaId);
                    if (rigaEl) { 
                        rigaEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
                        rigaEl.style.backgroundColor = '#fff9c4'; 
                        setTimeout(() => rigaEl.style.backgroundColor = 'transparent', 2500); 
                    }
                }, 700);
                closeModal('notifModal');
            };
            list.appendChild(item);
        });
        notifCount = unread;
        aggiornaBadge(unread);
    });
}

function aggiornaBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (count > 0) { badge.innerText = count; badge.style.display = 'flex'; } 
    else { badge.style.display = 'none'; }
}

function toggleNotifiche() { openModal('notifModal'); }

function segnaTutteLette() {
    const ora = Date.now();
    localStorage.setItem('notifiche_lette_timestamp', String(ora));
    notifCount = 0; aggiornaBadge(0);
    document.querySelectorAll('.notif-item').forEach(item => { item.style.backgroundColor = 'transparent'; item.style.opacity = '0.6'; item.style.borderLeft = 'none'; });
}

// Helper unico per creare notifiche dalle modifiche (testo riga, schemi, titoli).
function creaNotifica(rigaId, oraRiga, testo) {
    if (!giornoCorrente) return;
    if (!testo || String(testo).trim().length < 2) return;
    const oraDisplay = (oraRiga && oraRiga !== 'undefined' && oraRiga !== '00:00' && oraRiga !== '0:00') ? oraRiga : '--:--';
    const valore = String(testo).trim();
    db.ref('notifiche_log').push({
        timestamp: Date.now(),
        dataGiorno: giornoCorrente,
        rigaId: rigaId || '',
        oraRiga: oraDisplay,
        testo: `Ora: ${oraDisplay} - ${valore.substring(0, 50)}${valore.length > 50 ? '...' : ''}`
    });
}

// Salva il testo di una riga e crea automaticamente la notifica corrispondente.
function salvaImpegno(itemId, valore, oraVisibile) {
    const update = { t: valore };
    if (oraVisibile && !['undefined', '00:00', '0:00'].includes(oraVisibile)) {
        update.h = oraVisibile;
    }
    db.ref(`agenda/${giornoCorrente}/${itemId}`).update(update);
    creaNotifica(itemId, oraVisibile, valore);
}

// --- FUNZIONI CORE ---
function cleanH(h) { return parseInt((h||"").replace(":","")) || 0; }
function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function initCalendar() {
    const mp = document.getElementById('monthPicker');
    if(!mp.options.length) {
        ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].forEach((m, i) => mp.add(new Option(m+" 2026", `2026-${String(i+1).padStart(2,'0')}`)));
        mp.value = `2026-${String(new Date().getMonth()+1).padStart(2,'0')}`;
        const si = document.getElementById('repHInizio'); const sf = document.getElementById('repHFine');
        orariFissi.forEach(h => { si.add(new Option(h, h)); sf.add(new Option(h, h)); });
        setupNotifiche();
    }
    const [y, m] = mp.value.split('-').map(Number);
    const strip = document.getElementById('strip'); strip.innerHTML = "";
    const corpo = document.getElementById('corpoMese'); corpo.innerHTML = "";
    let primoGiorno = new Date(y, m-1, 1).getDay(); 
    let offset = primoGiorno === 0 ? 6 : primoGiorno - 1;
    for(let s=0; s<offset; s++) { corpo.innerHTML += `<div class="cell-mese empty"></div>`; }
    for(let d=1; d<=new Date(y, m, 0).getDate(); d++) {
        const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dObj = new Date(iso);
        const festName = festivi2026[iso.substring(5)];
        const isDomenica = dObj.getDay() === 0;
        const festClass = festName ? 'nat-holiday' : (isDomenica ? 'holiday' : '');
        const ds = document.createElement('div'); ds.className = `day-item ${festClass}`; ds.id = "st-"+iso;
        ds.innerHTML = `<small>${["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][dObj.getDay()]}</small><br><b>${d}</b>`;
        ds.onclick = () => selezionaGiorno(iso); strip.appendChild(ds);
        const dc = document.createElement('div'); dc.className = `cell-mese ${festClass}`;
        dc.innerHTML = `<div class="cell-header"><span class="num-giorno">${d}</span><button class="btn-del-mese-clean" onclick="pulisciTuttoGiorno('${iso}', event)" style="background:none; border:none; cursor:pointer;">🗑️</button></div>${festName ? `<div style="font-size:9px; color:red; font-weight:bold;">${festName}</div>` : ''}<div id="m-tit-${iso}" style="font-size:10px; font-weight:bold; margin-top:2px; padding:2px; border-radius:3px;"></div><div id="m-list-${iso}" style="margin-top:2px;"></div>`;
        dc.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { toggleVista('g'); selezionaGiorno(iso, true); } };
        corpo.appendChild(dc);
        db.ref('titoli/'+iso).on('value', s => { 
            const el = document.getElementById('m-tit-'+iso); 
            if(el) {
                const val = (s.val() || "").toUpperCase();
                el.innerText = val; el.style.display = val ? "block" : "none"; el.style.backgroundColor = "#eeeeee"; el.style.color = "#333";
                categories.forEach(cat => { if(cat.keys.some(key => val.includes(key.toUpperCase()))) { el.style.backgroundColor = cat.color; el.style.color = "white"; } });
            } 
        });
        db.ref('agenda/'+iso).on('value', s => {
            const box = document.getElementById('m-list-'+iso); if(!box) return; box.innerHTML = "";
            const data = s.val() || {};
            Object.values(data).sort((a,b)=> cleanH(a.h)-cleanH(b.h)).forEach(v => {
                let testoBreve = v.isBattesimoBlock ? "BATTESIMO" : (v.isWedBlock ? "MATRIMONIO" : (v.isWed ? "MATRIMONIO" : (v.t ? v.t.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase() : "")));
                if(testoBreve) { const item = document.createElement('div'); item.className = "item-mese"; item.style.backgroundColor = (colMap[v.c] ? colMap[v.c][0] : colMap.def[0]); item.innerHTML = `${v.h && v.h !== '00:00' ? v.h : ''} ${testoBreve}`; box.appendChild(item); }
            });
        });
    }
    if(!giornoCorrente) selezionaGiorno(new Date().toISOString().split('T')[0], true);
}

async function selezionaGiorno(data, scroll = false) {
    // 1. Rimuovi i vecchi listener per non accumulare processi in background
    if(giornoCorrente) { 
        db.ref('agenda/'+giornoCorrente).off(); 
        db.ref('config/'+giornoCorrente).off(); 
        db.ref('titoli/'+giornoCorrente).off();
    }
    
    giornoCorrente = data;

    // 2. Aggiornamento UI immediato (senza attendere il database)
    document.querySelectorAll('.day-item.active').forEach(i => i.classList.remove('active'));
    const att = document.getElementById('st-'+data); 
    if(att) { 
        att.classList.add('active'); 
        if(scroll) {
            att.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" }); 
        }
    }

    // 3. Real-time listener su agenda + config (così click sui tondini colore
    //    si vedono subito, senza bisogno di refresh)
    db.ref('titoli/'+data).on('value', s => {
        const titoloEl = document.getElementById('titoloGiorno');
        if (titoloEl && document.activeElement !== titoloEl) {
            titoloEl.value = s.val() || "";
        }
    });

    db.ref('config/'+data).on('value', s => {
        const conf = s.val() || {};
        const checkOra = document.getElementById('checkOrarioLabel');
        if (checkOra) checkOra.checked = conf.mostraOra !== false;
        const checkRighe = document.getElementById('checkRighe');
        if (checkRighe) checkRighe.checked = conf.mostraRighe !== false;
    });

    db.ref('agenda/'+data).on('value', s => {
        datiGiorno = s.val() || {};
        renderGiorno();
    });
}

function renderGiorno() {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT") && active.type !== "checkbox") return;
    const container = document.getElementById('listaImpegni'); const scrollPos = window.scrollY; container.innerHTML = "";
    
    // Se nel giorno esiste già uno schema (matrimonio/battesimo), le righe orarie
    // vuote NON vanno mai mostrate, e il toggle R viene sincronizzato visivamente.
    const haSchemaCaricato = Object.values(datiGiorno).some(it => it && (it.isWedBlock || it.isBattesimoBlock));
    const checkRigheEl = document.getElementById('checkRighe');
    if (haSchemaCaricato && checkRigheEl && checkRigheEl.checked) {
        checkRigheEl.checked = false;
    }
    
    const mostraTutteRighe = !haSchemaCaricato && checkRigheEl && checkRigheEl.checked;
    const mostraEtichettaOra = true;
let visualizzazione = {};
    if(mostraTutteRighe) orariFissi.forEach(h => { const id = "h" + h.replace(":", ""); visualizzazione[id] = { id: id, h: h, t: "", c: "def", sortKey: cleanH(h) }; });
    Object.keys(datiGiorno).forEach(key => {
        const item = datiGiorno[key];
        // Se la riga corrisponde a uno slot orario fisso (h0900, h0930, ...),
        // recupera l'orario base così non si perde quando l'utente salva solo il testo.
        const baseSlot = visualizzazione[key];
        const baseH = baseSlot ? baseSlot.h : null;
        // Considera "vuoti" anche i valori spazzatura lasciati dalle vecchie versioni.
        const itemHValido = item.h && item.h !== 'undefined' && item.h !== '00:00' && item.h !== '0:00';
        const effectiveH = itemHValido ? item.h : (baseH || item.h || '');
        const sortKey = item.sort
            || cleanH(item.h)
            || (baseH ? cleanH(baseH) : 0)
            || 999;
        visualizzazione[key] = { id: key, ...item, h: effectiveH, sortKey: sortKey };
    });
    const sorted = Object.values(visualizzazione).sort((a,b) => a.sortKey - b.sortKey);
    sorted.forEach((item) => {
        if(item.t || mostraTutteRighe || item.isAdmin || item.isBattesimoBlock || item.isWedBlock || item.id.startsWith("ex") || item.id.startsWith("rep_")) {
            
if(item.isBattesimoBlock) {
    const div = document.createElement('div'); div.className = "macro-battesimo"; div.id = "slot-" + item.id;
    // Celeste per il Battesimo
    div.style.border = "2px solid #03a9f4"; 
    div.innerHTML = `<div class="titolo-battesimo" style="background:#03a9f4; color:white; padding:10px; display:flex; align-items:center; justify-content:space-between;">
    <div style="width:30px;"></div> <input type="text" value="${item.titolo_bat || 'BATTESIMO'}" 
           style="background:none; border:none; color:white; font-weight:900; text-align:center; flex:1; outline:none; font-family:inherit; font-size:18px;" 
           onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_bat:this.value})">
    <button onclick="eliminaRiga('${item.id}')" style="background:none; border:none; color:white; cursor:pointer; font-size:18px; width:30px; display:flex; justify-content:center;">🗑️</button>
</div>
        <div style="display:grid; gap:10px; padding:10px;">
            ${['cerimonia', 'ricevimento'].map(key => `
                <div class="slot-main" style="background:white; padding:10px; border-radius:10px;">
                    <div class="ora-box"><input type="text" class="ora-input" placeholder="--:--" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div>
                    <div style="flex:1">
                        <textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea>
                        <div class="color-dots">
                            ${Object.keys(colMap).filter(k=>k!='def').map(k=>`
                                <div class="dot ${item[key+'_c']===k?'active':''}" 
                                     style="background:${colMap[k][0]}" 
                                     onclick="cambiaColoreCampo('${item.id}','${key}_c','${k}')">
                                     ${colMap[k][1]}
                                </div>`).join('')}
                        </div>
                    </div>
                </div>`).join('')}
            
            <div class="slot-main" style="background:white; padding:10px; border-radius:10px;">
                <div style="flex:1">
                    <textarea class="nota-input" placeholder="NOTE" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || ''}</textarea>
                    <div class="color-dots">
                        ${Object.keys(colMap).filter(k=>k!='def').map(k=>`
                            <div class="dot ${item.note_c===k?'active':''}" 
                                 style="background:${colMap[k][0]}" 
                                 onclick="cambiaColoreCampo('${item.id}','note_c','${k}')">
                                 ${colMap[k][1]}
                            </div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="admin-block" style="border-color:#03a9f4;">
                <div class="admin-top-row">
                    <div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div>
                    <input type="text" class="input-adm" style="width:120px;" placeholder="FOTOGRAFO" value="${item.op_foto||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_foto:this.value})">
                    <div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div>
                    <input type="text" class="input-adm" style="width:120px;" placeholder="OPERATORE" value="${item.op_video||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({op_video:this.value})">
                </div>
                <div class="admin-grid">
                    <div class="admin-label-row">ACCONTO</div>
                    <input type="number" class="input-adm" style="width:70px" value="${item.acc1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({acc1:this.value})">
                    <input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item.dat1||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({dat1:this.value})">
                    <div class="adm-dots">
                        ${['ric','a','d'].map(k => `
                            <div class="dot-s ${item.chi1===k?'active':''}" 
                                 style="background:${colMap[k][0]}" 
                                 onclick="cambiaColoreCampo('${item.id}','chi1','${k}')">
                                 ${colMap[k][1]}
                            </div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;
    container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize); return;
}

// --- SOSTITUISCI IL BLOCCO if(item.isWedBlock) CON QUESTO ---

if(item.isWedBlock) {
    const div = document.createElement('div'); 
    div.className = "macro-matrimonio";
    div.id = "slot-" + item.id;
    
    // RIMUOVI O COMMENTA QUESTE RIGHE:
    // div.style.borderRadius = "15px";  <-- Rimuovi
    // div.style.overflow = "hidden";    <-- Rimuovi
    // div.style.marginBottom = "20px";  <-- Rimuovi (la gestiremo nel CSS)

    div.innerHTML = `
<div class="titolo-battesimo">
    <!-- 1. Spazio vuoto a sinistra per centrare perfettamente il titolo -->
    <div style="width:30px;"></div> 

    <!-- 2. Input del Titolo -->
    <input type="text" value="${item.titolo_wed || 'MATRIMONIO'}" 
           style="background:none; border:none; color:white; font-weight:900; text-align:center; flex:1; outline:none; font-family:inherit; font-size:18px; text-transform:uppercase;" 
           onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({titolo_wed:this.value})">
    
    <!-- 3. Bottone Cestino centrato -->
    <button onclick="del('${item.id}')" 
            style="background:none; border:none; color:white; cursor:pointer; font-size:18px; width:30px; display:flex; align-items:center; justify-content:center; padding:0; margin:0;">
        🗑️
    </button>
</div>
  
    <div style="display:grid; gap:10px; padding:10px;">
        
        ${['sposo','sposa'].map(k => `
        <div class="slot-main" style="background:white; padding:10px; border-radius:10px; border-left: 5px solid #1a237e;">
            <div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[k+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_h']:this.value})"></div>
            <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
                <div style="display:flex; gap:10px;">
                    <textarea class="nota-input" style="flex:2; font-weight:bold; font-size:16px;" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_t']:this.value})">${item[k+'_t']||(k.toUpperCase()+': ')}</textarea>
                    <textarea class="nota-input" style="flex:1; font-weight:bold; font-size:16px;" placeholder="TEL:" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_tel']:this.value})">${item[k+'_tel']||'TEL: '}</textarea>
                </div>
                <textarea class="nota-input" style="font-weight:bold; font-size:16px; border-top:1px dashed #eee;" placeholder="VIA:" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${k}_via']:this.value})">${item[k+'_via']||'VIA: '}</textarea>
            </div>
        </div>`).join('')}

        ${['chiesa', 'sala'].map(key => `
        <div class="slot-main" style="background:white; padding:10px; border-radius:10px; border-left: 5px solid #3949ab;">
            <div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div>
            <div style="flex:1">
                <textarea class="nota-input" style="font-weight:bold; font-size:16px;" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || (key.toUpperCase()+': ')}</textarea>
            </div>
        </div>`).join('')}
        
        <div class="esterni-grid" style="background:white; padding:10px; border-radius:10px; border:1px solid #1a237e;">
            <div class="esterni-header-label" style="color:#1a237e; font-weight:900;">ESTERNI</div>
            ${[1,2,3,4,5].map(i => `
                <input type="text" class="loc-input" placeholder="Ora" value="${item['loc_h'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_h'+${i}]:this.value})">
                <input type="text" class="loc-input" placeholder="Location" value="${item['loc_t'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_t'+${i}]:this.value})">
            `).join('')}
        </div>
        
        <div class="slot-main" style="background:white; padding:10px; border-radius:10px;">
            <textarea class="nota-input" style="font-weight:bold; font-size:16px;" placeholder="NOTE" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({note_t:this.value})">${item.note_t || 'NOTE: '}</textarea>
        </div>
        
        <div class="admin-block" style="border-color:#1a237e; background:#f5f5f5;">
            <div class="admin-top-row">
                <div class="admin-item">CONTRATTO <input type="checkbox" ${item.contratto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({contratto:this.checked})"></div>
                <div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div>
                <div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div>
                <input type="text" class="input-adm" style="width:120px;" placeholder="OPERATORE" value="${item.operatore||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({operatore:this.value})">
            </div>
            <div class="admin-grid">
                ${[1,2,3,4,5,6].map(i => `
                <div class="admin-label-row">ACC. ${i}</div>
                <input type="number" class="input-adm" style="width:70px" value="${item['acc'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['acc'+${i}]:this.value})">
                <input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item['dat'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['dat'+${i}]:this.value})">
                <div class="adm-dots">
                    ${['ric','a','d'].map(k => `
                    <div class="dot-s ${item['chi'+i]===k?'active':''}" 
                         style="background:${colMap[k][0]}" 
                         onclick="cambiaColoreCampo('${item.id}','chi${i}','${k}')">
                         ${colMap[k][1]}
                    </div>`).join('')}
                </div>`).join('')}
            </div>
        </div>
    </div>`;
    container.appendChild(div); 
    div.querySelectorAll('textarea').forEach(autoResize); 
    return;
}

            const div = document.createElement('div'); div.className = "slot"; div.id = "slot-" + item.id;
            div.style.borderLeftColor = colMap[item.c]?.[0] || colMap.def[0];
            let contentHTML = "";
            if(item.isAdmin) {
                contentHTML = `<div class="admin-block"><div class="admin-top-row"><div class="admin-item">CONTRATTO <input type="checkbox" ${item.contratto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({contratto:this.checked})"></div><div class="admin-item">FOTO <input type="checkbox" ${item.foto?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({foto:this.checked})"></div><div class="admin-item">VIDEO <input type="checkbox" ${item.video?'checked':''} onchange="db.ref('agenda/${giornoCorrente}/${item.id}').update({video:this.checked})"></div><input type="text" class="input-adm" placeholder="OPERATORE" value="${item.operatore||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({operatore:this.value})"></div><div class="admin-grid">`;
                for(let i=1; i<=6; i++) { contentHTML += `<div class="admin-label-row">${i===1?'1° ACCONTO':i+'° ACCONTO'}</div><input type="number" class="input-adm" style="width:70px" value="${item['acc'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['acc'+${i}]:this.value})"><input type="text" class="input-adm" style="width:100px" placeholder="DATA" value="${item['dat'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['dat'+${i}]:this.value})"><div class="adm-dots">${['ric','a','d'].map(k => `<div class="dot-s ${item['chi'+i]===k?'active':''}" style="background:${colMap[k][0]}" onclick="db.ref('agenda/${giornoCorrente}/${item.id}').update({['chi'+${i}]:'${k}'})">${colMap[k][1]}</div>`).join('')}</div>`; }
                contentHTML += `</div></div>`;
            } 
            else if(item.isWed && (item.t.startsWith("SPOSO:") || item.t.startsWith("SPOSA:"))) {
                const tid = item.id+"_tel"; const vid = item.id+"_via";
                contentHTML = `
                    <div class="slot-main">
                        <div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div>
                        <div style="flex:1; display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; gap:10px;">
                                <textarea class="nota-input" style="flex:2; font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea>
                                <textarea class="nota-input" style="flex:1; font-weight:bold; font-size:16px;" placeholder="TEL:" onblur="salvaCampo('${tid}','t',this.value,'${item.h}',true)">${(datiGiorno[tid]?.t||'TEL: ')}</textarea>
                            </div>
                            <textarea class="nota-input" style="font-weight:bold; font-size:16px; border-top:1px dashed #eee;" placeholder="VIA:" onblur="salvaCampo('${vid}','t',this.value,'${item.h}',true)">${(datiGiorno[vid]?.t||'VIA: ')}</textarea>
                        </div>
                    </div>`;
            } 
            else if(item.isWed && (item.t.startsWith("CHIESA:") || item.t.startsWith("SALA:") || item.t.startsWith("NOTE:"))) {
                contentHTML = `<div class="slot-main"><div class="ora-box"><input type="text" class="ora-input" value="${item.h==='00:00'?'':item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><div style="flex:1"><textarea class="nota-input" style="font-weight:bold; font-size:16px;" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div></div>`;
            } else if(item.isWed && item.t.startsWith("ESTERNI:")) {
                contentHTML = `<div class="esterni-grid"><div class="esterni-header-label">ESTERNI</div>${[1,2,3,4,5].map(i => `<input type="text" class="loc-input" placeholder="Ora" value="${item['loc_h'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_h'+${i}]:this.value})"><input type="text" class="loc-input" placeholder="Location" value="${item['loc_t'+i]||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['loc_t'+${i}]:this.value})">`).join('')}</div>`;
            } else if (item.id.endsWith("_tel") || item.id.endsWith("_via")) { return; }
            else { contentHTML = `<div class="slot-main"><div class="ora-box ${(!mostraEtichettaOra && !item.isWed)?'hidden':''}"><input type="text" class="ora-input" value="${item.h}" onblur="salvaCampo('${item.id}','h',this.value,'${item.h}')"></div><textarea class="nota-input" oninput="autoResize(this)" onblur="salvaCampo('${item.id}','t',this.value,'${item.h}')">${item.t}</textarea></div>`; }
            // --- COPIA E SOSTITUISCI IL BLOCCO div.innerHTML ---
const oraVisibile = (item.h && item.h !== 'undefined' && item.h !== '00:00' && item.h !== '0:00') ? item.h : '';
// oraDaSalvare: quello che scriviamo nel DB quando l'utente modifica il testo.
// Include il fallback orariFissi, così gli slot fissi mantengono sempre il loro orario.
const oraDaSalvare = (oraVisibile || '').replace(/'/g, "\\'");
div.innerHTML = `
    <div style="display:flex; flex-direction:column; width:100%;">
        
        <!-- PARTE SUPERIORE: ORARIO E TESTO -->
        <div style="display:flex; align-items:flex-start; width:100%; gap:10px;">
            <div class="ora-box">
                <input type="text" class="ora-input" placeholder="--:--" value="${oraVisibile}" 
                       onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({h:this.value})">
            </div>
            <input type="text" class="nota-input" style="flex:1;" value="${item.t || ''}" 
                   onblur="salvaImpegno('${item.id}', this.value, '${oraDaSalvare}')">
        </div>

        <!-- PARTE INFERIORE: BOTTONI (WhatsApp a sinistra, Colori a destra) -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px; width:100%;">
            
            <!-- WHATSAPP ALLINEATO A SINISTRA (Sotto l'orario) -->
            <div onclick="inviaPromemoriaRiga('${item.id}')" 
                 style="width:30px; height:30px; border-radius:50%; background:#f0f0f0; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-left:15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <svg viewBox="0 0 448 512" width="18" height="18" fill="#25D366">
                    <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-5.6-2.8-23.6-8.7-45-27.7-16.6-14.8-27.8-33.1-31.1-38.6-3.2-5.6-.3-8.6 2.5-11.4 2.5-2.5 5.5-6.5 8.3-9.7 2.8-3.3 3.7-5.6 5.6-9.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 13.2 5.8 23.5 9.2 31.6 11.8 13.3 4.2 25.4 3.6 35 2.2 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                </svg>
            </div>

            <!-- TONDINI COLORI E CESTINO ALLINEATI A DESTRA -->
            <div class="color-dots" style="display:flex; align-items:center; gap:8px;">
                ${(!item.isWed && !item.isAdmin) ? Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}')">${colMap[k][1]}</div>`).join('') : ''}
                <button onclick="del('${item.id}')" style="background:none; border:none; cursor:pointer; font-size:18px; margin-left:5px;">🗑️</button>
            </div>
        </div>
    </div>
`;
            container.appendChild(div); div.querySelectorAll('textarea').forEach(autoResize);
        }
    });
    window.scrollTo(0, scrollPos);
}

function cambiaColoreMultiplo(id, campoC, colore) { 
    // Recuperiamo il valore attuale dal database locale
    const valoreAttuale = datiGiorno[id] ? datiGiorno[id][campoC] : 'def';
    
    // Se clicchiamo lo stesso colore, torniamo a 'def', altrimenti impostiamo il nuovo
    const nuovoValore = (valoreAttuale === colore) ? 'def' : colore;
    
    db.ref(`agenda/${giornoCorrente}/${id}`).update({
        [campoC]: nuovoValore
    }); 
}

function salvaCampo(id, campo, valore, oraDef, isSub=false) { 
    const up = {[campo]:valore}; 
    const mainId = id.replace('_tel', '').replace('_via', '');
    const oraInput = document.querySelector(`#slot-${mainId} .ora-input`)?.value || oraDef;
    if(oraInput !== undefined) up.h = oraInput; 
    if(isSub) up.isSub=true; 
    db.ref(`agenda/${giornoCorrente}/${id}`).update(up); 
    
    if (campo === 't' && valore.trim().length > 1 && !isSub) { 
        let testoSoggetto = valore;
        if(id.includes("m") && (valore.startsWith("SPOSO:") || valore.startsWith("SPOSA:"))) {
            testoSoggetto = valore;
        } else if (id.includes("m")) {
            const sposoKey = Object.keys(datiGiorno).find(k => k.endsWith("_1") && datiGiorno[k].t);
            if(sposoKey) testoSoggetto = datiGiorno[sposoKey].t.replace("SPOSO:","").trim() + " - " + valore;
        }

        db.ref('notifiche_log').push({ 
            timestamp: Date.now(), 
            dataGiorno: giornoCorrente, 
            rigaId: mainId, 
            oraRiga: oraInput || '00:00', 
            testo: "Ora: " + (oraInput || '00:00') + " - " + testoSoggetto.substring(0, 40) + (testoSoggetto.length > 40 ? '...' : '') 
        }); 
    }
}

function cambiaColore(id, c) { 
    // 1. Identifichiamo il tondino cliccato tramite l'evento
    const tondinoCliccato = event.target;
    
    // 2. Logica di calcolo valore (Toggle)
    const newVal = (datiGiorno[id] && datiGiorno[id].c === c) ? 'def' : c; 

    // 3. FEEDBACK ISTANTANEO (Risolve il problema refresh)
    if (tondinoCliccato && tondinoCliccato.classList.contains('dot')) {
        const parent = tondinoCliccato.parentElement;
        // Spegniamo tutti i tondini della riga
        parent.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
        
        // Se il nuovo valore non è default, accendiamo quello cliccato
        if (newVal !== 'def') {
            tondinoCliccato.classList.add('active');
        }
    }

    // 4. Salva su Firebase. NON tocchiamo h: il colore non c'entra con l'orario,
    //    e leggere this.value qui rischierebbe di scrivere la stringa "undefined".
    db.ref(`agenda/${giornoCorrente}/${id}`).update({c: newVal}); 
}

// Helper unificato per tutti i tondini "secondari" (matrimonio/battesimo/admin).
// Aggiorna SUBITO la classe .active sul DOM e poi salva su Firebase, così
// l'utente non deve aspettare il giro Firebase->listener->renderGiorno.
function cambiaColoreCampo(itemId, campo, k) {
    const tondino = event.target.closest('.dot, .dot-s');
    
    // Stato attuale dal nostro datiGiorno locale
    const current = (datiGiorno && datiGiorno[itemId]) ? datiGiorno[itemId][campo] : 'def';
    const newVal = (current === k) ? 'def' : k;
    
    // FEEDBACK VISIVO ISTANTANEO
    if (tondino) {
        const parent = tondino.parentElement;
        // Spegniamo i fratelli dello stesso tipo (.dot oppure .dot-s)
        const cls = tondino.classList.contains('dot-s') ? '.dot-s' : '.dot';
        parent.querySelectorAll(cls).forEach(d => d.classList.remove('active'));
        if (newVal !== 'def') tondino.classList.add('active');
        
        // Aggiorniamo anche datiGiorno locale così click ripetuti sul toggle
        // funzionano subito senza dover aspettare il listener Firebase
        if (datiGiorno && datiGiorno[itemId]) {
            datiGiorno[itemId][campo] = newVal;
        }
    }
    
    db.ref(`agenda/${giornoCorrente}/${itemId}`).update({[campo]: newVal});
}

function del(id) {
    if (!giornoCorrente) return;

    if (confirm("Vuoi eliminare definitivamente questo blocco e il relativo titolo del giorno?")) {
        
        // 1. Riferimenti ai percorsi nel database
        const refAgenda = db.ref('agenda/' + giornoCorrente + '/' + id);
        const refTitolo = db.ref('titoli/' + giornoCorrente);

        // 2. Cancellazione parallela di blocco e titolo
        Promise.all([
            refAgenda.remove(),
            refTitolo.remove()
        ])
        .then(() => {
            // 3. Svuota fisicamente il campo di testo del titolo a video
            const inputTitolo = document.getElementById('titoloGiorno');
            if (inputTitolo) {
                inputTitolo.value = "";
            }

            // 4. Rimuovi il blocco dalla memoria locale (datiGiorno)
            if (datiGiorno && datiGiorno[id]) {
                delete datiGiorno[id];
            }
            
            // 5. Ridisegna subito la pagina per far sparire il blocco
            renderGiorno();
            
            console.log("Eliminazione completata: Schema e Titolo rimossi con successo.");
        })
        .catch(error => {
            console.error("Errore durante l'eliminazione:", error);
            alert("Errore tecnico durante la cancellazione.");
        });
    }
}

function salvaStatoOra(v) { db.ref('config/'+giornoCorrente).update({mostraOra:v}); renderGiorno(); }
function salvaStatoRighe(v) { db.ref('config/'+giornoCorrente).update({mostraRighe:v}); renderGiorno(); }
function salvaTitolo(v) { 
    db.ref('titoli/'+giornoCorrente).set(v); 
    creaNotifica('titolo', '', v ? `Titolo: ${v}` : '');
}

function toggleVista(v) {
    const vg = document.getElementById('vGiorno'); const vm = document.getElementById('vMese');
    if (v === 'm') { vg.style.display = 'none'; vm.style.display = 'block'; initCalendar(); setTimeout(() => { vm.scrollLeft = 0; }, 50); } 
    else { vg.style.display = 'block'; vm.style.display = 'none'; }
}

function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function aggiungiRigaExtra() { const id = "ex" + Date.now(); db.ref(`agenda/${giornoCorrente}/${id}`).set({h:"", t:"", c:"def", sort:999}); }

function applicaSchemaMatrimonio() {
    const ts = Date.now(); 
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    
    // Gestione Titolo
    db.ref('titoli/'+giornoCorrente).once('value', s => { 
        let tOld = s.val() || ""; 
        let tNew = tOld ? (tOld.includes("MATRIMONIO") ? tOld : tOld + " E MATRIMONIO") : "MATRIMONIO A "; 
        db.ref('titoli/'+giornoCorrente).set(tNew).then(() => {
            // Aggiorna visivamente il campo titolo in alto
            const ti = document.getElementById('titoloGiorno');
            if(ti) ti.value = tNew;
        }); 
    });

    const id = "wed_" + ts;
    const matData = {
        [id]: {
            isWedBlock: true,
            sort: 1,
            titolo_wed: "MATRIMONIO",
            sposo_h: "", sposo_t: "SPOSO: ", sposo_tel: "TEL: ", sposo_via: "VIA: ",
            sposa_h: "", sposa_t: "SPOSA: ", sposa_tel: "TEL: ", sposa_via: "VIA: ",
            via_t: "VIA: ",
            chiesa_h: "", chiesa_t: "CHIESA: ",
            sala_h: "", sala_t: "SALA: ",
            note_t: "NOTE: ",
            foto: false, video: false, operatore: "",
            acc1: "", dat1: "", chi1: "def",
            acc2: "", dat2: "", chi2: "def",
            acc3: "", dat3: "", chi3: "def",
            acc4: "", dat4: "", chi4: "def",
            acc5: "", dat5: "", chi5: "def",
            acc6: "", dat6: "", chi6: "def"
        }
    };

// Salvataggio e aggiornamento UI immediato
db.ref(`agenda/${giornoCorrente}`).update(matData).then(() => {
    // 1. Aggiorna memoria locale
    if (!datiGiorno) datiGiorno = {};
    datiGiorno[id] = matData[id];

    // --- AGGIUNTA QUI ---
    // Spegne fisicamente i toggle nella pagina
    document.getElementById('checkRighe').checked = false;
    // --------------------

    // 2. Ridisegna tutto
    renderGiorno();
    console.log("Schema Matrimonio applicato");
});

    db.ref('notifiche_log').push({ timestamp: Date.now(), dataGiorno: giornoCorrente, rigaId: id, oraRiga: "00:00", testo: "MATRIMONIO INSERITO" });
    closeModal('mainModal');
}

function applicaSchemaBattesimo() {
    const ts = Date.now(); 
    db.ref('config/'+giornoCorrente).update({mostraOra:false, mostraRighe:false});
    
    // Gestione Titolo
    db.ref('titoli/'+giornoCorrente).once('value', s => { 
        let tOld = s.val() || ""; 
        let tNew = tOld ? (tOld.includes("BATTESIMO") ? tOld : tOld + " E BATTESIMO/I") : "BATTESIMO/I"; 
        db.ref('titoli/'+giornoCorrente).set(tNew).then(() => {
            // Aggiorna visivamente il campo titolo in alto
            const ti = document.getElementById('titoloGiorno');
            if(ti) ti.value = tNew;
        }); 
    });

    const id = "bat_" + ts; 
    const batDataContent = { 
        isBattesimoBlock: true, sort: 1, titolo_bat: "BATTESIMO", 
        cerimonia_h: "", cerimonia_t: "", cerimonia_c: "def", 
        ricevimento_h: "", ricevimento_t: "", ricevimento_c: "def", 
        note_t: "", note_c: "def", foto: false, op_foto: "", 
        video: false, op_video: "", acc1: "", dat1: "", chi1: "def" 
    };
    const batData = { [id]: batDataContent };

    // Salvataggio e aggiornamento UI immediato
    db.ref(`agenda/${giornoCorrente}`).update(batData).then(() => {
        // 1. Aggiorna memoria locale
        if (!datiGiorno) datiGiorno = {};
        datiGiorno[id] = batDataContent;

        // Spegne fisicamente il toggle R (coerenza con schema matrimonio)
        const checkR = document.getElementById('checkRighe');
        if (checkR) checkR.checked = false;

        // 2. Ridisegna tutto
        renderGiorno();
        console.log("Schema Battesimo applicato");
    });

    db.ref('notifiche_log').push({ timestamp: Date.now(), dataGiorno: giornoCorrente, rigaId: id, oraRiga: "00:00", testo: "BATTESIMO INSERITO" });
    closeModal('mainModal');
}

function openRepModal() { 
    // Pulisce il campo testo
    document.getElementById('repTesto').value = ""; 
    
    // Imposta la data di fine a oggi come valore base
    document.getElementById('repDataFine').value = giornoCorrente; 
    
    // Svuota la lista dei giorni scelti (usando il nome coordinato con toggleRepDay)
    giorniSelezionatiRep = []; 
    
    // Rimuove graficamente il viola da tutti i tondini e ripristina lo stile base
    document.querySelectorAll('.dot-day-rep').forEach(d => {
        d.classList.remove('active');
        d.style.backgroundColor = "";
        d.style.color = "";
    });
    
    // Apre effettivamente il modale
    openModal('repModal'); 
}

// NOTA: la dichiarazione di giorniSelezionatiRep è all'inizio del file (line 7).
// Le funzioni toggleRepDay e eseguiRipetizione sono definite più avanti
// (versione consolidata con gestione stile inline robusta).

function cancellaRipetizioniInBlocco() { const df=document.getElementById('repDataFine').value; if(!df||!confirm("Eliminare?")) return; let cur=new Date(giornoCorrente), fine=new Date(df); while(cur<=fine) { let iso=cur.toISOString().split('T')[0]; db.ref(`agenda/${iso}`).once('value', s=>{ let d=s.val(); if(d) Object.keys(d).forEach(k=>{ if(k.startsWith('rep_')) db.ref(`agenda/${iso}/${k}`).remove(); }); }); cur.setDate(cur.getDate()+1); } closeModal('repModal'); }
function pulisciTuttoGiorno(iso, e) { if(e) e.stopPropagation(); if(confirm("Svuotare?")) { db.ref('agenda/'+iso).remove(); db.ref('titoli/'+iso).remove(); db.ref('config/'+iso).remove(); } }

function condividiWhatsApp() {
    if (!giornoCorrente) { alert("Seleziona prima un giorno."); return; }
    const tit = document.getElementById('titoloGiorno').value || "Agenda";
    let msg = `📅 *${tit}* (${giornoCorrente})\n\n`;
    if (datiGiorno) { Object.values(datiGiorno).sort((a,b)=>(a.sort||0)-(b.sort||0)).forEach(i => { if(i.isBattesimoBlock) { msg += `• *${i.titolo_bat || 'BATTESIMO'}*\n${i.cerimonia_h? '*'+i.cerimonia_h+'* ':''}${i.cerimonia_t}\n${i.ricevimento_h? '*'+i.ricevimento_h+'* ':''}${i.ricevimento_t}\n${i.note_t}\n`; } else if(!i.isSub && !i.isAdmin && i.t && i.t.length > 2) { msg += `• ${i.h && i.h !== '00:00' ? '*' + i.h + '* ' : ''}${i.t}\n`; } }); }
    window.open("https://wa.me/?text=" + encodeURIComponent(msg), '_blank');
}

function openChartModal() { openModal('chartModal'); fetchAndDraw(); }
function fetchAndDraw() {
    db.ref().once('value').then(snapshot => {
        const root = snapshot.val() || {};
        const allAgenda = root.agenda || {};
        const allTitoli = root.titoli || {};
        
        const stats = categories.map(() => new Array(12).fill(0));
        let totaleGlobale = 0;

        const giorni2026 = Array.from(new Set([
            ...Object.keys(allAgenda).filter(d => d.startsWith("2026")),
            ...Object.keys(allTitoli).filter(d => d.startsWith("2026"))
        ]));

        giorni2026.forEach(date => {
            const mIdx = parseInt(date.split("-")[1]) - 1;
            const impegniGiorno = Object.values(allAgenda[date] || {});
            const titoloGiorno = (allTitoli[date] || "").toLowerCase().trim();

            categories.forEach((cat, cIdx) => {
                let conteggioGiorno = 0;

                // 1. CONTEGGIO SCHEMI (FILTRO RIGIDISSIMO)
                // Contiamo solo le righe che sono state contrassegnate come "Inizio Blocco"
                // isWedBlock per i matrimoni, isBattesimoBlock per i battesimi
                const numeroSchemi = impegniGiorno.filter(item => {
                    if (cat.label === 'Matrimoni') {
                        // Conta solo se isWedBlock è esattamente true
                        return item.isWedBlock === true;
                    }
                    if (cat.label === 'Battesimi') {
                        return item.isBattesimoBlock === true;
                    }
                    return false;
                }).length;

                if (numeroSchemi > 0) {
                    // Se ci sono blocchi, il valore è il numero di blocchi.
                    // Il titolo viene ignorato.
                    conteggioGiorno = numeroSchemi;
                } else {
                    // 2. SE NON CI SONO SCHEMI, GUARDA IL TITOLO (Caso Giugno)
                    const haParola = cat.keys.some(k => titoloGiorno.includes(k.toLowerCase()));
                    if (haParola) {
                        conteggioGiorno = 1;
                    }
                }

                if (conteggioGiorno > 0) {
                    stats[cIdx][mIdx] += conteggioGiorno;
                    totaleGlobale += conteggioGiorno;
                }
            });
        });

        // Aggiornamento Totale e Grafico
        const displayTot = document.getElementById('totalWorkCount');
        if (displayTot) displayTot.innerText = totaleGlobale;

        const canvas = document.getElementById('workChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (window.myChart) window.myChart.destroy();
        
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
                datasets: categories.map((cat, i) => ({
                    label: cat.label,
                    data: stats[i],
                    borderColor: cat.color,
                    backgroundColor: cat.color,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 5
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
            }
        });
    });
}

window.onload = initCalendar;

// --- SWIPE GLOBALE ---
let touchstartX = 0; 
let touchendX = 0;
let touchstartY = 0;
let touchendY = 0;
let touchTargetIsStrip = false;

// Ascolta su tutta la pagina (document) invece che solo su vMese
document.addEventListener('touchstart', e => { 
    touchstartX = e.changedTouches[0].screenX; 
    touchstartY = e.changedTouches[0].screenY;
    // Se il tocco parte DENTRO la striscia dei giorni, lasciamo che lo scroll
    // orizzontale nativo del browser faccia il suo lavoro: niente swipe gesture.
    touchTargetIsStrip = !!(e.target && e.target.closest && e.target.closest('.calendar-strip'));
}, { passive: true });

document.addEventListener('touchend', e => { 
    touchendX = e.changedTouches[0].screenX; 
    touchendY = e.changedTouches[0].screenY;
    handleGesture(); 
}, { passive: true });

function handleGesture() { 
    // 1. Se l'utente stava scorrendo la striscia, ignoriamo (no effetto calamita)
    if (touchTargetIsStrip) return;
    
    const dx = touchendX - touchstartX;
    const dy = touchendY - touchstartY;
    const sogliaX = 80;
    
    // 2. Se il movimento verticale prevale, è uno scroll, non uno swipe
    if (Math.abs(dy) > Math.abs(dx)) return;
    
    // 3. Soglia minima per distinguere uno swipe vero da un tap rumoroso
    if (Math.abs(dx) < sogliaX) return;
    
    // CAPISCE LA VISTA AUTOMATICAMENTE
    const vMese = document.getElementById('vMese');
    const vista = (vMese && vMese.style.display === 'block') ? 'm' : 'g';

    if (dx < 0) {
        // SWIPE SINISTRA -> AVANTI
        if (vista === 'g') navigaGiorno(1); 
        else cambiaMeseOffset(1);
    } else {
        // SWIPE DESTRA -> INDIETRO
        if (vista === 'g') navigaGiorno(-1); 
        else cambiaMeseOffset(-1);
    } 
}

function navigaGiorno(offset) {
    if (!giornoCorrente) return;
    
    let data = new Date(giornoCorrente);
    data.setDate(data.getDate() + offset);
    
    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    
    const nuovoMese = `${y}-${m}`;
    const nuovoGiornoISO = `${y}-${m}-${d}`;
    
    const mp = document.getElementById('monthPicker');
    
    // Se il giorno appartiene a un mese diverso da quello selezionato
    if (mp.value !== nuovoMese) {
        // Cerchiamo se il nuovo mese esiste nelle opzioni
        let esisteOpzione = Array.from(mp.options).some(opt => opt.value === nuovoMese);
        if (esisteOpzione) {
            mp.value = nuovoMese;
            initCalendar(); // Rigenera lo strip dei giorni
        } else {
            return; // Se il mese non è in lista, non fare nulla
        }
    }
    
    // Seleziona il giorno e attiva lo scroll automatico
    selezionaGiorno(nuovoGiornoISO, true);
    
   // Centra il tondino del giorno nello strip in alto senza attrito
    setTimeout(() => {
        const activeDay = document.querySelector('.day-item.active');
        if (activeDay) {
            activeDay.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
        }
    }, 50); // Tempo ridotto per essere più reattivo
}

function cambiaMeseOffset(offset) { 
    const mp = document.getElementById('monthPicker'); 
    let newIndex = mp.selectedIndex + offset; 
    if (newIndex >= 0 && newIndex < mp.options.length) { 
        mp.selectedIndex = newIndex; 
        initCalendar(); 
    } 
}

function saltaAggiOggi() {
    const oggi = new Date();
    const y = oggi.getFullYear();
    const m = String(oggi.getMonth() + 1).padStart(2, '0');
    const d = String(oggi.getDate()).padStart(2, '0');
    const meseOggi = `${y}-${m}`;
    const isoOggi = `${y}-${m}-${d}`;
    const mp = document.getElementById('monthPicker');
    if (mp.value !== meseOggi) {
        mp.value = meseOggi;
        initCalendar();
        setTimeout(() => {
            toggleVista('g');
            selezionaGiorno(isoOggi, true);
        }, 350);
    } else {
        toggleVista('g');
        selezionaGiorno(isoOggi, true);
    }
}

// --- LOGICA RIPETI E PULISCI ---

function toggleRepDay(el, d) {
    // 1. Impedisci errori se l'array non è inizializzato
    if (typeof giorniSelezionatiRep === 'undefined') {
        window.giorniSelezionatiRep = [];
    }

    const index = giorniSelezionatiRep.indexOf(d);

    if (index > -1) {
        // --- DISATTIVAZIONE ---
        giorniSelezionatiRep.splice(index, 1);
        
        // Rimuoviamo la classe e forziamo lo stile base
        el.classList.remove('active');
        el.style.setProperty('background-color', '#eee', 'important');
        el.style.setProperty('color', '#333', 'important');
    } else {
        // --- ATTIVAZIONE ---
        giorniSelezionatiRep.push(d);
        
        // Aggiungiamo la classe e forziamo il viola (6a1b9a come nel tuo HTML)
        el.classList.add('active');
        el.style.setProperty('background-color', '#6a1b9a', 'important');
        el.style.setProperty('color', '#ffffff', 'important');
    }
    
    // Debug: controlla nella console del browser (F12) se vedi i numeri
    console.log("Giorni selezionati:", giorniSelezionatiRep);
}

function eseguiRipetizione() {
    const testo = document.getElementById('repTesto').value;
    const hInizio = document.getElementById('repHInizio').value;
    const hFine = document.getElementById('repHFine').value;
    const dataFineStr = document.getElementById('repDataFine').value;

    // Usiamo ESATTAMENTE la variabile dei tondini
    if (!testo || giorniSelezionatiRep.length === 0 || !dataFineStr) {
        alert("Attenzione: Inserisci il testo, seleziona i giorni e la data di fine!");
        return;
    }

    const dataFine = new Date(dataFineStr);
    let dataCorrente = new Date(giornoCorrente); 

    while (dataCorrente <= dataFine) {
        if (giorniSelezionatiRep.includes(dataCorrente.getDay())) {
            const dataIso = dataCorrente.toISOString().split('T')[0];
            const nuovoId = "rep-" + Date.now() + Math.random().toString(36).substr(2, 5);
            
            // Salvataggio con le chiavi corte (t, h) per non rompere la tua riga agenda
            firebase.database().ref('agenda/' + dataIso + '/' + nuovoId).set({
                id: nuovoId,
                t: testo,
                h: hInizio,
                hFine: hFine,
                c: 'def',
                sort: hInizio.replace(':', '') 
            });
        }
        dataCorrente.setDate(dataCorrente.getDate() + 1);
    }
    
    alert("Copia completata!");
    closeModal('repModal');

    // RESET VISIVO: Fondamentale per la prossima volta
    giorniSelezionatiRep = [];
    document.querySelectorAll('.dot-day-rep').forEach(dot => {
        dot.classList.remove('active');
        dot.style.backgroundColor = "#eee";
        dot.style.color = "#333";
    });
}

function pulisciPerParolaChiave() {
    const parola = prompt("Quale parola vuoi eliminare da TUTTA l'agenda?");
    if (!parola || parola.trim() === "") return;

    if (confirm("Vuoi davvero eliminare ogni impegno che contiene '" + parola + "'?")) {
        firebase.database().ref('agenda').once('value', (snapshot) => {
            snapshot.forEach((giornoSnap) => {
                giornoSnap.forEach((impegnoSnap) => {
                    const data = impegnoSnap.val();
                    // Controlliamo sia 't' che 'testo' per sicurezza
                    const testoImpegno = data.t || data.testo || "";
                    if (testoImpegno.toLowerCase().includes(parola.toLowerCase())) {
                        impegnoSnap.ref.remove();
                    }
                });
            });
            alert("Pulizia terminata!");
        });
    }
}
// Popola i selettori orari nel modale appena apri l'app
function popolaOrariRipeti() {
    const start = document.getElementById('repHInizio');
    const end = document.getElementById('repHFine');
    if(!start || !end) return;
    
    let options = "";
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            let orario = h.toString().padStart(2, '0') + ":" + m.toString().padStart(2, '0');
            options += `<option value="${orario}">${orario}</option>`;
        }
    }
    start.innerHTML = options;
    end.innerHTML = options;
}

// Avvia il popolamento orari
popolaOrariRipeti();

// ==========================================
// BLOCCO STATISTICHE - VERSIONE ANTI-CRASH
// ==========================================

const CONFIG_ST = [
    // Per Matrimoni e Battesimi i flag isWedBlock/isBattesimoBlock sono il sistema
    // primario di conteggio. Le keys testuali sono usate SOLO sul titolo del giorno
    // come fallback (per giornate senza schema strutturato).
    { label: 'Matrimoni',         color: '#1a237e', keys: ['matrimonio', 'matrimoni', 'wedding'], blockFlag: 'isWedBlock' },
    { label: 'Battesimi',         color: '#64b5f6', keys: ['battesimo', 'battesimi'],             blockFlag: 'isBattesimoBlock' },
    { label: 'Cresime',           color: '#8e24aa', keys: ['cresima', 'cresime'],                 blockFlag: null },
    { label: 'Comunioni',         color: '#d81b60', keys: ['comunione', 'comunioni'],             blockFlag: null },
    { label: 'In Studio',         color: '#689f38', keys: ['studio', 'in studio'],                blockFlag: null },
    { label: '50° Anniversario',  color: '#ffd700', keys: ['50°', '50esimo', 'cinquantesimo'],    blockFlag: null },
    { label: '25° Anniversario',  color: '#c0c0c0', keys: ['25°', '25esimo', 'venticinquesimo'],  blockFlag: null }
];

function openStatsModal() {
    // Chiudi modali aperti
    if (typeof closeModal === "function") {
        closeModal('mainModal');
    } else {
        const m = document.getElementById('mainModal');
        if (m) m.style.display = 'none';
    }

    const chartMod = document.getElementById('chartModal');
    if (chartMod) {
        chartMod.style.display = 'block';
        avviaConteggioPreciso();
    }
}

function avviaConteggioPreciso() {
    const ANNO = "2026"; 
    
    // Carichiamo agenda E titoli in parallelo. La logica è:
    //  - Per ogni categoria, conta prima i blocchi schema (es. isWedBlock).
    //  - Se nel giorno non ci sono blocchi di quella categoria, controlla se il
    //    titolo del giorno contiene una parola chiave: in tal caso conta +1.
    //  - Per le categorie senza blockFlag (Cresime, Comunioni, ...), guarda anche
    //    nel testo dei singoli impegni come ulteriore fallback.
    //  - Niente doppio conteggio: appena una categoria viene trovata in un giorno
    //    si conta una sola volta (eccetto per i blocchi multipli, es. 2 matrimoni).
    Promise.all([
        firebase.database().ref('agenda').once('value'),
        firebase.database().ref('titoli').once('value')
    ]).then(([snapAgenda, snapTitoli]) => {
        const allAgenda = snapAgenda.val() || {};
        const allTitoli = snapTitoli.val() || {};
        const matrix = CONFIG_ST.map(() => new Array(12).fill(0));
        let totale = 0;
        
        const giorni = new Set([
            ...Object.keys(allAgenda).filter(d => d.startsWith(ANNO)),
            ...Object.keys(allTitoli).filter(d => d.startsWith(ANNO))
        ]);
        
        giorni.forEach(giorno => {
            const mIdx = parseInt(giorno.split("-")[1]) - 1;
            if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return;
            
            const impegni = Object.values(allAgenda[giorno] || {})
                .filter(x => x && typeof x === 'object');
            const titolo = String(allTitoli[giorno] || "").toLowerCase().trim();
            
            CONFIG_ST.forEach((cat, cIdx) => {
                let conteggio = 0;
                
                // 1. CONTEGGIO PER STRUTTURA (blocchi schema)
                if (cat.blockFlag) {
                    conteggio = impegni.filter(it => it[cat.blockFlag] === true).length;
                }
                
                // 2. FALLBACK: se nessuno schema è stato trovato, cerca nel titolo
                if (conteggio === 0) {
                    const titoloMatch = cat.keys.some(k => titolo.includes(k.toLowerCase()));
                    if (titoloMatch) {
                        conteggio = 1;
                    } else if (!cat.blockFlag) {
                        // 3. FALLBACK aggiuntivo per categorie senza struttura dedicata:
                        //    cerca le parole chiave nei testi dei singoli impegni.
                        const impegnoMatch = impegni.some(it => {
                            const testi = [it.t, it.titolo_wed, it.titolo_bat, it.note_t, 
                                           it.cerimonia_t, it.ricevimento_t, it.chiesa_t, it.sala_t]
                                          .filter(Boolean)
                                          .map(t => String(t).toLowerCase());
                            return testi.some(t => cat.keys.some(k => t.includes(k.toLowerCase())));
                        });
                        if (impegnoMatch) conteggio = 1;
                    }
                }
                
                if (conteggio > 0) {
                    matrix[cIdx][mIdx] += conteggio;
                    totale += conteggio;
                }
            });
        });
        
        const counter = document.getElementById('totalWorkCount');
        if (counter) counter.innerText = totale;
        disegnaGraficoFinale(matrix);
    }).catch(e => console.error("Errore Statistica:", e));
}

function disegnaGraficoFinale(matrix) {
    const canv = document.getElementById('workChart');
    if (!canv) return;

    if (window.chartIstance) window.chartIstance.destroy();

    window.chartIstance = new Chart(canv.getContext('2d'), {
        type: 'line',
        data: {
            labels: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
            datasets: CONFIG_ST.map((cat, i) => ({
                label: cat.label,
                data: matrix[i],
                borderColor: cat.color,
                backgroundColor: cat.color,
                tension: 0.3,
                fill: false
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function eliminaRiga(id) {
    if (!giornoCorrente) {
        alert("Errore: Giorno corrente non definito!");
        return;
    }

    if (confirm("Vuoi eliminare definitivamente questo blocco e il relativo titolo?")) {
        
        const pathAgenda = 'agenda/' + giornoCorrente + '/' + id;
        const pathTitolo = 'titoli/' + giornoCorrente;

        // Eseguiamo la cancellazione parallela
        Promise.all([
            db.ref(pathAgenda).remove(),
            db.ref(pathTitolo).remove()
        ])
        .then(() => {
            // 1. Svuota fisicamente l'input del titolo a video
            const inputTitolo = document.getElementById('titoloGiorno');
            if (inputTitolo) {
                inputTitolo.value = "";
            }

            // 2. Pulizia memoria locale
            if (datiGiorno && datiGiorno[id]) {
                delete datiGiorno[id];
            }

            // 3. Forza il refresh della grafica
            renderGiorno();
            
            console.log("Cancellazione completata con successo.");
        })
        .catch(error => {
            console.error("Errore Firebase:", error);
            alert("Errore durante la cancellazione.");
        });
    }
}

function inviaPromemoriaRiga(id) {
    // 1. Cerchiamo i dati. 
    // Se non li trova in datiGiorno[id], proviamo a cercarli nell'oggetto globale dell'agenda
    let riga = datiGiorno ? datiGiorno[id] : null;

    // Se la riga è vuota o non ha testo, proviamo a ricostruirla 
    // cercando il valore direttamente dall'input della pagina (metodo più sicuro per le "Ore")
    const testoInput = document.querySelector(`div[id*="${id}"] .nota-input`) || document.querySelector(`.impegno-riga[onclick*="${id}"] .nota-input`);
    const oraInput = document.querySelector(`div[id*="${id}"] .ora-input`) || document.querySelector(`.impegno-riga[onclick*="${id}"] .ora-input`);

    const testo = (riga && riga.t) ? riga.t : (testoInput ? testoInput.value : "");
    const ora = (riga && riga.h) ? riga.h : (oraInput ? oraInput.value : "00:00");

    if (!testo && !oraInput) {
        alert("Non ho trovato dati per questa riga.");
        return;
    }

    // 2. Estrazione numero dal testo (quello che abbiamo appena recuperato)
    let tel = "";
    const regexMigliorata = /(\d[\s.\-]?){8,11}\d/g;
    const matchTel = testo.match(regexMigliorata);
    
    if (matchTel) {
        tel = matchTel[0].replace(/\D/g, '');
    }

    if (!tel || tel.length < 8) {
        tel = prompt("Inserisci il numero del cliente (es: 3331234567):", "");
    }
    
    if (!tel) return;

    tel = tel.replace(/\D/g, '');
    if (!tel.startsWith('39') && tel.length < 11) {
        tel = '39' + tel;
    }

    // 3. Preparazione del link calendario
    let linkCal = "";
    try {
        const d = giornoCorrente.split('-'); 
        const dataCal = d[0] + d[1] + d[2];
        const oraCal = ora.replace(':', '') + "00";
        linkCal = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Appuntamento in Studio")}&dates=${dataCal}T${oraCal}/${dataCal}T${oraCal}`;
    } catch(e) { console.error("Errore data:", e); }

    // 4. MESSAGGIO AMICHEVOLE
    const msg = `Ciao! 😊 Ti ricordo il nostro appuntamento in studio:\n\n📅 *${giornoCorrente}*\n🕒 ore *${ora}*\n\nA presto!\n\nSe vuoi, puoi aggiungerlo al tuo calendario da qui: ${linkCal}`;

    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Funzione per inserire il tasto sottomano nell'header.
// NOTA: la versione attiva è inserisciTastiHeader() definita più sotto,
// che gestisce anche il tasto SPESA. Questa funzione è mantenuta solo
// per retrocompatibilità ma non viene chiamata.
/* function inserisciTastoSottomano() { ... } - rimossa: codice morto */

/* --- POSIZIONAMENTO TASTI --- */
function inserisciTastiHeader() {
    const masterSwitch = document.querySelector('.master-switch');
    const btnModello = document.querySelector('.btn-ripeti');
    
    // 1. TASTO SOTTOMANO (Già funzionante)
    if (masterSwitch && !document.getElementById('btn-st-manuale')) {
        const btnS = document.createElement('button');
        btnS.id = 'btn-st-manuale';
        btnS.className = btnModello ? btnModello.className : 'nav-btn';
        btnS.innerHTML = '📝 SOTTOMANO';
        btnS.onclick = (e) => { e.preventDefault(); openSottomano(); };
        masterSwitch.after(btnS);
    }

    // 2. TASTO SPESA (Logica Rinforzata)
    if (!document.getElementById('btn-lista-spesa')) {
        // Proviamo a trovare un posto nell'header destro
        const contenitoreDestro = document.querySelector('.nav-right') || 
                                  document.querySelector('.header-right') || 
                                  document.querySelector('.header-actions') ||
                                  document.querySelector('.navbar-nav.navbar-right');

        if (contenitoreDestro) {
            const btnL = document.createElement('button');
            btnL.id = 'btn-lista-spesa';
            btnL.className = btnModello ? btnModello.className : 'nav-btn';
            btnL.innerHTML = '🛒 SPESA';
            btnL.onclick = (e) => { e.preventDefault(); openListaSpesa(); };

            // Cerchiamo il tasto condividi per affiancarlo, altrimenti lo mettiamo all'inizio
            const condividi = contenitoreDestro.querySelector('[onclick*="condividi"], .fa-external-link-alt, .fa-share-alt');
            
            if (condividi) {
                const target = condividi.closest('div') || condividi;
                target.parentNode.insertBefore(btnL, target);
            } else {
                // Se non c'è il condividi, lo mettiamo comunque a destra
                contenitoreDestro.prepend(btnL);
            }
        } else {
            // FALLBACK ESTREMO: Se non trova contenitori, lo mette accanto al Sottomano
            const btnS = document.getElementById('btn-st-manuale');
            if (btnS) {
                const btnL = document.createElement('button');
                btnL.id = 'btn-lista-spesa';
                btnL.className = btnS.className;
                btnL.innerHTML = '🛒 SPESA';
                btnL.onclick = (e) => { e.preventDefault(); openListaSpesa(); };
                btnS.after(btnL);
            }
        }
    }
}

// Controllo periodico per assicurarci che i tasti dell'header non vengano rimossi
setInterval(inserisciTastiHeader, 1000);

/* --- LOGICA DATABASE (Mantieni quella che funziona) --- */
function aggiungiVoce(percorso) {
    const id = Date.now();
    db.ref(percorso + '/' + id).set({
        t: "",
        fatto: false,
        id: id
    });
}

function openSottomano() {
    costruisciFinestra('sottomanoOverlay', '📝 SOTTOMANO', 'linear-gradient(135deg, #FF9800 0%, #E91E63 100%)', 'sottomano');
    document.getElementById('sottomanoOverlay').style.display = 'flex';
    db.ref('sottomano').on('value', snap => disegnaLista(snap.val(), 'listaSottomano', 'sottomano'));
}

function openListaSpesa() {
    costruisciFinestra('spesaOverlay', '🛒 LISTA SPESA', 'linear-gradient(135deg, #00bcd4 0%, #009688 100%)', 'lista_spesa');
    document.getElementById('spesaOverlay').style.display = 'flex';
    db.ref('lista_spesa').on('value', snap => disegnaLista(snap.val(), 'listaSpesa', 'lista_spesa'));
}

function costruisciFinestra(id, titolo, gradiente, pathDB) {
    if (document.getElementById(id)) return;
    const listaId = id === 'sottomanoOverlay' ? 'listaSottomano' : 'listaSpesa';
    document.body.insertAdjacentHTML('beforeend', `
        <div id="${id}" class="sottomano-overlay">
            <div class="sottomano-content">
                <div class="sottomano-header" style="background:${gradiente}">
                    ${titolo} 
                    <span onclick="document.getElementById('${id}').style.display='none'" style="float:right; cursor:pointer;">✕</span>
                </div>
                <div id="${listaId}" class="sottomano-lista"></div>
                <div style="padding:15px; background:white; border-top:1px solid #eee;">
                    <button onclick="aggiungiVoce('${pathDB}')" class="btn-ripeti" style="width:100%; height:45px; border-radius:22px; cursor:pointer; background:#4caf50; color:white; border:none; font-weight:900;">+ AGGIUNGI RIGA</button>
                </div>
            </div>
        </div>`);
}

function disegnaLista(data, containerId, pathDB) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    if (!data) return;

    Object.keys(data).sort().reverse().forEach(id => {
        const item = data[id];
        container.insertAdjacentHTML('beforeend', `
            <div class="riga-st ${item.fatto ? 'fatto' : ''}">
                <textarea oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'" onchange="db.ref('${pathDB}/${id}').update({t:this.value})">${item.t || ''}</textarea>
                <div class="st-actions">
                    <span onclick="db.ref('${pathDB}/${id}').update({fatto:${!item.fatto}})" style="cursor:pointer; font-size:22px;">${item.fatto ? '✅' : '⬜'}</span>
                    <span onclick="if(confirm('Elimina?')) db.ref('${pathDB}/${id}').remove()" style="cursor:pointer; font-size:18px;">🗑️</span>
                </div>
            </div>`);
        const tx = container.lastElementChild.querySelector('textarea');
        tx.style.height = 'auto'; tx.style.height = tx.scrollHeight + 'px';
    });
}

// =============================================================================
// ASSISTENTE VOCALE INTELLIGENTE
// Riconoscimento vocale (Web Speech API) + parsing regex + smistamento
// automatico nelle caselle giuste dell'agenda (righe normali e schemi).
// =============================================================================

let _vocaleRecognition = null;
let _vocaleAttivo = false;

function mostraToast(messaggio, durata = 2800) {
    let t = document.getElementById('vocaleToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'vocaleToast';
        t.className = 'vocale-toast';
        document.body.appendChild(t);
    }
    t.textContent = messaggio;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), durata);
}

function _setBtnVocaleStato(attivo) {
    const btn = document.getElementById('btnVocale');
    if (!btn) return;
    btn.classList.toggle('recording', !!attivo);
}

function avviaAssistenteVocale() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        mostraToast("Riconoscimento vocale non supportato. Usa Chrome, Edge o Safari.", 4000);
        return;
    }
    if (!giornoCorrente) {
        mostraToast("Seleziona prima un giorno.");
        return;
    }
    // Toggle: se già in registrazione, fermalo
    if (_vocaleAttivo && _vocaleRecognition) {
        try { _vocaleRecognition.stop(); } catch (_) {}
        return;
    }
    
    _vocaleRecognition = new SR();
    _vocaleRecognition.lang = 'it-IT';
    _vocaleRecognition.continuous = false;
    _vocaleRecognition.interimResults = false;
    _vocaleRecognition.maxAlternatives = 1;
    
    _vocaleAttivo = true;
    _setBtnVocaleStato(true);
    mostraToast("🎤 Sto ascoltando...");
    
    _vocaleRecognition.onresult = (event) => {
        const trascrizione = (event.results[0][0].transcript || '').trim();
        if (!trascrizione) {
            mostraToast("Non ho capito. Riprova.");
            return;
        }
        elaboraComandoVocale(trascrizione);
    };
    
    _vocaleRecognition.onerror = (event) => {
        if (event.error === 'no-speech') {
            mostraToast("Non ho sentito nulla. Riprova.");
        } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            mostraToast("Permetti l'uso del microfono nelle impostazioni del browser.", 4500);
        } else if (event.error === 'audio-capture') {
            mostraToast("Microfono non disponibile.", 4000);
        } else {
            mostraToast("Errore vocale: " + event.error);
        }
    };
    
    _vocaleRecognition.onend = () => {
        _vocaleAttivo = false;
        _setBtnVocaleStato(false);
        _vocaleRecognition = null;
    };
    
    try { _vocaleRecognition.start(); } 
    catch (e) { 
        _vocaleAttivo = false;
        _setBtnVocaleStato(false);
        mostraToast("Impossibile avviare il microfono.");
    }
}

// ---------- PARSING ----------

// Estrae l'orario da una frase. Riconosce: "ore 10:30", "alle 10:30",
// "alle 10 e 30", "10:30", "alle dieci e trenta" (solo numeri principali).
function _estraiOrario(testo) {
    let restante = testo;
    let ora = null;
    
    // Pattern 1: "ore/alle 10:30" o "10:30"
    const m1 = restante.match(/(?:\b(?:alle|ore|h)\s+)?(\d{1,2})[:\.](\d{2})\b/i);
    if (m1) {
        const h = parseInt(m1[1]);
        const min = parseInt(m1[2]);
        if (h >= 0 && h < 24 && min >= 0 && min < 60) {
            ora = String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
            restante = restante.replace(m1[0], ' ').trim();
            return { ora, restante };
        }
    }
    
    // Pattern 2: "alle 10 e 30" / "ore 10 e mezza"
    const m2 = restante.match(/\b(?:alle|ore|h)\s+(\d{1,2})\s+e\s+(?:(\d{1,2})|mezza|mezzo|un quarto|tre quarti)\b/i);
    if (m2) {
        const h = parseInt(m2[1]);
        let min = 0;
        if (m2[2]) min = parseInt(m2[2]);
        else if (/mezza|mezzo/i.test(m2[0])) min = 30;
        else if (/un quarto/i.test(m2[0])) min = 15;
        else if (/tre quarti/i.test(m2[0])) min = 45;
        if (h >= 0 && h < 24 && min >= 0 && min < 60) {
            ora = String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
            restante = restante.replace(m2[0], ' ').trim();
            return { ora, restante };
        }
    }
    
    // Pattern 3: "alle 10" (ora secca, minuti = 00)
    const m3 = restante.match(/\b(?:alle|ore|h)\s+(\d{1,2})\b/i);
    if (m3) {
        const h = parseInt(m3[1]);
        if (h >= 0 && h < 24) {
            ora = String(h).padStart(2,'0') + ':00';
            restante = restante.replace(m3[0], ' ').trim();
        }
    }
    
    return { ora, restante };
}

// Estrae un numero di telefono (8-11 cifre, separatori opzionali).
function _estraiTelefono(testo) {
    let restante = testo;
    let telefono = null;
    
    // Pattern con etichetta esplicita "tel/telefono/cell..."
    const m1 = restante.match(/\b(?:tel(?:efono)?|cell(?:ulare)?|numero)\s*[:\-]?\s*((?:[+]?\d[\s\.\-]?){8,13}\d?)/i);
    if (m1) {
        const num = m1[1].replace(/\D/g, '');
        if (num.length >= 8 && num.length <= 13) {
            telefono = num;
            restante = restante.replace(m1[0], ' ').trim();
            return { telefono, restante };
        }
    }
    
    // Pattern senza etichetta: una sequenza di 9-11 cifre
    const m2 = restante.match(/\b(\d{9,11})\b/);
    if (m2) {
        telefono = m2[1];
        restante = restante.replace(m2[0], ' ').trim();
    }
    
    return { telefono, restante };
}

function _pulisciTesto(t) {
    return t
        .replace(/^\s*(con|appuntamento|impegno|incontro|nuovo|aggiungi|metti|inserisci|scrivi|registra)\s+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
}

// Elaborazione comando: estrae orario, telefono, identifica schema attivo
// e instrada il testo nella casella giusta.
function elaboraComandoVocale(testo) {
    if (!giornoCorrente) {
        mostraToast("Seleziona prima un giorno.");
        return;
    }
    
    const lcOriginale = testo.toLowerCase();
    
    // 1) Estrazione orario e telefono
    const oraInfo = _estraiOrario(testo);
    const telInfo = _estraiTelefono(oraInfo.restante);
    let testoBase = _pulisciTesto(telInfo.restante);
    
    // 2) Schemi attivi nel giorno corrente
    const wedEntry = Object.entries(datiGiorno || {}).find(([id, it]) => it && it.isWedBlock);
    const batEntry = Object.entries(datiGiorno || {}).find(([id, it]) => it && it.isBattesimoBlock);
    
    // 3) Smistamento
    if (wedEntry && _gestisciSchemaMatrimonio(wedEntry[0], lcOriginale, oraInfo.ora, telInfo.telefono, testoBase)) {
        return;
    }
    if (batEntry && _gestisciSchemaBattesimo(batEntry[0], lcOriginale, oraInfo.ora, telInfo.telefono, testoBase)) {
        return;
    }
    
    // 4) Riga normale: salva nello slot orario corrispondente o crea nuova riga
    _inserisciInRigaNormale(oraInfo.ora, testoBase, telInfo.telefono);
}

// ---------- SMISTAMENTO MATRIMONIO ----------

const _FIELD_MAP_WED = [
    { kw: ['sposo'],           prefix: 'SPOSO',        fieldT: 'sposo_t',        fieldH: 'sposo_h',        fieldTel: 'sposo_tel' },
    { kw: ['sposa'],           prefix: 'SPOSA',        fieldT: 'sposa_t',        fieldH: 'sposa_h',        fieldTel: 'sposa_tel' },
    { kw: ['chiesa', 'cerimonia'],     prefix: 'CHIESA', fieldT: 'chiesa_t',     fieldH: 'chiesa_h' },
    { kw: ['sala', 'ristorante', 'ricevimento'], prefix: 'SALA', fieldT: 'sala_t', fieldH: 'sala_h' },
    { kw: ['note', 'nota', 'appunti'], prefix: 'NOTE',   fieldT: 'note_t' }
];

function _trovaCampoSchema(lcText, mappa) {
    let migliore = null, idxMigliore = Infinity;
    for (const m of mappa) {
        for (const k of m.kw) {
            const idx = lcText.indexOf(k);
            if (idx >= 0 && idx < idxMigliore) {
                idxMigliore = idx;
                migliore = m;
            }
        }
    }
    return migliore;
}

function _gestisciSchemaMatrimonio(wedId, lcText, ora, telefono, testoBase) {
    const route = _trovaCampoSchema(lcText, _FIELD_MAP_WED);
    if (!route) return false;
    
    // Rimuovi la keyword dall'inizio del testo se presente
    let valore = testoBase;
    for (const k of route.kw) {
        const re = new RegExp('\\b' + k + '\\b', 'i');
        valore = valore.replace(re, '').trim();
    }
    valore = _pulisciTesto(valore);
    
    const update = {};
    if (route.fieldT) update[route.fieldT] = `${route.prefix}: ${valore}`;
    if (route.fieldH && ora) update[route.fieldH] = ora;
    if (route.fieldTel && telefono) update[route.fieldTel] = `TEL: ${telefono}`;
    // Se il telefono c'è ma non c'è un campo dedicato, appendiamolo al testo
    if (telefono && !route.fieldTel && route.fieldT) {
        update[route.fieldT] = `${route.prefix}: ${valore} - TEL: ${telefono}`;
    }
    
    db.ref(`agenda/${giornoCorrente}/${wedId}`).update(update);
    creaNotifica(wedId, ora || '', `${route.prefix}: ${valore}`);
    mostraToast(`✓ ${route.prefix} aggiornato`);
    setTimeout(() => _evidenziaRiga(wedId), 600);
    return true;
}

// ---------- SMISTAMENTO BATTESIMO ----------

const _FIELD_MAP_BAT = [
    { kw: ['cerimonia', 'chiesa'],   prefix: 'CERIMONIA',   fieldT: 'cerimonia_t',   fieldH: 'cerimonia_h' },
    { kw: ['ricevimento', 'sala', 'ristorante'], prefix: 'RICEVIMENTO', fieldT: 'ricevimento_t', fieldH: 'ricevimento_h' },
    { kw: ['note', 'nota', 'appunti'], prefix: 'NOTE',      fieldT: 'note_t' }
];

function _gestisciSchemaBattesimo(batId, lcText, ora, telefono, testoBase) {
    const route = _trovaCampoSchema(lcText, _FIELD_MAP_BAT);
    if (!route) return false;
    
    let valore = testoBase;
    for (const k of route.kw) {
        const re = new RegExp('\\b' + k + '\\b', 'i');
        valore = valore.replace(re, '').trim();
    }
    valore = _pulisciTesto(valore);
    if (telefono) valore += ` - TEL: ${telefono}`;
    
    const update = {};
    if (route.fieldT) update[route.fieldT] = valore;
    if (route.fieldH && ora) update[route.fieldH] = ora;
    
    db.ref(`agenda/${giornoCorrente}/${batId}`).update(update);
    creaNotifica(batId, ora || '', `${route.prefix}: ${valore}`);
    mostraToast(`✓ ${route.prefix} aggiornato`);
    setTimeout(() => _evidenziaRiga(batId), 600);
    return true;
}

// ---------- INSERIMENTO RIGA NORMALE ----------

function _inserisciInRigaNormale(ora, testo, telefono) {
    let testoFinale = testo;
    if (telefono) testoFinale += (testoFinale ? ' - ' : '') + 'TEL: ' + telefono;
    
    // Se l'ora coincide con uno slot fisso, scrivi lì; altrimenti crea nuova riga
    if (ora && orariFissi.includes(ora)) {
        const id = "h" + ora.replace(":", "");
        db.ref(`agenda/${giornoCorrente}/${id}`).update({ h: ora, t: testoFinale });
        creaNotifica(id, ora, testoFinale);
        mostraToast(`✓ Salvato alle ${ora}`);
        setTimeout(() => _evidenziaRiga(id), 600);
    } else {
        const id = "ex" + Date.now();
        const h = ora || "";
        const sort = ora ? cleanH(ora) : 999;
        db.ref(`agenda/${giornoCorrente}/${id}`).set({ h: h, t: testoFinale, c: 'def', sort: sort });
        creaNotifica(id, h, testoFinale);
        mostraToast(ora ? `✓ Riga creata alle ${ora}` : "✓ Riga aggiunta");
        setTimeout(() => _evidenziaRiga(id), 600);
    }
}

// Scroll verso la riga e flash giallo per feedback visivo
function _evidenziaRiga(id) {
    const el = document.getElementById('slot-' + id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const oldBg = el.style.backgroundColor;
    el.style.transition = 'background-color 0.4s';
    el.style.backgroundColor = '#fff9c4';
    setTimeout(() => { el.style.backgroundColor = oldBg || 'transparent'; }, 2500);
}
