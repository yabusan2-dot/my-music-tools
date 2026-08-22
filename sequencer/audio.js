const actx = new(window.AudioContext||window.webkitAudioContext)();

const getV = (id) => (id==='type1'||id==='type2') ? 
    document.getElementById(id).value : parseFloat(document.getElementById(id).value);

function readAllDataFromUI() {
    const npm = (currentMeter === 4) ? 8 : 6;
    const total = npm * currentPhrase; 
    melody1 = new Array(total).fill(0);
    melody2 = new Array(total).fill(0);
    for (let i = 0; i < total; i++) { 
        const e1 = document.getElementById(`t1-s-${i}`);
        const e2 = document.getElementById(`t2-s-${i}`);
        if (e1 && e1.value !== "") melody1[i] = parseFloat(e1.value);
        if (e2 && e2.value !== "") melody2[i] = parseFloat(e2.value);
    } 
}

function up() { 
    ['vol','tempo','echo','atk1','dec1','harm1','atk2','dec2','harm2'].forEach(k => { 
        const el = document.getElementById('v-'+k);
        if(el) el.textContent = document.getElementById(k).value; 
    }); 
    readAllDataFromUI();
    genC(); 
}

function toggleAcc(t, i, v) { 
    const arr = (t === 1) ? acc1 : acc2; 
    arr[i] = (arr[i] === v) ? 0 : v; 
    refreshAccUI(); 
    up(); 
    if(!isPlaying) {
        const ctx = actx;
        let f = (t === 1) ? melody1[i] : melody2[i];
        if (f > 0) {
            if (arr[i] === 1) f *= 1.059463; else if (arr[i] === -1) f /= 1.059463;
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

// 🔴 核心：アタック、ディケイ、つや(倍音)を動的にエンベロープ合成して楽器にする新エンジン
function playNote(ctx, f, type, echo, vol, time, dur, trackNum) {
    if (f === 0 || isNaN(f)) return;
    const atk = getV('atk' + trackNum), dec = getV('dec' + trackNum);
    const harm = getV('harm' + trackNum) / 100; 
    
    const baseGain = ctx.createGain(), mG = ctx.createGain(); 
    mG.connect(ctx.destination);
    
    let fac = 0.05; 
    if (type==='sine') fac=0.20; else if (type==='triangle') fac=0.15; 
    if (f<200&&(type==='sine'||type==='triangle')) fac*=2.2;
    const maxVolume = fac * (vol / 100);

    // 🎹 【アタック・ディケイのエンベロープ計算保護ガード】
    const envelopeDuration = Math.max(0.001, Math.min(dur, atk + dec));

    baseGain.gain.setValueAtTime(0, time);
    baseGain.gain.linearRampToValueAtTime(maxVolume, time + atk);
    baseGain.gain.exponentialRampToValueAtTime(0.001, time + envelopeDuration);

    mG.gain.setValueAtTime(1.0, time);
    mG.gain.exponentialRampToValueAtTime(0.001, time + dur + (echo > 0 ? echo * 2.5 : 0));

    let out = mG; 
    if (echo > 0) { 
        const d = ctx.createDelay(); d.delayTime.setValueAtTime(0.15, time); 
        const fG = ctx.createGain(); fG.gain.setValueAtTime(echo, time); 
        d.connect(fG); fG.connect(d); fG.connect(mG); out = d; 
    }

    // 基音オシレーター
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(f, time); 
    osc.connect(baseGain); baseGain.connect(mG); baseGain.connect(out); 
    osc.start(time); osc.stop(time + dur);
    activeOscillators.push(osc); // 💡 消音用に追跡

    // 🎹 倍音ブレンド回路
    if (harm > 0) {
        const harmOsc = ctx.createOscillator(), harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(0, time);
        harmGain.gain.linearRampToValueAtTime(maxVolume * harm, time + atk);
        harmGain.gain.exponentialRampToValueAtTime(0.001, time + envelopeDuration);
        harmOsc.type = 'sine'; harmOsc.frequency.setValueAtTime(f * 2, time);
        harmOsc.connect(harmGain); harmGain.connect(mG); harmGain.connect(out);
        harmOsc.start(time); harmOsc.stop(time + dur);
        activeOscillators.push(harmOsc); // 💡 消音用に追跡
    }
}
function playTracks(ctx, vol, currentStepDuration) {
    const totalLoopLength = ((currentMeter === 4) ? 8 : 6) * currentPhrase;
    const now = ctx.currentTime;
    const run = (mel, acc, ty, tNum) => {
        let f = mel[stepIndex];
        if (f <= 0 || isNaN(f)) return; 
        let tied = 0; 
        for (let j = stepIndex + 1; j < totalLoopLength; j++) { 
            if (mel[j] === -1) tied++; else break; 
        }
        const dur = currentStepDuration * (1 + tied) * 0.9;
        if (acc[stepIndex] === 1) f *= 1.059463; 
        else if (acc[stepIndex] === -1) f /= 1.059463;
        playNote(ctx, f, ty, getV('echo'), vol, now, dur, tNum);
    };
    run(melody1, acc1, getV('type1'), 1); 
    run(melody2, acc2, getV('type2'), 2);
}

function changeTempo() { 
    clearInterval(timerId); 
    if (!isPlaying) return; 
    ['vol','tempo','echo','atk1','dec1','harm1','atk2','dec2','harm2'].forEach(k => { 
        const el = document.getElementById('v-'+k);
        if(el) el.textContent = document.getElementById(k).value; 
    });
    readAllDataFromUI();
    const step = 60 / getV('tempo') / 2; 
    const totalLoopLength = ((currentMeter === 4) ? 8 : 6) * currentPhrase;
    timerId = setInterval(() => { 
        document.querySelectorAll('.note-box').forEach(b => b.classList.remove('active')); 
        if (melody1.length === 0) return;
        stepIndex = stepIndex % totalLoopLength;
        const b1 = document.getElementById('t1-box-'+stepIndex);
        const b2 = document.getElementById('t2-box-'+stepIndex); 
        if(b1) b1.classList.add('active'); 
        if(b2) b2.classList.add('active'); 
        playTracks(actx, getV('vol'), step); 
        stepIndex = (stepIndex + 1) % totalLoopLength; 
    }, step * 1000); 
}

function togglePlay() { 
    if (isPlaying) { 
        clearInterval(timerId); isPlaying = false; 
        document.getElementById('pBtn').textContent = '▶ BGMを再生する'; 
        document.querySelectorAll('.note-box').forEach(b => b.classList.remove('active')); 
        // 💡 解決の鍵：停止ボタンが押された瞬間、全オシレーターを強制消音（残響ハミ出しも全カット）
        activeOscillators.forEach(osc => { try { osc.stop(); } catch(e){} });
        activeOscillators = [];
    } else { 
        if (actx.state==='suspended') actx.resume(); isPlaying = true; stepIndex = 0; 
        document.getElementById('pBtn').textContent = '⏹ 停止する'; changeTempo(); 
    } 
}

// 🔴 改善：楽器エディット（アタック・ディケイ・つや）も5連スロットに含めてJSONセーブ
function saveData() {
    readAllDataFromUI();
    const slot = document.getElementById('saveSlot').value;
    const compositionData = {
        meter: currentMeter, phrase: currentPhrase, preset: currentPreset,
        m1: melody1, m2: melody2, a1: acc1, a2: acc2,
        t1: document.getElementById('type1').value, t2: document.getElementById('type2').value,
        vol: document.getElementById('vol').value, tempo: document.getElementById('tempo').value, echo: document.getElementById('echo').value,
        atk1: document.getElementById('atk1').value, dec1: document.getElementById('dec1').value, harm1: document.getElementById('harm1').value,
        atk2: document.getElementById('atk2').value, dec2: document.getElementById('dec2').value, harm2: document.getElementById('harm2').value
    };
    localStorage.setItem('js_bgm_slot_' + slot, JSON.stringify(compositionData));
    alert('📥 スロット ' + slot + ' に楽譜とシンセ設定を完全に記憶しました！');
}

// 🔴 改善：記憶されていた楽器つまみの位置まで100%完全再現して復元するロード回路
function loadData() {
    const slot = document.getElementById('saveSlot').value;
    const raw = localStorage.getItem('js_bgm_slot_' + slot);
    if (!raw) { alert('スロット ' + slot + ' にデータがありません。'); return; }
    const d = JSON.parse(raw);
    currentMeter = d.meter; currentPhrase = d.phrase; currentPreset = d.preset;
    melody1 = d.m1; melody2 = d.m2;
    acc1 = d.a1 ? d.a1 : new Array(32).fill(0); acc2 = d.a2 ? d.a2 : new Array(32).fill(0);
    document.getElementById('type1').value = d.t1; document.getElementById('type2').value = d.t2;
    document.getElementById('vol').value = d.vol; document.getElementById('tempo').value = d.tempo; document.getElementById('echo').value = d.echo;
    // シンセつまみ位置をUIに復元
    if(d.atk1) {
        document.getElementById('atk1').value = d.atk1; document.getElementById('dec1').value = d.dec1; document.getElementById('harm1').value = d.harm1;
        document.getElementById('atk2').value = d.atk2; document.getElementById('dec2').value = d.dec2; document.getElementById('harm2').value = d.harm2;
    }
    document.getElementById('m-4').classList.toggle('active', currentMeter === 4);
    document.getElementById('m-3').classList.toggle('active', currentMeter === 3);
    for(let i=1; i<=4; i++) { document.getElementById('p-'+i).classList.toggle('active', i === currentPhrase); }
    rebuildSequencerUI(); 
    const npm = (currentMeter === 4) ? 8 : 6, total = npm * currentPhrase;
    for (let t = 1; t <= 2; t++) {
        const tr = (t === 1) ? melody1 : melody2;
        for (let i = 0; i < total; i++) {
            const sel = document.getElementById(`t${t}-s-${i}`); if (sel && i < tr.length) sel.value = tr[i];
        }
    }
    refreshAccUI(); drawWaveIcon(1); drawWaveIcon(2);
    if(isPlaying){ changeTempo(); } else { up(); }
    alert('📤 スロット ' + slot + ' のシンセ＆楽譜を完全ロードしました！');
}

function genC() {
    const npm = (currentMeter === 4) ? 8 : 6, total = npm * currentPhrase;
    const activeMel1 = melody1.slice(0, total); const activeMel2 = melody2.slice(0, total);
    const sA1 = acc1.slice(0, total); const sA2 = acc2.slice(0, total);
    const vl = getV('vol'), tm = getV('tempo'), ec = getV('echo'), ty1 = getV('type1'), ty2 = getV('type2');
    const atk1 = getV('atk1'), dec1 = getV('dec1'), harm1 = getV('harm1')/100, atk2 = getV('atk2'), dec2 = getV('dec2'), harm2 = getV('harm2')/100;
    let ecC = ec > 0 ? `const d=ctx.createDelay(), f=ctx.createGain(); d.delayTime.setValueAtTime(0.15,now); f.gain.setValueAtTime(${ec},now); d.connect(f); f.connect(d); mG.connect(d?d:mG);` : '';
    document.getElementById('cText').textContent = `function startPolyBGM() {\n    const ctx = new AudioContext(), m1 = [${activeMel1.join(',')}], m2 = [${activeMel2.join(',')}], a1 = [${sA1.join(',')}], a2 = [${sA2.join(',')}];\n    let idx = 0, step = ${60/tm/2};\n    setInterval(() => {\n        const now = ctx.currentTime; const play = (m, acc, ty, atk, dec, harm) => {\n            let f = m[idx]; if (f <= 0) return; let tied = 0; for (let j = idx+1; j < m.length; j++) { if (m[j] === -1) tied++; else break; }\n            const dur = step * (1 + tied) * 0.9; if (acc[idx] === 1) f *= 1.059463; else if (acc[idx] === -1) f /= 1.059463;\n            const osc = ctx.createOscillator(), bG = ctx.createGain(), mG = ctx.createGain(); mG.connect(ctx.destination);\n            let fac = 0.05; if (ty==='sine') fac=0.20; else if (ty==='triangle') fac=0.15; if (f<200&&(ty==='sine'||ty==='triangle')) fac*=2.2;\n            const maxV = fac * (${vl/100}), envD = Math.max(0.001, Math.min(dur, atk + dec));\n            bG.gain.setValueAtTime(0, now); bG.gain.linearRampToValueAtTime(maxV, now + atk); bG.gain.exponentialRampToValueAtTime(0.001, now + envD);\n            mG.gain.setValueAtTime(1.0, now); mG.gain.exponentialRampToValueAtTime(0.001, now + dur + ${ec>0?(ec*2.5).toFixed(1):0});\n            let out = mG; ${ecC} osc.type = ty; osc.frequency.setValueAtTime(f, now); osc.connect(bG); bG.connect(mG); bG.connect(out); osc.start(now); osc.stop(now + dur);\n            if (harm > 0) { const hOsc = ctx.createOscillator(), hG = ctx.createGain(); hG.gain.setValueAtTime(0, now); hG.gain.linearRampToValueAtTime(maxV * harm, now + atk); hG.gain.exponentialRampToValueAtTime(0.001, now + envD); hOsc.type = 'sine'; hOsc.frequency.setValueAtTime(f * 2, now); hOsc.connect(hG); hG.connect(mG); hG.connect(out); hOsc.start(now); hOsc.stop(now + dur); }\n        };\n        play(m1, a1, '${ty1}', ${atk1}, ${dec1}, ${harm1}); play(m2, a2, '${ty2}', ${atk2}, ${dec2}, ${harm2}); idx = (idx + 1) % m1.length;\n    }, step * 1000);\n}`;
}

function dlWav() {
    const npm = (currentMeter === 4) ? 8 : 6, total = npm * currentPhrase;
    const tm = getV('tempo'), ec = getV('echo'), rate = 44100, step = 60 / tm / 2, fullD = step * total + (ec > 0 ? ec * 2.5 : 0.5), octx = new OfflineAudioContext(1, rate * fullD, rate);
    const run = (mel, acc, ty, tNum) => {
        for (let i = 0; i < total; i++) {
            let f = mel[i]; if (f <= 0) continue; 
            let tied = 0; for (let j = i+1; j < total; j++) { if (mel[j] === -1) tied++; else break; }
            const dur = step * (1 + tied) * 0.9, t = step * i;
            if (acc[i] === 1) f *= 1.059463; else if (acc[i] === -1) f /= 1.059463;
            playNote(octx, f, ty, getV('echo'), getV('vol'), t, dur, tNum);
        }
    };
    run(melody1, acc1, getV('type1'), 1); run(melody2, acc2, getV('type2'), 2);
    octx.startRendering().then(buf => {
        let res = buf.getChannelData(0).subarray(0, Math.floor(rate * (step * total))); const bl = res.length * 2, ab = new ArrayBuffer(44 + bl), v = new DataView(ab); const wS = (o, s) => { for (let i=0; i<s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
        wS(0, 'RIFF'); v.setUint32(4, 36 + bl, true); wS(8, 'WAVE'); wS(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); wS(36, 'data'); v.setUint32(40, bl, true); for (let i=0; i<res.length; i++) { let s = Math.max(-1, Math.min(1, res[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([v], { type: 'audio/wav' })); a.download = `duet_${currentMeter}b.wav`; a.click();
    });
}

function loadM(n) {
    currentPreset = n; 
    document.getElementById('tempo').value = tPresets[n];
    document.getElementById('type1').value = 
        (n==='hero'||n==='puzzle') ? 'square' : 'sawtooth'; 
    document.getElementById('type2').value = 'triangle';
    
    rebuildSequencerUI();
    melody1.fill(0); melody2.fill(0); acc1.fill(0); acc2.fill(0);
    
    const p = mPresets[n][currentMeter], 
          npm = (currentMeter === 4) ? 8 : 6, 
          total = npm * currentPhrase;
          
    for (let t = 1; t <= 2; t++) {
        const tr = p[`t${t}`], 
              tbl = (t === 1) ? scaleTable1 : scaleTable2;
        for (let i = 0; i < total; i++) {
            const sel = document.getElementById(`t${t}-s-${i}`); 
            if (!sel) continue;
            let cls = 0, min = Infinity, val = (i < tr.length) ? tr[i] : 0;
            Object.values(tbl).forEach(v => { 
                let d = Math.abs(v - val); 
                if (d < min) { min = d; cls = v; } 
            }); 
            sel.value = cls;
            if (t === 1) melody1[i] = cls; else melody2[i] = cls;
        }
    }
    refreshAccUI(); 
    drawWaveIcon(1); 
    drawWaveIcon(2); 
    if(isPlaying){ changeTempo(); } else { up(); }
}

function changeMeter(m) { 
    currentMeter = m; 
    document.getElementById('m-4').classList.toggle('active', m === 4); 
    document.getElementById('m-3').classList.toggle('active', m === 3); 
    stepIndex = 0; 
    loadM(currentPreset); 
}

function changePhrase(p) { 
    currentPhrase = p; 
    for(let i=1; i<=4; i++) { 
        document.getElementById('p-'+i).classList.toggle('active', i === p); 
    } 
    stepIndex = 0; 
    rebuildSequencerUI(); 
    refreshAccUI(); 
    if(isPlaying){ changeTempo(); } else { up(); } 
}

loadM('hero');
