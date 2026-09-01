        const actx = new(window.AudioContext||window.webkitAudioContext)(); let pName = 'jump';
        const getV = (id) => (id==='type'||id==='ramp') ? document.getElementById(id).value : parseFloat(document.getElementById(id).value);

        function up() { 
                ['echo','nMix','sF','eF','dur'].forEach(k => { 
                document.getElementById('v-'+k).textContent = document.getElementById(k).value;
                 }); 
                genC(); 
        }

        function copyC() { navigator.clipboard.writeText(document.getElementById('cText').textContent); }

        function drawWaveIcon() {
            const type = document.getElementById('type').value;
            const container = document.getElementById('wavePreview');
            let path = "";
            if (type === 'sine') path = "M 5,17 Q 17,2 30,17 T 55,17";
            else if (type === 'square') path = "M 5,27 L 5,7 L 30,7 L 30,27 L 55,27";
            else if (type === 'sawtooth') path = "M 5,27 L 30,7 L 30,27 L 55,7";
            else if (type === 'triangle') path = "M 5,27 L 17,7 L 42,27 L 55,7";
            container.innerHTML = `<svg width="60" height="34"><path d="${path}" class="wave-svg"/></svg>`;
        }

        // 🎨 新設：選択された変化型（Ramp）と始動・終了周波数（上下関係）をSVGで描画するロジック
        function drawRampIcon() {
            const ramp = document.getElementById('ramp').value;
            const sF = getV('sF'); const eF = getV('eF');
            const container = document.getElementById('rampPreview');
            
            // 周波数の高低によってグラフのスタート・ゴール地点の上下を入れ替える
            const isUp = eF >= sF;
            const yStart = isUp ? 27 : 7;
            const yEnd = isUp ? 7 : 27;
            
            let path = "";
            if (ramp === 'linear') {
                path = `M 10,${yStart} L 50,${yEnd}`; // まっすぐな直線
            } else if (ramp === 'exponential') {
                // カーブを描く（上るか下るかで制御点を変える）
                path = isUp ? `M 10,27 Q 45,27 50,7` : `M 10,7 Q 15,27 50,27`;
            } else if (ramp === 'jump') {
                // コイン音のような階段状の動き（25%の位置で跳ねる）
                path = `M 10,${yStart} L 20,${yStart} L 20,${yEnd} L 50,${yEnd}`;
            }
            container.innerHTML = `<svg width="60" height="34"><path d="${path}" class="ramp-svg"/></svg>`;
        }

    // 1. 引数に rate と amp を追加
    function sGraph(ctx, echo, nMix, type, sF, eF, dur, ramp, rate, amp) {
    const mG = ctx.createGain(); mG.connect(ctx.destination); const now = ctx.currentTime;
    mG.gain.setValueAtTime(0.28, now); mG.gain.exponentialRampToValueAtTime(0.001, now + dur + (echo > 0 ? 1.0 : 0));
    let dNode = null, fG = null;
    if (echo > 0) {
        dNode = ctx.createDelay(); dNode.delayTime.setValueAtTime(0.12, now);
        fG = ctx.createGain(); fG.gain.setValueAtTime(echo, now);
        dNode.connect(fG); fG.connect(dNode); fG.connect(mG);
    }
    const outNode = dNode ? dNode : mG;
    let nS = null; if (nMix > 0) {
        nS = ctx.createBufferSource(); const rate = ctx.sampleRate, size = rate * dur, buf = ctx.createBuffer(1, size, rate), d = buf.getChannelData(0);
        for(let i=0; i<size; i++) d[i] = Math.random()*2-1; nS.buffer = buf; 
        const nG = ctx.createGain(); nG.gain.setValueAtTime(nMix * 1.5, now); nS.connect(nG); nG.connect(mG); nG.connect(outNode);
    }
    
    // 返却用に変調用オシレーターの変数も用意
    let osc = null, modOsc = null; 
    if (1 - nMix > 0) {
        osc = ctx.createOscillator(); const tG = ctx.createGain(); 
        let tFactor = 0.4;
        if (type === 'sine') tFactor = 1.5; 
        else if (type === 'triangle') tFactor = 0.85;
        tG.gain.setValueAtTime((1 - nMix) * tFactor, now);
        osc.type = type; 
        osc.frequency.setValueAtTime(sF, now);

        if (ramp === 'linear') osc.frequency.linearRampToValueAtTime(eF, now + dur);
        else if (ramp === 'exponential') osc.frequency.exponentialRampToValueAtTime(Math.max(1, eF), now + dur);
        else if (ramp === 'jump') osc.frequency.setValueAtTime(eF, now + (dur * 0.25));

        // ★★★ ここからFM合成（数式FM合成のWeb Audio API版表現）★★★
            modOsc = ctx.createOscillator(); // 変化速度（モジュレータ）用のオシレーター
            modGain = ctx.createGain(); // 変化の強さ（振幅）用のゲイン

            modOsc.type = 'sine';
            modOsc.frequency.setValueAtTime(rate, now); // 変化速度（Hz）
            modGain.gain.setValueAtTime(amp, now);      // 変化の強さ（振幅）

            // 接続の魔法： modOsc ➔ modGain ➔ メインオシレーターの周波数パラメータ
            modOsc.connect(modGain);
            modGain.connect(osc.frequency); 

        // ★★★ ここまで ★★★

        osc.connect(tG);
        tG.connect(mG); 
        tG.connect(outNode);

    }
    // play関数側で start/stop 制御できるように、modOsc も一緒に返却する
    return { nS, osc, modOsc };
}

