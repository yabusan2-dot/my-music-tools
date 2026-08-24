// 波形描画専門ライブラリ（BPMテンポガイドライン点線バグ・構文エラー完全修正版）

/**
 * 読み込んだAudioBufferの波形をCanvasに綺麗に描画する関数
 * @param {HTMLCanvasElement} canvas - 描画対象のキャンバス
 * @param {AudioBuffer} audioBuffer - 解析済みの音声データ
 * @param {number} [bpm] - 解析または手動設定されたBPM
 * @param {number} [trimStart=0] - 切り出し開始秒数
 * @param {number} [trimEnd] - 切り出し終了秒数
 */
function drawWaveform(canvas, audioBuffer, bpm, trimStart = 0, trimEnd) {
  const ctx = canvas.getContext('2d');
  const totalWidth = canvas.width;
  const totalHeight = canvas.height;

  const marginLeft = 45;   
  const marginBottom = 20; 

  const width = totalWidth - marginLeft;
  const height = totalHeight - marginBottom;

  const tEnd = (audioBuffer && !trimEnd) ? audioBuffer.duration : (trimEnd || 0);

  // 1. キャンバス全体をクリア
  ctx.clearRect(0, 0, totalWidth, totalHeight);
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 1.5 切り出し範囲（ハイライト領域）の背景色を塗り分ける
  if (audioBuffer && audioBuffer.duration > 0) {
    const totalDur = audioBuffer.duration;
    const startX = marginLeft + (width * (trimStart / totalDur));
    const endX = marginLeft + (width * (tEnd / totalDur));
    
    ctx.fillStyle = '#0f1424';
    ctx.fillRect(startX, 0, endX - startX, height);
  }

  // 2. 背景の細かいグリッド線（目盛り）を描画
  ctx.strokeStyle = '#303b4d'; 
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  ctx.moveTo(marginLeft, height / 2); ctx.lineTo(totalWidth, height / 2);
  ctx.moveTo(marginLeft, height * 0.25); ctx.lineTo(totalWidth, height * 0.25);
  ctx.moveTo(marginLeft, height * 0.75); ctx.lineTo(totalWidth, height * 0.75);

  for (let i = 1; i < 10; i++) {
    const x = marginLeft + (width / 10) * i;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();

  // 3. メーターのテキスト（dB と 秒数）を描画
  ctx.fillStyle = '#718096'; 
  ctx.font = '10px monospace';
  ctx.textBaseline = 'middle';

  ctx.textAlign = 'right';
  ctx.fillText('0 dB', marginLeft - 8, 2);              
  ctx.fillText('-6 dB', marginLeft - 8, height * 0.25);  
  ctx.fillText('-∞',   marginLeft - 8, height / 2);     
  ctx.fillText('-6 dB', marginLeft - 8, height * 0.75);  
  ctx.fillText('0 dB', marginLeft - 8, height - 2);      

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const totalDuration = audioBuffer ? audioBuffer.duration : 0;
  ctx.fillText('0.00s', marginLeft, height + 4);
  
  for (let i = 1; i < 10; i++) {
    const x = marginLeft + (width / 10) * i;
    const currentSecond = (totalDuration / 10) * i;
    const timeText = totalDuration > 0 ? `${currentSecond.toFixed(2)}s` : '---s';
    ctx.fillText(timeText, x, height + 4);
  }
  
  const endText = totalDuration > 0 ? `${totalDuration.toFixed(2)}s` : '---s';
  ctx.fillText(endText, totalWidth - 15, height + 4);

  // 4. BPMテンポガイドライン（点線）の重ね合わせ
  if (audioBuffer && bpm && bpm > 0) {
    const beatDuration = 60 / bpm; 
    
    ctx.save();
    ctx.strokeStyle = '#ffb300';  
    ctx.lineWidth = 1;
    // 【完全修正】正しい配列の構文 [2, 4] に変更。これでエラーが絶対に発生しなくなります
    ctx.setLineDash([2, 4]);      
    ctx.beginPath();
    
    for (let time = beatDuration; time < totalDuration; time += beatDuration) {
      const ratio = time / totalDuration;
      const x = marginLeft + (width * ratio);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (!audioBuffer) return;

  // 5. 波形データの描画
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  const blockSize = Math.ceil(totalSamples / width);
  
  ctx.shadowBlur = 4;           
  ctx.shadowColor = '#78ffd6';

  for (let i = 0; i < width; i++) {
    const startSample = i * blockSize;
    if (startSample >= totalSamples) break; 

    const currentSec = (startSample / totalSamples) * totalDuration;
    const isInRange = (currentSec >= trimStart && currentSec <= tEnd);

    ctx.strokeStyle = isInRange ? '#78ffd6' : '#233038';

    let min = 1.0;
    let max = -1.0;
    let hasData = false;

    for (let j = 0; j < blockSize; j++) {
      const sampleIdx = startSample + j;
      if (sampleIdx >= totalSamples) break;
      const val = channelData[sampleIdx];
      if (val < min) min = val;
      if (val > max) max = val;
      hasData = true;
    }

    if (hasData) {
      const yMin = ((min + 1) * 0.5) * height;
      const yMax = ((max + 1) * 0.5) * height;

      ctx.beginPath();
      ctx.moveTo(marginLeft + i, yMin);
      ctx.lineTo(marginLeft + i, yMax);
      ctx.stroke();
    }
  }

  ctx.shadowBlur = 0; 
}

// ==========================================
// 🚨 【核心】削り落としてしまっていた周波数特性グラフの定義をここに完全復元
// ==========================================
/**
 * 周波数特性（FFT）のグラフをキャンバスに綺麗に描画する関数
 * @param {HTMLCanvasElement} canvas - 描画対象のキャンバス
 * @param {Float32Array} fftData - アナライザーから取得した周波数配列
 */
function drawFFTGraph(canvas, fftData) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width; 
  const height = canvas.height;

  // 背景クリア
  ctx.clearRect(0, 0, width, height); 
  ctx.fillStyle = '#050608'; 
  ctx.fillRect(0, 0, width, height);

  // ガイドグリッド線の描画（中間色の目盛り）
  ctx.strokeStyle = '#303b4d'; 
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.25); ctx.lineTo(width, height * 0.25);
  ctx.moveTo(0, height * 0.5);  ctx.lineTo(width, height * 0.5);
  ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
  ctx.stroke();

  if (!fftData) return;

  // 周波数の縦棒（バー）を描画
  const barCount = 40; 
  const barWidth = (width / barCount);

  ctx.fillStyle = '#78ffd6'; // サイバーグリーン
  
  for (let i = 0; i < barCount; i++) {
    // 低音から高音に向かってデータを抽出
    const dataIdx = Math.floor(Math.pow(i / barCount, 2) * (fftData.length * 0.6));
    const dbValue = fftData[dataIdx]; 

    // デシベル値を画面の高さにマッピング
    const normalizedVol = Math.max(0, (dbValue + 80) / 80); 
    const barHeight = normalizedVol * height;

    // 下から上に向かって伸びる縦棒を描く
    ctx.fillRect(i * barWidth + 1, height - barHeight, barWidth - 2, barHeight);
  }
}
