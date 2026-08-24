// ==========================================
// 🚨 【最優先・完全防御】非同期ファイル読み込み関数を1行目に大移動
// ==========================================
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

window.currentAudioBuffer = null; 
window.currentBpm = null; 
let audioCtx = null;
let popoutWindow = null; 
let animationFrameId = null; 

const waveCanvas = document.getElementById('waveCanvas');
const fftCanvas = document.getElementById('fftCanvas');

// スライダーや入力値から現在の加工パラメーターを収集する関数
function getUiParams() {
  return {
    trimStart: parseFloat(document.getElementById('trimStart').value) || 0,
    trimEnd: parseFloat(document.getElementById('trimEnd').value) || (window.currentAudioBuffer ? window.currentAudioBuffer.duration : 0),
    bpm: parseFloat(document.getElementById('manualBpm').value) || window.currentBpm || null,
    pitch: parseFloat(document.getElementById('pitch').value),
    speed: parseFloat(document.getElementById('speed').value),
    mod: parseFloat(document.getElementById('mod').value)
  };
}

function resizeCanvas() {
  waveCanvas.width = waveCanvas.clientWidth;
  waveCanvas.height = waveCanvas.clientHeight;
  fftCanvas.width = fftCanvas.clientWidth;
  fftCanvas.height = fftCanvas.clientHeight;
  
  const p = getUiParams();
  drawWaveform(waveCanvas, window.currentAudioBuffer, window.currentBpm, p.trimStart, p.trimEnd);
  drawFFTGraph(fftCanvas, null);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('DOMContentLoaded', resizeCanvas);

function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// --- ① ファイル選択時の処理 ---
document.getElementById('audioFile').addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  
  const ctx = initAudioContext();
  if (window.Tone) { await Tone.start(); }
  if (ctx && ctx.state === 'suspended') { await ctx.resume(); }
  if (isPlaying) { handleStop(); }
  
  const file = e.target.files[0]; // 1つ目のファイルを確実に指定
  document.getElementById('fileLabel').innerText = `読み込み中: ${file.name}`;
  
  document.getElementById('resBpm').innerText = "---";
  document.getElementById('resAttack').innerText = "0.000";
  window.currentBpm = null;
  
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    window.currentAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    const duration = window.currentAudioBuffer.duration;
    document.getElementById('fileLabel').innerText = `🎵 読込完了: ${file.name} (${duration.toFixed(2)}秒)`;
    
    const sSlider = document.getElementById('trimStart');
    const eSlider = document.getElementById('trimEnd');
    sSlider.max = duration; sSlider.value = 0; sSlider.disabled = false;
    eSlider.max = duration; eSlider.value = duration; eSlider.disabled = false;
    
    document.getElementById('v-trimStart').innerText = "0.000";
    document.getElementById('v-trimEnd').innerText = duration.toFixed(3);
    
    document.getElementById('btnStartMinus').disabled = false;
    document.getElementById('btnStartPlus').disabled = false;
    document.getElementById('btnEndMinus').disabled = false;
    document.getElementById('btnEndPlus').disabled = false;
    
    document.getElementById('manualBpm').disabled = false;
    document.getElementById('btnBpmHalf').disabled = false;
    document.getElementById('btnBpmDouble').disabled = false;
    
    resizeCanvas();
    
    if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveformExternal === 'function') {
      popoutWindow.refreshWaveformExternal();
    }
    
    document.getElementById('popoutBtn').disabled = false;
    document.getElementById('analyzeBtn').disabled = false; 
    document.getElementById('playBtn').disabled = false;
    document.getElementById('saveBtn').disabled = false; 
    
  } catch (error) {
    console.error("音声ファイルの解析に失敗しました:", error);
    document.getElementById('fileLabel').innerText = "❌ 読み込みエラー";
    window.currentAudioBuffer = null;
    resizeCanvas();
    
    if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveformExternal === 'function') {
      popoutWindow.refreshWaveformExternal();
    }
    
    document.getElementById('popoutBtn').disabled = true;
    document.getElementById('analyzeBtn').disabled = true;
    document.getElementById('playBtn').disabled = true;
    document.getElementById('saveBtn').disabled = true;
  }
});
// --- ②.5 自動解析ボタンが押された時の処理 ---
document.getElementById('analyzeBtn').addEventListener('click', () => {
  if (!window.currentAudioBuffer) return;
  
  const analyzeBtn = document.getElementById('analyzeBtn');
  analyzeBtn.innerText = "解析実行中...";
  analyzeBtn.disabled = true;

  setTimeout(() => {
    const result = analyzeAudioBuffer(window.currentAudioBuffer);
    
    document.getElementById('resBpm').innerText = result.bpm;
    document.getElementById('resAttack').innerText = result.attackTime.toFixed(3);
    
    window.currentBpm = result.bpm;
    document.getElementById('manualBpm').value = result.bpm;
    
    const sSlider = document.getElementById('trimStart');
    sSlider.value = result.attackTime;
    document.getElementById('v-trimStart').innerText = result.attackTime.toFixed(3);
    
    resizeCanvas(); 

    if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveformExternal === 'function') {
      popoutWindow.refreshWaveformExternal();
    }

    analyzeBtn.innerText = "🔍 音源のBPM・アタックを自動解析";
    analyzeBtn.disabled = false;
    
    if (isPlaying) {
      updateLiveParameters(getUiParams());
    }
  }, 10);
});

