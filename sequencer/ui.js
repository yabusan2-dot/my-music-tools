function copyC() { 
    navigator.clipboard.writeText(
        document.getElementById('cText').textContent
    ); 
}

function drawWaveIcon(t) {
    const v = document.getElementById('type'+t).value; 
    let p = "";
    if (v==='sine') p="M 5,13 Q 15,2 25,13 T 45,13"; 
    else if (v==='square') p="M 5,21 L 5,5 L 25,5 L 25,21 L 45,21"; 
    else if (v==='sawtooth') p="M 5,21 L 25,5 L 25,21 L 45,5"; 
    else if (v==='triangle') p="M 5,21 L 15,5 L 35,21 L 45,5";
    document.getElementById('wavePreview'+t).innerHTML = 
        `<svg width="50" height="26"><path d="${p}" class="wave-svg${t}"/></svg>`;
}

function rebuildSequencerUI() {
    const npm = (currentMeter === 4) ? 8 : 6;
    const total = npm * currentPhrase;
    
    for (let t = 1; t <= 2; t++) {
        const box = document.getElementById(`t${t}-main-box`); 
        box.innerHTML = ''; 
        box.style.gridTemplateColumns = `repeat(${npm}, 1fr)`;
        const tbl = (t === 1) ? scaleTable1 : scaleTable2;
        
        for (let i = 0; i < total; i++) {
            const d = document.createElement('div'); 
            d.className = 'note-box'; 
            d.id = `t${t}-box-${i}`;
            
            // 🔴 改善：セレクトボックスの左右に半音切り替え用の ♭ と ♯ ボタンをサンドイッチ配置
            d.innerHTML = `<span class="note-num">${i+1}</span>` +
                          `<div class="acc-group">` +
                          `<button class="acc-btn" id="t${t}-flat-${i}" onclick="toggleAcc(${t},${i},-1)">♭</button>` +
                          `<select id="t${t}-s-${i}" class="${t===1?'t1-sel':'t2-sel'}"></select>` +
                          `<button class="acc-btn" id="t${t}-sharp-${i}" onclick="toggleAcc(${t},${i},1)">♯</button>` +
                          `</div>`;
            box.appendChild(d); 
            
            const sel = document.getElementById(`t${t}-s-${i}`); 
            sel.addEventListener('change', up);
            
            Object.keys(tbl).forEach(n => { 
                const o = document.createElement('option'); 
                o.value = tbl[n]; o.textContent = n; 
                sel.appendChild(o); 
            });
        }
    }
}
