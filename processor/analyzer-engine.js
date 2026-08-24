// 【プロ仕様】オーディオ自動解析エンジン（150Hzローパス＆自己相関関数アルゴリズム）

/**
 * AudioBufferから最初の発音位置（アタック）とテンポ（BPM）を自動判定する
 * @param {AudioBuffer} audioBuffer - 解析対象の音声データ
 * @returns {Object} 解析結果（bpm, attackTime）
 */
function analyzeAudioBuffer(audioBuffer) {
  const pcmData = audioBuffer.getChannelData(0); // 左チャンネル
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = pcmData.length;

  // ----------------==========================
  // 1. 最初の発音位置（アタックタイム）の検出
  // --------------------------------==========
  const threshold = 0.05; 
  let attackSampleIdx = 0;
  for (let i = 0; i < totalSamples; i++) {
    if (Math.abs(pcmData[i]) > threshold) {
      attackSampleIdx = i;
      break;
    }
  }
  const detectedAttackTime = attackSampleIdx / sampleRate;

  // ----------------==========================
  // 2. 150Hz ローパスフィルター処理 (IIR単極フィルター)
  // --------------------------------==========
  const cutoff = 150; 
  const rc = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  const filteredData = new Float32Array(totalSamples);
  let prevOutput = 0;
  for (let i = 0; i < totalSamples; i++) {
    filteredData[i] = alpha * Math.abs(pcmData[i]) + (1 - alpha) * prevOutput;
    prevOutput = filteredData[i];
  }

  // ----------------==========================
  // 3. ダウンサンプリング処理 (計算高速化のための間引き)
  // --------------------------------==========
  const downSampleRatio = 32;
  const targetSampleRate = sampleRate / downSampleRatio; // 約1378Hz
  const downSampledLength = Math.floor(totalSamples / downSampleRatio);
  const lowData = new Float32Array(downSampledLength);

  for (let i = 0; i < downSampledLength; i++) {
    lowData[i] = filteredData[i * downSampleRatio];
  }

  // ----------------==========================
  // 4. 自己相関関数（Autocorrelation）によるBPM解析
  // --------------------------------==========
  const minBpm = 60;
  const maxBpm = 180;
  const maxLag = Math.floor((60 / minBpm) * targetSampleRate); 
  const minLag = Math.floor((60 / maxBpm) * targetSampleRate); 

  const r = new Float32Array(maxLag + 1);
  let maxR = -1;
  let bestLag = 0;

  // 【完全修正】エラーの原因だったおかしな単語を「lag」に綺麗に直しました
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = downSampledLength - lag;
    for (let i = 0; i < limit; i++) {
      sum += lowData[i] * lowData[i + lag];
    }
    r[lag] = sum;

    if (lag > minLag && r[lag] > r[lag - 1]) {
      if (r[lag - 1] > maxR) {
        maxR = r[lag - 1];
        bestLag = lag - 1;
      }
    }
  }

  // ----------------==========================
  // 5. 最終BPMの逆算
  // --------------------------------==========
  let detectedBpm = 120; 

  if (bestLag > 0) {
    const beatDurationInSeconds = bestLag / targetSampleRate;
    let rawBpm = 60 / beatDurationInSeconds;

    while (rawBpm < 60) rawBpm *= 2;
    while (rawBpm > 180) rawBpm /= 2;

    detectedBpm = Math.round(rawBpm);
  }

  return {
    bpm: detectedBpm,
    attackTime: detectedAttackTime
  };
}
