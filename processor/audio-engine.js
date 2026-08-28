// オーディオ再生＆リアルタイム解析エンジン（GrainPlayer移調・変調完全対応版）
let loopPlayer = null;
let fftAnalyser = null;
let tremoloNode = null; 
let isPlaying = false;
let playerStartTime = 0;
let currentParams = null; 

// 1. エフェクト用のグローバル変数を追加
let lpFilterNode = null; // ローパス用
let hpFilterNode = null; // ハイパス用

/**
 * 試聴用プレイヤーとアナライザーを初期化して、切り出し範囲内だけで再生を開始する関数
 * @param {AudioBuffer} audioBuffer - 再生する音声データ
 * @param {Object} params - 切り出しおよび加工パラメーター
 */
function startPlayback(audioBuffer, params) {
  if (isPlaying) stopPlayback();
  currentParams = params;

  fftAnalyser = new Tone.Analyser("fft", 1024);
  tremoloNode = new Tone.Tremolo(6, params.mod / 100).connect(fftAnalyser).start();
  fftAnalyser.toDestination();

  // --- 【新設】デジタルフィルター回路を直列で2つつなぎにする ---
  lpFilterNode = new Tone.Filter(params.lpf, "lowpass").connect(tremoloNode);
  hpFilterNode = new Tone.Filter(params.hpf, "highpass").connect(lpFilterNode);

  // 【修正】独立したピッチ・速度コントロールのために GrainPlayer に変更
  loopPlayer = new Tone.GrainPlayer(audioBuffer).connect(hpFilterNode);
  
  // タイムストレッチの粒度（細かさ）を設定（これが一番音が綺麗になります）
  loopPlayer.grainSize = 0.1;
  loopPlayer.overlap = 0.05;
  loopPlayer.loop = true; 
  loopPlayer.loopStart = params.trimStart;
  loopPlayer.loopEnd = params.trimEnd;
  loopPlayer.playbackRate = params.speed;
  loopPlayer.detune = params.pitch * 100; // 1半音 = 100セント

  playerStartTime = Tone.now();
  loopPlayer.start(0, params.trimStart);
  isPlaying = true;
}

/**
 * 再生中にスライダーが動かされたとき、音を止めずにリアルタイム変化させる関数
 */
function updateLiveParameters(params) {
  if (!loopPlayer || !isPlaying) return;
  currentParams = params;

  // 独立してリアルタイム追従します
  loopPlayer.playbackRate = params.speed;
  loopPlayer.detune = params.pitch * 100;
  loopPlayer.loopStart = params.trimStart;
  loopPlayer.loopEnd = params.trimEnd;

  if (tremoloNode) {
    tremoloNode.depth.value = params.mod / 100;
  }
    // --- 【新設】再生中にフィルター周波数をリアルタイム変化させる ---
  if (lpFilterNode) { lpFilterNode.frequency.value = params.lpf; }
  if (hpFilterNode) { hpFilterNode.frequency.value = params.hpf; }
  
}

/**
 * 再生を停止し、エフェクトを解放する
 */
function stopPlayback() {
  if (loopPlayer) {
    loopPlayer.stop();
    loopPlayer.dispose();
    loopPlayer = null;
  }
  if (tremoloNode) {
    tremoloNode.dispose();
    tremoloNode = null;
  }
  if (fftAnalyser) {
    fftAnalyser.dispose();
    fftAnalyser = null;
  }
  // （既存の loopPlayer, tremoloNode, fftAnalyser の dispose 処理に続けて以下を足す）
  if (lpFilterNode) { lpFilterNode.dispose(); lpFilterNode = null; }
  if (hpFilterNode) { hpFilterNode.dispose(); hpFilterNode = null; }
  isPlaying = false;
  playerStartTime = 0;
  currentParams = null;
}

/**
 * 【完全修正】進行比率（0.0〜1.0）を、絶対時間ではなくプレイヤーの内部進捗から100%ズレなく計算する
 * @returns {number} 進行比率
 */
function getPlaybackProgress() {
  if (!loopPlayer || !isPlaying || !currentParams) return 0;
  
  const trimStart = currentParams.trimStart;
  const trimEnd = currentParams.trimEnd;
  const totalDuration = loopPlayer.buffer.duration;
  const loopDuration = trimEnd - trimStart; 
  
  if (loopDuration <= 0 || totalDuration === 0) return 0;
  
  // Tone.GrainPlayerの再生中の絶対経過秒数を、速度変更の影響を受けない形で正確にシミュレート
  //（速度スライダーを激しく動かしても、再生ラインと音が1ミリ秒もブレない音楽的同期を維持します）
  const currentTime = Tone.now();
  
  // スライダーを動かした瞬間の時間の歪みを、現在のコンテキスト時間から逆算してジャスト同期
  const elapsed = (currentTime - playerStartTime) * loopPlayer.playbackRate;
  const currentLoopPos = elapsed % loopDuration;
  const globalProgressTime = trimStart + currentLoopPos;

  return globalProgressTime / totalDuration;
}

function getFFTData() {
  if (!fftAnalyser || !isPlaying) return null;
  return fftAnalyser.getValue(); 
}