function play() { 
    if (actx.state==='suspended') actx.resume(); 
    
    // 引数の最後に rate と amp の読み込みを追加
    const s = sGraph(actx, getV('echo'), getV('nMix'), getV('type'), getV('sF'), getV('eF'), getV('dur'), getV('ramp'), getV('rate'), getV('amp')); 
    
    if(s.nS){
    s.nS.start();
    s.nS.stop(actx.currentTime+getV('dur'));
    } 

    if(s.osc){
    s.osc.start();
    s.osc.stop(actx.currentTime+getV('dur'));
    } 
    
    // ★★★ 変調用オシレーターがある場合は同時に再生・停止させる ★★★
    if(s.modOsc){
    s.modOsc.start();
    s.modOsc.stop(actx.currentTime+getV('dur'));
    } 

    if (s.osc) {
        s.osc.onended = () => {
            // メインの接続を解除
            if (s.osc) s.osc.disconnect();
            // ★今回のFM合成用ノード（modOsc）があればそれも切断！
            if (s.modOsc) s.modOsc.disconnect();  

            // ノイズ（nS）があればそれも切断
            if (s.nS) s.nS.disconnect();
        };
    } else if (s.nS) {
        // オシレーターがなく、ノイズだけの音源の場合
        s.nS.onended = () => {
        if (s.nS) s.nS.disconnect();
    };
    }
}

