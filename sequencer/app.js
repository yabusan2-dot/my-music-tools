let isPlaying = false, timerId = null, stepIndex = 0;
let currentMeter = 4, currentPhrase = 1, currentPreset = 'hero';
let melody1 = [], melody2 = [];
let acc1 = new Array(32).fill(0), acc2 = new Array(32).fill(0);
let actx = null;
let activeOscillators = [];

function getAudioContext() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
}

const getV = (id) => (id==='type1'||id==='type2') ? 
    document.getElementById(id).value : parseFloat(document.getElementById(id).value);

function copyC() { navigator.clipboard.writeText(document.getElementById('cText').textContent); }

function drawWaveIcon(t) {
    const v = document.getElementById('type'+t).value; let p = "";
    if (v==='sine') p="M 5,12 Q 15,2 25,12 T 45,12"; 
    else if (v==='square') p="M 5,19 L 5,5 L 25,5 L 25,19 L 45,19"; 
    else if (v==='sawtooth') p="M 5,19 L 25,5 L 25,19 L 45,5"; 
    else if (v==='triangle') p="M 5,19 L 15,5 L 35,19 L 45,5";
    document.getElementById('wavePreview'+t).innerHTML = 
        `<svg width="44" height="24"><path d="${p}" class="wave-svg${t}"/></svg>`;
}

function rebuildSequencerUI() {
    const npm = (currentMeter === 4) ? 8 : 6, total = npm * currentPhrase;
    for (let t = 1; t <= 2; t++) {
        const box = document.getElementById(`t${t}-main-box`); 
        box.innerHTML = ''; 
        box.style.gridTemplateColumns = `repeat(${npm}, 1fr)`;
        const tbl = (t === 1) ? scaleTable1 : scaleTable2;
        for (let i = 0; i < total; i++) {
            const d = document.createElement('div'); 
            d.className = 'note-box'; d.id = `t${t}-box-${i}`;
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
                o.value = tbl[n]; o.textContent = n; sel.appendChild(o); 
            });
        }
    }
    refreshAccUI();
}

function toggleAcc(t, i, v) { 
    const arr = (t === 1) ? acc1 : acc2; 
    arr[i] = (arr[i] === v) ? 0 : v; 
    refreshAccUI(); up(); 
    if(!isPlaying) {
        const ctx = getAudioContext();
        let f = (t === 1) ? melody1[i] : melody2[i];
        if (f > 0) {
            if (v === 1) f *= 1.059463; else if (v === -1) f /= 1.059463;
            playNote(ctx, f, getV('type'+t), getV('echo'), getV('vol'), ctx.currentTime, 0.2, t);
        }
    }
}

function refreshAccUI() {
    const total = ((currentMeter === 4) ? 8 : 6) * currentPhrase;
    for (let t = 1; t <= 2; t++) {
        const arr = (t === 1) ? acc1 : acc2;
        for (let i = 0; i < total; i++) {
            const f = document.getElementById(`t${t}-flat-${i}`);
            const s = document.getElementById(`t${t}-sharp-${i}`);
            if (f && s) { 
                f.classList.toggle('flat-on', arr[i] === -1); 
                s.classList.toggle('sharp-on', arr[i] === 1); 
            }
        }
    }
}

function up() { 
    ['vol','tempo','echo','atk1','dec1','harm1','atk2','dec2','harm2'].forEach(k => { 
        const el = document.getElementById('v-'+k);
        if(el) el.textContent = document.getElementById(k).value; 
    }); 
    melody1 = []; melody2 = []; 
    const total = ((currentMeter === 4) ? 8 : 6) * currentPhrase; 
    for (let i = 0; i < total; i++) { 
        melody1.push(parseFloat(document.getElementById(`t1-s-${i}`).value)); 
        melody2.push(parseFloat(document.getElementById(`t2-s-${i}`).value)); 
    } 
    genC(); 
}

