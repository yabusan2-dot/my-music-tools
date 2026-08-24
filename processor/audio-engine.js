// オーディオ再生＆リアルタイム解析エンジン（GrainPlayer移調・変調完全対応版）
let loopPlayer = null;
let fftAnalyser = null;
let tremoloNode = null; 
let isPlaying = false;
let playerStartTime = 0;
let currentParams = null; 

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

  // 【修正】独立したピッチ・速度コントロールのために GrainPlayer に変更
  loopPlayer = new Tone.GrainPlayer(audioBuffer).connect(tremoloNode);
  
  // タイムストレッチの粒度（細かさ）を設定（これが一番音が綺麗になります）
  loopPlayer.grainSize = 0.1;
  loopPlayer.overlap = 0.05;

  loopPlayer.loop = true; 
  loopPlayer.loopStart = params.trimStart;
  loopPlayer.loopEnd = params.trimEnd;

  // パラメーターの適用（GrainPlayerなら独立して完全に動作します）
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
  isPlaying = false;
  playerStartTime = 0;
  currentParams = null;
}

/**
 * 進行比率（0.0〜1.0）を計算する
 */
function getPlaybackProgress() {
  if (!loopPlayer || !isPlaying || playerStartTime === 0 || !currentParams) return 0;
  
  const trimStart = currentParams.trimStart;
  const trimEnd = currentParams.trimEnd;
  const loopDuration = trimEnd - trimStart; 
  if (loopDuration <= 0) return 0;
  
  const currentTime = Tone.now();
  const elapsed = (currentTime - playerStartTime) * loopPlayer.playbackRate;
  
  const currentLoopPos = (elapsed % loopDuration);
  const globalProgressTime = trimStart + currentLoopPos;

  return globalProgressTime / loopPlayer.buffer.duration;
}

function getFFTData() {
  if (!fftAnalyser || !isPlaying) return null;
  return fftAnalyser.getValue(); 
}