function genC() {
    const ec = getV('echo'), nM = getV('nMix'), ty = getV('type'), sF = getV('sF'), eF = getV('eF'), du = getV('dur'), ra = getV('ramp');
    // 新しいパラメータの取得
    const raVal = getV('rate'), amVal = getV('amp'); 
    const sn = pName.replace(/[^a-zA-Z0-9_]/g, "se");

    let pC = `osc.frequency.setValueAtTime(${sF}, now); osc.frequency.${ra==='jump'?'setValueAtTime':ra+'RampToValueAtTime'}(${eF}, now + ${ra==='jump'?du+'*0.25':du});`;
    let ecC = ec > 0 ? `const d = ctx.createDelay(), f = ctx.createGain(); d.delayTime.setValueAtTime(0.12, now); f.gain.setValueAtTime(${ec}, now); d.connect(f); f.connect(d); f.connect(mG);` : '';
    let conn = ec > 0 ? `connect(mG); n.connect(d);` : `connect(mG);`;
    let connO = ec > 0 ? `connect(mG); osc.connect(tG); tG.connect(d);` : `connect(mG);`;

    // ★★★ FM合成用のコードパーツを動的に生成 ★★★
    let fmC = '';
    let fmStartStop = '';
    if (ty === 'sine' && amVal > 0) {
        fmC = `\n        const modOsc = ctx.createOscillator(), modGain = ctx.createGain(); modOsc.type = 'sine'; modOsc.frequency.setValueAtTime(${raVal}, now); modGain.gain.setValueAtTime(${amVal}, now); modOsc.connect(modGain); modGain.connect(osc.frequency);`;
        fmStartStop = ` modOsc.start(now); modOsc.stop(now + ${du});`;
    }

    document.getElementById('cText').textContent = `function play_${sn}_Sound() {
    const ctx = new AudioContext(), now = ctx.currentTime, mG = ctx.createGain(); mG.connect(ctx.destination);
    mG.gain.setValueAtTime(0.28, now); mG.gain.exponentialRampToValueAtTime(0.001, now + ${du} + ${ec!=='0'?1.0:0});
    ${ecC}
    if (${nM} > 0) { const sz = ctx.sampleRate * ${du}, buf = ctx.createBuffer(1, sz, ctx.sampleRate), dData = buf.getChannelData(0); for (let i = 0; i < sz; i++) dData[i] = Math.random() * 2 - 1; const n = ctx.createBufferSource(); n.buffer = buf; const nG = ctx.createGain(); nG.gain.setValueAtTime(${nM * 1.5}, now); n.connect(nG); nG.${conn} n.start(now); n.stop(now + ${du}); }
    if (${1-nM} > 0) { const osc = ctx.createOscillator(), tG = ctx.createGain(); let tf = 0.1; if('${ty}'==='sine') tf=0.65; else if('${ty}'==='triangle') tf=0.35; tG.gain.setValueAtTime(${1-nM} * tf, now); osc.type = '${ty}'; ${pC}${fmC} osc.connect(tG); tG.${connO} osc.start(now);${fmStartStop} osc.stop(now + ${du}); }
}`;
}

        function dlWav() {
            const ec = getV('echo'), nM = getV('nMix'), ty = getV('type'), sF = getV('sF'), eF = getV('eF'), du = getV('dur'), fr = getV('rate'), fa = getV('amp'), ra = getV('ramp'), rate = 44100, totalD = du + (ec > 0 ? 1.0 : 0), frames = rate * totalD, octx = new OfflineAudioContext(1, frames, rate);
            const s = sGraph(octx, ec, nM, ty, sF, eF, du, ra, fr, fa ); 
            if(s.nS){
                s.nS.start(0);
                s.nS.stop(du);
                } 
            if(s.osc){
                s.osc.start(0);
                s.osc.stop(du);
                }
            if(s.modOsc){
                s.modOsc.start(0);
                s.modOsc.stop(du);
                }
            if (s.osc) {
        s.osc.onended = () => {
            if (s.osc) s.osc.disconnect();
            if (s.modOsc) s.modOsc.disconnect(); 
            if (s.nS) s.nS.disconnect();
        };
    } else if (s.nS) {
        s.nS.onended = () => {
        if (s.nS) s.nS.disconnect();
    };
    }
            octx.startRendering().then(buf => {
                let res = buf.getChannelData(0), bl = res.length * 2, ab = new ArrayBuffer(44 + bl), v = new DataView(ab);
                const wS = (o, s) => { for (let i=0; i<s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
                wS(0, 'RIFF'); 
            v.setUint32(4, 36 + bl, true); wS(8, 'WAVE'); 
            wS(12, 'fmt '); v.setUint32(16, 16, true); 
            v.setUint16(20, 1, true); v.setUint16(22, 1, true); 
            v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); 
            v.setUint16(32, 2, true); 
            v.setUint16(34, 16, true); wS(36, 'data'); 
            v.setUint32(40, bl, true);
                for (let i=0; i<res.length; i++) { let s = Math.max(-1, Math.min(1, res[i])); 
            v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
                const a = document.createElement('a'); 
            a.href = URL.createObjectURL(new Blob([v], { type: 'audio/wav' })); 
            a.download = `${pName}_effect.wav`; a.click();
            });
        }

        const presets = {
            magic: { noiseMix: 0.1, type: 'sine', startFreq: 590, endFreq: 1770, duration: 1.0, ramp: 'linear', echo: 0.1 , rate: 10 , amp: 130 },
            frog: { noiseMix: 0, type: 'sine', startFreq: 540, endFreq: 1330, duration: 0.3, ramp: 'exponential', echo: 0.2 , rate: 70 , amp: 525 },
            warp: { noiseMix: 0, type: 'triangle', startFreq: 2000, endFreq: 900, duration: 1.0, ramp: 'exponential', echo: 0.4 , rate: 10 , amp: 615 },
            bird: { noiseMix: 0, type: 'triangle', startFreq: 4080, endFreq: 5040, duration: 0.6, ramp: 'linear', echo: 0.1 , rate: 10 , amp: 750 },
            insect: { noiseMix: 0, type: 'triangle', startFreq: 5600, endFreq: 6000, duration: 1.6, ramp: 'exponential', echo: 0.2 , rate: 0 , amp: 0 },
            sword: { noiseMix: 0.2, type: 'sine', startFreq: 5260, endFreq: 7220, duration: 0.1, ramp: 'linear', echo: 0.2 , rate: 1500 , amp: 800 }, 
            explosion: { noiseMix: 0.8, type: 'sawtooth', startFreq: 200, endFreq: 40, duration: 0.5, ramp: 'linear', echo: 0 , rate: 0 , amp: 0 }, 
            sandstorm: { noiseMix: 1, type: 'sine', startFreq: 440, endFreq: 440, duration: 1.5, ramp: 'linear', echo: 0, rate: 0 , amp: 300 },
            laser: { noiseMix: 0.2, type: 'sawtooth', startFreq: 1600, endFreq: 100, duration: 0.25, ramp: 'linear', echo: 0.4, rate: 0 , amp: 0 }, 
            coin: { noiseMix: 0, type: 'square', startFreq: 587, endFreq: 880, duration: 0.3, ramp: 'jump', echo: 0.4, rate: 0 , amp: 0 },
            jump: { noiseMix: 0, type: 'sine', startFreq: 150, endFreq: 600, duration: 0.35, ramp: 'exponential', echo: 0.6, rate: 0 , amp: 300 }, 
            hit: { noiseMix: 0.5, type: 'triangle', startFreq: 120, endFreq: 40, duration: 0.12, ramp: 'linear', echo: 0, rate: 0 , amp: 0 }
        };
        
        function loadP(n) 
        { 
        pName = n; 
        const p = presets[n]; 
        document.getElementById('echo').value = p.echo; 
        document.getElementById('type').value = p.type; 
        document.getElementById('ramp').value = p.ramp; 
        document.getElementById('rate').value = p.rate; 
        document.getElementById('amp').value = p.amp; 
        drawWaveIcon(); 
        drawRampIcon(); 
        applyP(p); 
        }

        function applyP(p) 
        { 
        
        document.getElementById('nMix').value = p.noiseMix; 
        document.getElementById('sF').value = p.startFreq; 
        document.getElementById('eF').value = p.endFreq; 
        document.getElementById('dur').value = p.duration; 
        up(); 
        play(); 
        }

        function getF() { const f = localStorage.getItem('js_sm_f2'); return f ? JSON.parse(f) : {}; }

        function saveF() 
        {
            const inp = document.getElementById('fIn'), n = inp.value.trim(); 
            if (!n) return; 
            const f = getF(); f[n] = 
            { 
                echo: getV('echo'), noiseMix: getV('nMix'), type: getV('type'), startFreq: getV('sF'), endFreq: getV('eF'), duration: getV('dur'), ramp: getV('ramp'), rate: getV('rate'), amp: getV('amp') 
            }; 
            localStorage.setItem('js_sm_f2', JSON.stringify(f)); 
            inp.value = ''; 
            pName = n; 
            rFavs(); 
            genC();
        }
 
        function delF(n) { const f = getF(); delete f[n]; localStorage.setItem('js_sm_f2', JSON.stringify(f)); rFavs(); }
 
        function loadF(n) { 
        const f = getF(); 
        if (f[n]) { 
        pName = n; 
        document.getElementById('echo').value = f[n].echo || 0;
        document.getElementById('nMix').value = f[n].nMix || 0;
        document.getElementById('type').value = f[n].type || "sine"; 
        document.getElementById('ramp').value = f[n].ramp || "linear"; 
        document.getElementById('sF').value = f[n].sF || 40; 
        document.getElementById('eF').value = f[n].eF || 40; 
        document.getElementById('dur').value = f[n].dur || 0.05; 
        document.getElementById('rate').value = f[n].rate || 0; 
        document.getElementById('amp').value = f[n].amp || 300;
        drawWaveIcon(); 
        drawRampIcon(); 
        applyP(f[n]);
         } }
 
        function rFavs() { const f = getF(), list = document.getElementById('fList'); 
        list.innerHTML = ''; const keys = Object.keys(f); 
        if (keys.length === 0) { list.innerHTML = '<div style="color:#777;text-align:center;">なし</div>'; return; } keys.forEach(n => { const div = document.createElement('div'); div.style = 'display:flex; justify-content:space-between; margin-bottom:3px;'; div.innerHTML = `<span style="cursor:pointer;color:#a9ffb4;" onclick="loadF('${n}')">⭐ ${n}</span><button style="background:#e53935;color:#fff;padding:2px 5px;font-size:0.7rem;" onclick="delF('${n}')">消去</button>`; list.appendChild(div); }); }
        
        function playMulti() {
            if (actx.state === 'suspended') actx.resume();

            const count = 10; // 複製数（UIから取得）
            const totalDuration = getV('dur'); // ベースの長さ
            const now = actx.currentTime;

            // 複製数ぶんループを回して、時間差でトリガーする
            for (let i = 0; i < count; i++) {
                // 例：0秒 〜 0.1秒の間でランダムに発音タイミングをズラす（前に無音を入れるのと同じ効果）
                //const randomDelay = Math.random() * 0.5;
                const randomDelay = 0.05 + 0.05 *i;
                const startTime = now + randomDelay;

                // 既存のグラフ構築関数をそのまま利用して、新しいノード（音源）を生成
                const s = sGraph(actx, getV('echo'), getV('nMix'), getV('type'), getV('sF'), getV('eF'), totalDuration, getV('ramp'), getV('rate'), getV('amp'));

                // 指定した未来の時間（startTime）に再生・停止を予約する
                if (s.nS) {
                    s.nS.start(startTime);
                    s.nS.stop(startTime + totalDuration);
                }
                if (s.osc) {
                    s.osc.start(startTime);
                    s.osc.stop(startTime + totalDuration);
                }
                if (s.modOsc) {
                    s.modOsc.start(startTime);
                    s.modOsc.stop(startTime + totalDuration);
                }

                // 昨日入れたクリーンアップ処理（disconnect）もここに紐付けておく
                // （各ノードがそれぞれの終了タイミングで自動消滅するようにする）
                    if (s.osc) {
        s.osc.onended = () => {
            // メインの接続を解除
            if (s.osc) s.osc.disconnect();
            // ★今回のFM合成用ノード（modOsc）があればそれも切断！
            if (s.modOsc) s.modOsc.disconnect(); 
            // ノイズ（nS）があればそれも切断
            if (s.nS) s.nS.disconnect();
        };
    } else if (s.nS) {
        // オシレーターがなく、ノイズだけの音源の場合
        s.nS.onended = () => {
        if (s.nS) s.nS.disconnect();
    };
    }
            }
        }

        function dlWavml() {
           const count = 10; // 複製数（UIから取得）
            const totalDuration = getV('dur'); // ベースの長さ
            const now = actx.currentTime;
            const ec = getV('echo'), nM = getV('nMix'), ty = getV('type'), sF = getV('sF'), eF = getV('eF'), du = getV('dur'), fr = getV('rate'), fa = getV('amp'), ra = getV('ramp'), rate = 44100, totalD = du + (ec > 0 ? 1.0 : 0), frames = rate * totalD, octx = new OfflineAudioContext(1, frames, rate);

            for (let i = 0; i < count; i++) {
                // 例：0秒 〜 0.1秒の間でランダムに発音タイミングをズラす（前に無音を入れるのと同じ効果）
                //const randomDelay = Math.random() * 0.5;
                const randomDelay = 0.05 + 0.05 *i;
                const startTime = now + randomDelay;

            const s = sGraph(octx, ec, nM, ty, sF, eF, du, ra, fr, fa ); 
            if(s.nS){
                s.nS.start(randomDelay);
                s.nS.stop(du + randomDelay);
                } 
            if(s.osc){
                s.osc.start(randomDelay);
                s.osc.stop(du + randomDelay);
                }
            if(s.modOsc){
                s.modOsc.start(randomDelay);
                s.modOsc.stop(du + randomDelay);
                }
            if (s.osc) {
                s.osc.onended = () => {
                    if (s.osc) s.osc.disconnect();
                    if (s.modOsc) s.modOsc.disconnect(); 
                    if (s.nS) s.nS.disconnect();
                };
            } else if (s.nS) {
                s.nS.onended = () => {
                    if (s.nS) s.nS.disconnect();
                };
            }
            }
            octx.startRendering().then(buf => {
                let res = buf.getChannelData(0), bl = res.length * 2, ab = new ArrayBuffer(44 + bl), v = new DataView(ab);
                const wS = (o, s) => { for (let i=0; i<s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
                wS(0, 'RIFF'); 
            v.setUint32(4, 36 + bl, true); wS(8, 'WAVE'); 
            wS(12, 'fmt '); v.setUint32(16, 16, true); 
            v.setUint16(20, 1, true); v.setUint16(22, 1, true); 
            v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); 
            v.setUint16(32, 2, true); 
            v.setUint16(34, 16, true); wS(36, 'data'); 
            v.setUint32(40, bl, true);
                for (let i=0; i<res.length; i++) { let s = Math.max(-1, Math.min(1, res[i])); 
            v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
                const a = document.createElement('a'); 
            a.href = URL.createObjectURL(new Blob([v], { type: 'audio/wav' })); 
            a.download = `${pName}_Multi.wav`; a.click();
            });
        }
        
        
        // 🔴 初回起動時に波形図と変化図の両方を描画
        rFavs(); drawWaveIcon(); drawRampIcon(); up();