// 🔴 核心：アタック、ディケイ、つや(倍音)を動的にエンベロープ合成して楽器にする新エンジン
function playNote(ctx, f, type, echo, vol, time, dur, trackNum) {
    if (f === 0) return;
    
    // スライダーの楽器パラメーターを読み出す
    const atk = getV('atk' + trackNum);
    const dec = getV('dec' + trackNum);
    const harm = getV('harm' + trackNum) / 100; // 0% 〜 100% ➔ 0.0 〜 1.0
    
    const baseGain = ctx.createGain(), mG = ctx.createGain(); 
    mG.connect(ctx.destination);
    
    // 楽器ごとの基本音量ファクター補正
    let fac = 0.05; 
    if (type==='sine') fac=0.20; else if (type==='triangle') fac=0.15; 
    if (f<200&&(type==='sine'||type==='triangle')) fac*=2.2;
    const maxVolume = fac * (vol / 100);

    // 🎹 【アタック・ディケイのエンベロープ制御】
    baseGain.gain.setValueAtTime(0, time);
    // 1. アタック時間（atk）をかけて0から最大音量まで立ち上げる
    baseGain.gain.linearRampToValueAtTime(maxVolume, time + atk);
    // 2. ディケイ時間（dec）をかけて、滑らかに音量を絞るか、または全体のデュレーションで消音
    const soundCutTime = time + atk + dec;
    baseGain.gain.exponentialRampToValueAtTime(0.001, Math.min(time + dur, soundCutTime));

    mG.gain.setValueAtTime(1.0, time);
    mG.gain.exponentialRampToValueAtTime(0.001, time + dur + (echo > 0 ? echo * 2.5 : 0));

    let out = mG; 
    if (echo > 0) { 
        const d = ctx.createDelay(); d.delayTime.setValueAtTime(0.28, time); 
        const fG = ctx.createGain(); fG.gain.setValueAtTime(echo, time); 
        d.connect(fG); fG.connect(d); fG.connect(mG); out = d; 
    }

    // 🎹 【基音のオシレーター生成】
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(f, time); 
    osc.connect(baseGain); baseGain.connect(mG); baseGain.connect(out); 
    osc.start(time); osc.stop(time + dur);
    activeOscillators.push(osc);

    // 🎹 【つや・太さ（倍音ブレンド）回路】 0%より大きい時だけ1オクターブ上の倍音を重ねる
    if (harm > 0) {
        const harmOsc = ctx.createOscillator();
        const harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(0, time);
        harmGain.gain.linearRampToValueAtTime(maxVolume * harm, time + atk); // 倍音の音量比を適用
        harmGain.gain.exponentialRampToValueAtTime(0.001, Math.min(time + dur, soundCutTime));
        
        harmOsc.type = 'sine'; // 倍音成分は耳当たりの良いsine波がベスト
        harmOsc.frequency.setValueAtTime(f * 2, time); // 💡音楽理論：2倍の周波数 ＝ 1オクターブ上の澄んだ倍音
        
        harmOsc.connect(harmGain); harmGain.connect(mG); harmGain.connect(out);
        harmOsc.start(time); harmOsc.stop(time + dur);
        activeOscillators.push(harmOsc);
    }
}

function playSingleStep(ctx, idx, vol, time) {
    const step = 60 / (getV('tempo') || getV('tempo')) / 2;
    const triggerTrack = (melArr, accArr, typeStr, tNum) => {
        let f = melArr[idx]; if (f <= 0) return; 
        let tied = 0; for (let j = idx + 1; j < melArr.length; j++) { if (melArr[j] === -1) tied++; else break; }
        const dur = step * (1 + tied) * 0.9;
        if (accArr[idx] === 1) f *= 1.059463; else if (accArr[idx] === -1) f /= 1.059463;
        playNote(ctx, f, typeStr, getV('echo'), vol, time, dur, tNum);
    };
    triggerTrack(melody1, acc1, getV('type1'), 1); 
    triggerTrack(melody2, acc2, getV('type2'), 2);
}

function changeTempo() { 
    if (!isPlaying) return; 
    clearInterval(timerId); const step = 60 / (getV('tempo') || getV('tempo')) / 2; up(); 
    timerId = setInterval(() => { 
        document.querySelectorAll('.note-box').forEach(b => b.classList.remove('active')); 
        stepIndex = stepIndex % melody1.length;
        const b1 = document.getElementById('t1-box-'+stepIndex), b2 = document.getElementById('t2-box-'+stepIndex); 
        if(b1) b1.classList.add('active'); if(b2) b2.classList.add('active'); 
        const ctx = getAudioContext(); playSingleStep(ctx, stepIndex, getV('vol'), ctx.currentTime); 
        stepIndex = (stepIndex + 1) % melody1.length; 
    }, step * 1000); 
}