// --- 各種スライダー変更時のリアルタイム連動 ---
document.getElementById('trimStart').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('v-trimStart').innerText = val.toFixed(3);
  const eSlider = document.getElementById('trimEnd');
  if (val > parseFloat(eSlider.value)) {
    eSlider.value = val;
    document.getElementById('v-trimEnd').innerText = val.toFixed(3);
  }
  resizeCanvas();
  if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveform === 'function') {
    popoutWindow.refreshWaveform();
  }
  if (isPlaying) updateLiveParameters(getUiParams()); 
});

document.getElementById('trimEnd').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById('v-trimEnd').innerText = val.toFixed(3);
  const sSlider = document.getElementById('trimStart');
  if (val < parseFloat(sSlider.value)) {
    sSlider.value = val;
    document.getElementById('v-trimStart').innerText = val.toFixed(3);
  }
  resizeCanvas();
  if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveform === 'function') {
    popoutWindow.refreshWaveform();
  }
  if (isPlaying) updateLiveParameters(getUiParams()); 
});

// --- ◀ ▶ マイクロ調整ボタンクリック時の 0.001秒インクリメント処理 ---
document.getElementById('btnStartMinus').addEventListener('click', () => {
  const sSlider = document.getElementById('trimStart');
  sSlider.value = Math.max(0, parseFloat(sSlider.value) - 0.001);
  sSlider.dispatchEvent(new Event('input'));
});
document.getElementById('btnStartPlus').addEventListener('click', () => {
  const sSlider = document.getElementById('trimStart');
  sSlider.value = Math.min(parseFloat(sSlider.max), parseFloat(sSlider.value) + 0.001);
  sSlider.dispatchEvent(new Event('input'));
});

document.getElementById('btnEndMinus').addEventListener('click', () => {
  const eSlider = document.getElementById('trimEnd');
  eSlider.value = Math.max(0, parseFloat(eSlider.value) - 0.001);
  eSlider.dispatchEvent(new Event('input'));
});
document.getElementById('btnEndPlus').addEventListener('click', () => {
  const eSlider = document.getElementById('trimEnd');
  eSlider.value = Math.min(parseFloat(eSlider.max), parseFloat(eSlider.value) + 0.001);
  eSlider.dispatchEvent(new Event('input'));
});

// --- エフェクトつまみ類のリアルタイム数値テキスト連動 ---
document.getElementById('pitch').addEventListener('input', (e) => {
  const val = e.target.value;
  document.getElementById('v-pitch').innerText = (val > 0 ? "+" : "") + val;
  if (isPlaying) updateLiveParameters(getUiParams());
});

document.getElementById('speed').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value).toFixed(2);
  document.getElementById('v-speed').innerText = val;
  if (isPlaying) updateLiveParameters(getUiParams());
});

document.getElementById('mod').addEventListener('input', (e) => {
  const val = e.target.value;
  document.getElementById('v-mod').innerText = val;
  if (isPlaying) updateLiveParameters(getUiParams());
});

document.getElementById('manualBpm').addEventListener('input', (e) => {
  window.currentBpm = parseFloat(e.target.value) || null;
  resizeCanvas();
  if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveform === 'function') {
    popoutWindow.refreshWaveform();
  }
});
document.getElementById('btnBpmHalf').addEventListener('click', () => {
  const input = document.getElementById('manualBpm');
  const nextBpm = Math.round(parseFloat(input.value) / 2);
  input.value = nextBpm; window.currentBpm = nextBpm; resizeCanvas();
  if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveform === 'function') {
    popoutWindow.refreshWaveform();
  }
});
document.getElementById('btnBpmDouble').addEventListener('click', () => {
  const input = document.getElementById('manualBpm');
  const nextBpm = Math.round(parseFloat(input.value) * 2);
  input.value = nextBpm; window.currentBpm = nextBpm; resizeCanvas();
  if (popoutWindow && !popoutWindow.closed && typeof popoutWindow.refreshWaveform === 'function') {
    popoutWindow.refreshWaveform();
  }
});

