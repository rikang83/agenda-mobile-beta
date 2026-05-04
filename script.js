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
function setupNotifiche() {
    const list = document.getElementById('notif-list');
    db.ref('notifiche_log').orderByChild('timestamp').limitToLast(30).on('value', (snapshot) => {
        const logs = snapshot.val() || {};
        list.innerHTML = "";
        let unread = 0;
        const oraAttuale = Date.now();
        const ultimoCheckLocale = parseInt(localStorage.getItem('notifiche_lette_timestamp')) || 0;
        Object.keys(logs).reverse().forEach(key => {
            const n = logs[key];
            if (oraAttuale - n.timestamp > 86400000) { db.ref('notifiche_log/' + key).remove(); return; }
            const isReadSingola = localStorage.getItem('read_' + key);
            const isReadMassivo = n.timestamp <= ultimoCheckLocale;
            const isRead = isReadSingola || isReadMassivo;
            if (!isRead) unread++;
            const item = document.createElement('div');
            item.className = 'notif-item';
            if (!isRead) { item.style.backgroundColor = '#fff9c4'; item.style.borderLeft = '4px solid #2196f3'; } 
            else { item.style.backgroundColor = 'transparent'; item.style.opacity = '0.6'; }
            const dataModifica = new Date(n.timestamp).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
            item.innerHTML = `<div style="font-size: 10px; color: #666; margin-bottom: 2px;">Modifica del ${dataModifica} - Giorno ${n.dataGiorno}</div><div style="font-size: 14px; font-weight: bold; color: #333;">${n.testo}</div>`;
            item.onclick = () => {
                localStorage.setItem('read_' + key, 'true');
                if(document.getElementById('vMese').style.display !== 'none') toggleVista('g');
                selezionaGiorno(n.dataGiorno, true);
                setTimeout(() => {
                    const rigaEl = document.getElementById('slot-' + n.rigaId);
                    if (rigaEl) { rigaEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); rigaEl.style.backgroundColor = '#fff9c4'; setTimeout(() => rigaEl.style.backgroundColor = 'transparent', 2000); }
                }, 600);
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
    localStorage.setItem('notifiche_lette_timestamp', Date.now());
    notifCount = 0; aggiornaBadge(0);
    document.querySelectorAll('.notif-item').forEach(item => { item.style.backgroundColor = 'transparent'; item.style.opacity = '0.6'; item.style.borderLeft = 'none'; });
}

function chiudiNotifiche() { closeModal('notifModal'); }

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
    }
    
    giornoCorrente = data;

    // 2. Aggiornamento UI immediato (senza attendere il database)
    document.querySelectorAll('.day-item.active').forEach(i => i.classList.remove('active'));
    const att = document.getElementById('st-'+data); 
    if(att) { 
        att.classList.add('active'); 
        if(scroll) {
            // "auto" è più veloce di "smooth" su molti smartphone economici
            att.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" }); 
        }
    }

    // 3. Caricamento dati atomico (usiamo Promise.all per essere più veloci)
    try {
        const [snapTitolo, snapConfig, snapAgenda] = await Promise.all([
            db.ref('titoli/'+data).once('value'),
            db.ref('config/'+data).once('value'), // Passa a .once se non ti serve il real-time continuo qui
            db.ref('agenda/'+data).once('value')
        ]);

        // Imposta i valori una sola volta
        document.getElementById('titoloGiorno').value = snapTitolo.val() || "";
        
        const conf = snapConfig.val() || {};
        document.getElementById('checkOrarioLabel').checked = conf.mostraOra !== false;
        document.getElementById('checkRighe').checked = conf.mostraRighe !== false;
        
        datiGiorno = snapAgenda.val() || {};

        // 4. CHIAMATA UNICA AL RENDERING
        // Eseguiamo il render una sola volta dopo aver caricato tutto
        renderGiorno();

    } catch (error) {
        console.error("Errore nel caricamento giorno:", error);
    }
}

function renderGiorno() {
    const active = document.activeElement;
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT") && active.type !== "checkbox") return;
    const container = document.getElementById('listaImpegni'); const scrollPos = window.scrollY; container.innerHTML = "";
    const mostraTutteRighe = document.getElementById('checkRighe').checked;
    const mostraEtichettaOra = document.getElementById('checkOrarioLabel').checked;
    let visualizzazione = {};
    if(mostraTutteRighe) orariFissi.forEach(h => { const id = "h" + h.replace(":", ""); visualizzazione[id] = { id: id, h: h, t: "", c: "def", sortKey: cleanH(h) }; });
    Object.keys(datiGiorno).forEach(key => { const item = datiGiorno[key]; visualizzazione[key] = { id: key, ...item, sortKey: item.sort || cleanH(item.h) || 999 }; });
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
                    <div class="ora-box"><input type="text" class="ora-input" placeholder="00:00" value="${item[key+'_h']||''}" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_h']:this.value})"></div>
                    <div style="flex:1">
                        <textarea class="nota-input" oninput="autoResize(this)" onblur="db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_t']:this.value})">${item[key+'_t'] || ''}</textarea>
                        <div class="color-dots">
                            ${Object.keys(colMap).filter(k=>k!='def').map(k=>`
                                <div class="dot ${item[key+'_c']===k?'active':''}" 
                                     style="background:${colMap[k][0]}" 
                                     onclick="const n=(datiGiorno['${item.id}']['${key}_c']==='${k}'?'def':'${k}'); db.ref('agenda/${giornoCorrente}/${item.id}').update({['${key}_c']:n})">
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
                                 onclick="const n=(datiGiorno['${item.id}'].note_c==='${k}'?'def':'${k}'); db.ref('agenda/${giornoCorrente}/${item.id}').update({note_c:n})">
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
                                 onclick="const n=(datiGiorno['${item.id}'].chi1==='${k}'?'def':'${k}'); db.ref('agenda/${giornoCorrente}/${item.id}').update({chi1:n})">
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
                         onclick="const n=(datiGiorno['${item.id}']['chi${i}'] === '${k}' ? 'def' : '${k}'); db.ref('agenda/${giornoCorrente}/${item.id}').update({['chi'+${i}]:n})">
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
            div.innerHTML = contentHTML + `<div class="color-dots">${(!item.isWed && !item.isAdmin)?Object.keys(colMap).filter(k=>k!='def').map(k=>`<div class="dot ${item.c===k?'active':''}" style="background:${colMap[k][0]}" onclick="cambiaColore('${item.id}','${k}','${item.h}')">${colMap[k][1]}</div>`).join(''):''}<button onclick="del('${item.id}')" style="background:none; border:none; margin-left:10px; cursor:pointer;">🗑️</button></div>`;
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

function cambiaColore(id, c, oraDef) { 
    const mainId = id.replace('_tel', '').replace('_via', '');
    const oraAttuale = document.querySelector(`#slot-${mainId} .ora-input`)?.value || oraDef;
    const newVal = (datiGiorno[id]?.c === c) ? 'def' : c; 
    db.ref(`agenda/${giornoCorrente}/${id}`).update({c:newVal, h:oraAttuale}); 
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
function salvaTitolo(v) { db.ref('titoli/'+giornoCorrente).set(v); }

function toggleVista(v) {
    const vg = document.getElementById('vGiorno'); const vm = document.getElementById('vMese');
    if (v === 'm') { vg.style.display = 'none'; vm.style.display = 'block'; initCalendar(); setTimeout(() => { vm.scrollLeft = 0; }, 50); } 
    else { vg.style.display = 'block'; vm.style.display = 'none'; }
}

function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function aggiungiRigaExtra() { const id = "ex" + Date.now(); db.ref(`agenda/${giornoCorrente}/${id}`).set({h:"00:00", t:"", c:"def", sort:999}); }

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
    document.getElementById('checkOrarioLabel').checked = false;
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
    giorniSelezionati = []; 
    
    // Rimuove graficamente il viola da tutti i tondini
    document.querySelectorAll('.dot-day-rep').forEach(d => d.classList.remove('active')); 
    
    // Apre effettivamente il modale
    openModal('repModal'); 
}

function toggleRepDay(el,d) { if(giorniSelezionatiRep.includes(d)) { giorniSelezionatiRep=giorniSelezionatiRep.filter(x=>x!==d); el.classList.remove('active'); } else { giorniSelezionatiRep.push(d); el.classList.add('active'); } }
function eseguiRipetizione() { const t=document.getElementById('repTesto').value, h=document.getElementById('repHInizio').value, df=document.getElementById('repDataFine').value; if(!t||!df||giorniSelezionatiRep.length===0) return; let cur=new Date(giornoCorrente), fine=new Date(df); while(cur<=fine) { if(giorniSelezionatiRep.includes(cur.getDay())) { db.ref(`agenda/${cur.toISOString().split('T')[0]}/rep_${Date.now()}_${cur.getTime()}`).set({h:h, t:t, c:'def', sort:cleanH(h)}); } cur.setDate(cur.getDate()+1); } closeModal('repModal'); }
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

// Ascolta su tutta la pagina (document) invece che solo su vMese
document.addEventListener('touchstart', e => { 
    touchstartX = e.changedTouches[0].screenX; 
}, { passive: true });

document.addEventListener('touchend', e => { 
    touchendX = e.changedTouches[0].screenX; 
    handleGesture(); 
}, { passive: true });

document.addEventListener('touchstart', e => { 
    touchstartX = e.changedTouches[0].screenX; 
}, { passive: true });

document.addEventListener('touchend', e => { 
    touchendX = e.changedTouches[0].screenX; 
    handleGesture(); 
}, { passive: true });

function handleGesture() { 
    const soglia = 100; 
    
    // CAPISCE LA VISTA AUTOMATICAMENTE
    // Se il div vMese è visibile, allora siamo in vista mese ('m'), altrimenti giorno ('g')
    const vMese = document.getElementById('vMese');
    const vista = (vMese && vMese.style.display === 'block') ? 'm' : 'g';

    if (touchendX < touchstartX - soglia) {
        // SWIPE SINISTRA -> AVANTI
        if (vista === 'g') navigaGiorno(1); 
        else cambiaMeseOffset(1);
    } 
    
    if (touchendX > touchstartX + soglia) {
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

let giorniSelezionati = [];

// Gestisce l'accensione/spegnimento dei tondini (L, M, M, G, V, S, D)
function toggleRepDay(el, day) {
    if (giorniSelezionati.includes(day)) {
        giorniSelezionati = giorniSelezionati.filter(d => d !== day);
        el.classList.remove('active');
    } else {
        giorniSelezionati.push(day);
        el.classList.add('active');
    }
}

// Funzione per coprire l'agenda su più giorni
function eseguiRipetizione() {
    const testo = document.getElementById('repTesto').value;
    const hInizio = document.getElementById('repHInizio').value;
    const hFine = document.getElementById('repHFine').value;
    const dataFineStr = document.getElementById('repDataFine').value;

    if (!testo || giorniSelezionati.length === 0 || !dataFineStr) {
        alert("Attenzione: Inserisci il testo, seleziona i giorni e la data di fine!");
        return;
    }

    const dataFine = new Date(dataFineStr);
    let dataCorrente = new Date(); // Inizia da oggi

    // Ciclo che attraversa i giorni fino alla data di fine
    while (dataCorrente <= dataFine) {
        if (giorniSelezionati.includes(dataCorrente.getDay())) {
            const dataIso = dataCorrente.toISOString().split('T')[0];
            const nuovoId = "rep-" + Date.now() + Math.random().toString(36).substr(2, 5);
            
            // Scrive su Firebase
            firebase.database().ref('agenda/' + dataIso + '/' + nuovoId).set({
                id: nuovoId,
                testo: testo,
                ora: hInizio,
                oraFine: hFine,
                completato: false
            });
        }
        dataCorrente.setDate(dataCorrente.getDate() + 1);
    }
    
    alert("Copia completata con successo!");
    closeModal('repModal');
    // Pulisce i campi per la prossima volta
    document.getElementById('repTesto').value = "";
    giorniSelezionati = [];
    document.querySelectorAll('.dot-day-rep').forEach(dot => {
        dot.style.background = "#eee";
        dot.style.color = "#333";
    });
}

// Funzione di pulizia massiva per parola chiave
function pulisciPerParolaChiave() {
    const parola = prompt("Quale parola vuoi eliminare da TUTTA l'agenda?");
    if (!parola || parola.trim() === "") return;

    if (confirm("Vuoi davvero eliminare ogni impegno che contiene '" + parola + "'? L'operazione non è reversibile.")) {
        firebase.database().ref('agenda').once('value', (snapshot) => {
            snapshot.forEach((giornoSnap) => {
                giornoSnap.forEach((impegnoSnap) => {
                    const data = impegnoSnap.val();
                    if (data.testo && data.testo.toLowerCase().includes(parola.toLowerCase())) {
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
    { label: 'Matrimoni', color: '#1a237e', keys: ['matrimonio', 'iswedblock', 'matrimoni', 'wedding'] },
    { label: 'Battesimi', color: '#64b5f6', keys: ['battesimo', 'isBattesimoBlock'] },
    { label: 'Cresime', color: '#8e24aa', keys: ['cresima'] },
    { label: 'Comunioni', color: '#d81b60', keys: ['comunione'] },
    { label: 'In Studio', color: '#689f38', keys: ['studio'] },
    { label: '50° Anniversario', color: '#ffd700', keys: ['50°', '50esimo'] },
    { label: '25° Anniversario', color: '#c0c0c0', keys: ['25°', '25esimo'] }
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
    const dbRef = firebase.database().ref('agenda');
    const ANNO = "2026"; 

    dbRef.once('value').then(snapshot => {
        const data = snapshot.val() || {};
        let matrix = CONFIG_ST.map(() => new Array(12).fill(0));
        let totale = 0;

        Object.keys(data).forEach(giorno => {
            // Filtro anno: controlla che la data inizi con 2026
            if (!giorno.startsWith(ANNO)) return;

            const mIdx = parseInt(giorno.split("-")[1]) - 1;
            const impegniGiorno = data[giorno];

            if (!impegniGiorno) return;

            Object.keys(impegniGiorno).forEach(idImpegno => {
                const dettaglio = impegniGiorno[idImpegno];
                
                // TRUCCO: Se l'impegno è solo una stringa (es. "MATRIMONIO ROSSI"), 
                // la trasformiamo in oggetto per uniformare la ricerca.
                let testoDaAnalizzare = "";
                if (typeof dettaglio === 'string') {
                    testoDaAnalizzare = dettaglio.toLowerCase();
                } else {
                    testoDaAnalizzare = JSON.stringify(dettaglio).toLowerCase();
                }

                let trovatoPerQuestoImpegno = false;

                for (let i = 0; i < CONFIG_ST.length; i++) {
                    const cat = CONFIG_ST[i];
                    
                    // Controlla se una delle parole chiave è presente nel testo
                    const matches = cat.keys.some(k => {
                        const keyLower = k.toLowerCase();
                        return testoDaAnalizzare.includes(keyLower);
                    });

                    if (matches) {
                        matrix[i][mIdx]++;
                        totale++;
                        trovatoPerQuestoImpegno = true;
                        break; // Un impegno = una sola categoria
                    }
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