function togglePlay() { 
    if (isPlaying) { 
        clearInterval(timerId); isPlaying = false; document.getElementById('pBtn').textContent = '▶ BGMを再生する'; 
        document.querySelectorAll('.note-box').forEach(b => b.classList.remove('active')); 
        activeOscillators.forEach(osc => { try { osc.stop(); } catch(e){} }); activeOscillators = [];
    } else { 
        getAudioContext(); isPlaying = true; stepIndex = 0; 
        document.getElementById('pBtn').textContent = '⏹ 停止する'; changeTempo(); 
    } 
}

// 🔴 修正：出力コードエリアの文字切れを防ぐため、文字列を限界まで細かく縦に千切って結合する安全ロジック
function genC() {
    const vl = getV('vol'), tm = getV('tempo'), ec = getV('echo');
    const ty1 = getV('type1'), ty2 = getV('type2');
    const atk1 = getV('atk1'), dec1 = getV('dec1'), harm1 = getV('harm1')/100;
    const atk2 = getV('atk2'), dec2 = getV('dec2'), harm2 = getV('harm2')/100;
    
    let ecC = ec > 0 ? 
        `const d=ctx.createDelay(), fG=ctx.createGain(); ` +
        `d.delayTime.setValueAtTime(0.28,now); fG.gain.setValueAtTime(${ec},now); ` +
        `d.connect(fG); fG.connect(d); fG.connect(mG); out = d;` : '';
    
    document.getElementById('cText').textContent = 
    `function startPolyBGM() {\n` +
    `    const ctx = new AudioContext();\n` +
    `    const m1 = [${melody1.join(',')}], m2 = [${melody2.join(',')}];\n` +
    `    const a1 = [${acc1.slice(0,melody1.length).join(',')}];\n` +
    `    const a2 = [${acc2.slice(0,melody2.length).join(',')}];\n` +
    `    let idx = 0, step = ${60/tm/2};\n` +
    `    setInterval(() => {\n` +
    `        const now = ctx.currentTime;\n` +
    `        const play = (m, a, ty, atk, dec, harm) => {\n` +
    `            let f = m[idx]; if (f <= 0) return;\n` +
    `            let tied = 0; for (let j = idx+1; j < m.length; j++) {\n` +
    `                if (m[j] === -1) tied++; else break;\n` +
    `            }\n` +
    `            const dur = step * (1 + tied) * 0.9;\n` +
    `            if (a[idx] === 1) f *= 1.059463;\n` +
    `            else if (a[idx] === -1) f /= 1.059463;\n` +
    `            let fac = 0.05; if (ty==='sine') fac=0.20;\n` +
    `            else if (ty==='triangle') fac=0.15;\n` +
    `            if (f<200&&(ty==='sine'||ty==='triangle')) fac*=2.2;\n` +
    `            const maxV = fac * (${vl/100});\n` +
    `            const bG = ctx.createGain(), mG = ctx.createGain();\n` +
    `            mG.connect(ctx.destination);\n` +
    `            bG.gain.setValueAtTime(0, now);\n` +
    `            bG.gain.linearRampToValueAtTime(maxV, now + atk);\n` +
    `            bG.gain.exponentialRampToValueAtTime(0.001, ` +
                     `Math.min(now + dur, now + atk + dec));\n` +
    `            mG.gain.setValueAtTime(1.0, now);\n` +
    `            mG.gain.exponentialRampToValueAtTime(0.001, ` +
                     `now + dur + ${ec > 0 ? (ec * 2.5).toFixed(1) : 0});\n` +
    `            let out = mG; ${ecC}\n` +
    `            const osc = ctx.createOscillator();\n` +
    `            osc.type = ty; osc.frequency.setValueAtTime(f, now);\n` +
    `            osc.connect(bG); bG.connect(mG); bG.connect(out);\n` +
    `            osc.start(now); osc.stop(now + dur);\n` +
    `            if (harm > 0) {\n` +
    `                const hOsc = ctx.createOscillator(), hG = ctx.createGain();\n` +
    `                hG.gain.setValueAtTime(0, now);\n` +
    `                hG.gain.linearRampToValueAtTime(maxV * harm, now + atk);\n` +
    `                hG.gain.exponentialRampToValueAtTime(0.001, ` +
                         `Math.min(now + dur, now + atk + dec));\n` +
    `                hOsc.type = 'sine'; hOsc.frequency.setValueAtTime(f * 2, now);\n` +
    `                hOsc.connect(hG); hG.connect(mG); hG.connect(out);\n` +
    `                hOsc.start(now); hOsc.stop(now + dur);\n` +
    `            }\n` +
    `        };\n` +
    `        play(m1, a1, '${ty1}', ${atk1}, ${dec1}, ${harm1});\n` +
    `        play(m2, a2, '${ty2}', ${atk2}, ${dec2}, ${harm2});\n` +
    `        idx = (idx + 1) % m1.length;\n` +
    `    }, step * 1000);\n` +
    `}`;
}