// --- ② 再生・停止ボタンの処理 ---
document.getElementById('playBtn').addEventListener('click', () => {
  if (!window.currentAudioBuffer) return;
  initAudioContext();

  if (isPlaying) {
    handleStop();
  } else {
    const p = getUiParams();
    startPlayback(window.currentAudioBuffer, p);
    document.getElementById('playBtn').innerText = "⏹ 停止する";
    renderLoop();
  }
});

function handleStop() {
  stopPlayback(); 
  document.getElementById('playBtn').innerText = "▶ 範囲内を試聴・ループ再生";
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  resizeCanvas();
}

// --- ③ 毎秒60フレームのリアルタイム描画ループ ---
function renderLoop() {
  if (!isPlaying) return;

  const p = getUiParams();
  drawWaveform(waveCanvas, window.currentAudioBuffer, window.currentBpm, p.trimStart, p.trimEnd);
  
  const progress = getPlaybackProgress(); 
  const marginLeft = 45; 
  const waveWidth = waveCanvas.width - marginLeft;
  const waveHeight = waveCanvas.height - 20;
  
  const lineX = marginLeft + (waveWidth * progress);
  
  const ctx = waveCanvas.getContext('2d');
  ctx.strokeStyle = '#ff3366'; 
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lineX, 0); ctx.lineTo(lineX, waveHeight); ctx.stroke();

  const fftData = getFFTData();
  drawFFTGraph(fftCanvas, fftData);

  animationFrameId = requestAnimationFrame(renderLoop);
}

// --- ④ 周波数特性（FFT）のグラフ描画 ---
function drawFFTGraph(canvas, fftData) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width; const height = canvas.height;

  ctx.clearRect(0, 0, width, height); 
  ctx.fillStyle = '#050608'; 
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#303b4d'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(0, height * 0.25); ctx.lineTo(width, height * 0.25);
  ctx.moveTo(0, height * 0.5);  ctx.lineTo(width, height * 0.5);
  ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
  ctx.stroke();

  if (!fftData) return;
  const barCount = 40; const barWidth = (width / barCount);
  ctx.fillStyle = '#78ffd6'; 
  for (let i = 0; i < barCount; i++) {
    const dataIdx = Math.floor(Math.pow(i / barCount, 2) * (fftData.length * 0.6));
    const dbValue = fftData[dataIdx]; 
    const normalizedVol = Math.max(0, (dbValue + 80) / 80); 
    const barHeight = normalizedVol * height;
    ctx.fillRect(i * barWidth + 1, height - barHeight, barWidth - 2, barHeight);
  }
}

// --- ⑤ 加工された音声のオフラインレンダリング ＆ 16bit Wav保存処理 ---
document.getElementById('saveBtn').addEventListener('click', async () => {
  if (!window.currentAudioBuffer) return;
  await Tone.start();

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.innerText = "Wavファイルを生成中...";
  saveBtn.disabled = true;

  try {
    const p = getUiParams();
    const originalDur = p.trimEnd - p.trimStart;
    const finalDuration = originalDur / p.speed;

    const renderedBuffer = await Tone.Offline(async (context) => {
      const offlineTremolo = new Tone.Tremolo(6, p.mod / 100).toDestination().start();
      
      // 【修正】保存用エディターでも GrainPlayer に変更してピッチを独立固定化
      const offlinePlayer = new Tone.GrainPlayer(window.currentAudioBuffer).connect(offlineTremolo);
      offlinePlayer.grainSize = 0.1;
      offlinePlayer.overlap = 0.05;
      
      offlinePlayer.playbackRate = p.speed;
      offlinePlayer.detune = p.pitch * 100; // ここでピッチ変更を完全に焼き付けます

      offlinePlayer.start(0, p.trimStart);
    }, finalDuration);

    const wavBlob = audioBufferToWav(renderedBuffer);
    const url = URL.createObjectURL(wavBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = "processed_loop_bgm.wav"; 
    a.click();
    URL.revokeObjectURL(url);

    saveBtn.innerText = "📥 加工してWavとして保存";
    saveBtn.disabled = false;
  } catch (error) {
    console.error("Wav保存処理に失敗しました:", error);
    saveBtn.innerText = "📥 加工してWavとして保存";
    saveBtn.disabled = false;
    alert("保存中にエラーが発生しました。");
  }
});

// --- ⑤ 別タブ表示ボタン処理 ---
document.getElementById('popoutBtn').addEventListener('click', () => {
  if (!window.currentAudioBuffer) return;
  initAudioContext();
  if (popoutWindow && !popoutWindow.closed) {
    popoutWindow.focus();
    return;
  }
  popoutWindow = window.open('popout.html', 'WaveformPopout', 'width=1000,height=500,scrollbars=no,resizable=yes');
});

window.addEventListener('beforeunload', () => {
  if (popoutWindow && !popoutWindow.closed) { popoutWindow.close(); }
});