function dlWav() {
    const tm = getV('tempo'), ec = getV('echo'), rate = 44100;
    const step = 60 / (getV('tempo') || getV('tempo')) / 2;
    const fullD = step * melody1.length + (ec > 0 ? ec * 2.5 : 0.5);
    const octx = new OfflineAudioContext(1, rate * fullD, rate);
    
    const runWav = (mel, acc, ty, tNum) => {
        for (let i = 0; i < melody1.length; i++) {
            let f = mel[i]; if (f <= 0) continue; 
            let tied = 0; 
            for (let j = i+1; j < melody1.length; j++) {
                if (mel[j] === -1) tied++; else break;
            }
            const dur = step * (1 + tied) * 0.9, t = step * i;
            if (acc[i] === 1) f *= 1.059463; else if (acc[i] === -1) f /= 1.059463;
            playNote(octx, f, ty, ec, getV('vol'), t, dur, tNum);
        }
    };
    runWav(melody1, acc1, getV('type1'), 1); 
    runWav(melody2, acc2, getV('type2'), 2);
    
    octx.startRendering().then(buf => {
        let res = buf.getChannelData(0).subarray(0, Math.floor(rate * (step * melody1.length))); 
        const bl = res.length * 2, ab = new ArrayBuffer(44 + bl), v = new DataView(ab); 
        const wS = (o, s) => { for (let i=0; i<s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
        wS(0, 'RIFF'); v.setUint32(4, 36 + bl, true); wS(8, 'WAVE'); wS(12, 'fmt '); 
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); 
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); 
        v.setUint16(34, 16, true); wS(36, 'data'); v.setUint32(40, bl, true); 
        for (let i = 0; i < res.length; i++) { 
            let s = Math.max(-1, Math.min(1, res[i])); 
            v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); 
        }
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(new Blob([v], { type: 'audio/wav' })); 
        a.download = `duet_synth_${currentMeter}b.wav`; a.click();
    });
}

function loadM(n) {
    currentPreset = n; document.getElementById('tempo').value = tPresets[n];
    document.getElementById('type1').value = (n==='hero'||n==='puzzle') ? 'square' : 'sawtooth'; 
    document.getElementById('type2').value = 'triangle';
    acc1.fill(0); acc2.fill(0); rebuildSequencerUI();
    const p = mPresets[n][currentMeter], npm = (currentMeter === 4) ? 8 : 6, total = npm * currentPhrase;
    for (let t = 1; t <= 2; t++) {
        const tr = p[`t${t}`], tbl = (t === 1) ? scaleTable1 : scaleTable2;
        for (let i = 0; i < total; i++) {
            const sel = document.getElementById(`t${t}-s-${i}`); if (!sel) continue;
            let cls = 0, min = Infinity, val = (i < tr.length) ? tr[i] : 0;
            Object.values(tbl).forEach(v => { let d = Math.abs(v - val); if (d < min) { min = d; cls = v; } }); 
            sel.value = cls;
        }
    }
    drawWaveIcon(1); drawWaveIcon(2); if(isPlaying){ changeTempo(); } else { up(); }
}

function changeMeter(m) { currentMeter = m; document.getElementById('m-4').classList.toggle('active', m === 4); document.getElementById('m-3').classList.toggle('active', m === 3); stepIndex = 0; loadM(currentPreset); }
function changePhrase(p) { currentPhrase = p; for(let i=1; i<=4; i++) { document.getElementById('p-'+i).classList.toggle('active', i === p); } stepIndex = 0; loadM(currentPreset); }

loadM('hero');
