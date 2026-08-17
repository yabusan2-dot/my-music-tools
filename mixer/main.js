let mixedBuffer = null; 
let previewPlayer = null; 

let loadedRhythmBuffer = null;
let loadedPhraseBuffer = null;

const audioCtx = new AudioContext();

// --- トラックA ファイル選択時の処理【修正！】 ---
document.getElementById('rhythmFile').addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  document.getElementById('rhythmTime').innerText = "解析中...";
  try {
    // e.target.files[0] として1番目のファイルを正しく指定
    const arrayBuffer = await readFileAsArrayBuffer(e.target.files[0]);
    loadedRhythmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    updateTimelineBars();
    resetMixStatus(); 
  } catch (error) {
    console.error("トラックAの解析に失敗しました:", error);
    document.getElementById('rhythmTime').innerText = "エラー";
  }
});

// --- トラックB ファイル選択時の処理【修正！】 ---
document.getElementById('phraseFile').addEventListener('change', async (e) => {
  if (!e.target.files.length) return;
  document.getElementById('phraseTime').innerText = "解析中...";
  try {
    // e.target.files[0] として1番目のファイルを正しく指定
    const arrayBuffer = await readFileAsArrayBuffer(e.target.files[0]);
    loadedPhraseBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    updateTimelineBars();
    resetMixStatus(); 
  } catch (error) {
    console.error("トラックBの解析に失敗しました:", error);
    document.getElementById('phraseTime').innerText = "エラー";
  }
});

// --- 処理モード（重ね合わせ/結合）切り替え時の処理 ---
document.getElementsByName('processMode').forEach(radio => {
  radio.addEventListener('change', () => {
    const isMix = document.getElementById('modeMix').checked;
    const notice = document.getElementById('modeNotice');

    if (isMix) {
      notice.innerText = "※どちらを「基準（等速）」にするか選択してください。もう一方がタイムストレッチされます。";
    } else {
      notice.innerText = "※どちらを「先（1番目）」に流すか選択してください。もう一方は自動的に後ろに繋がります。";
    }
    
    updateRadioLabels();
    updateTimelineBars();
    resetMixStatus();
  });
});

// --- 基準ラジオボタン切り替え時の処理 ---
document.getElementsByName('baseTrack').forEach(radio => {
  radio.addEventListener('change', () => {
    updateRadioLabels();
    updateTimelineBars();
    resetMixStatus(); 
  });
});

// ラジオボタンのテキスト（(基準) や (先)）を動的に書き換える関数
function updateRadioLabels() {
  const isMix = document.getElementById('modeMix').checked;
  const isABase = document.getElementById('baseRhythm').checked;

  if (isMix) {
    document.getElementById('labelA').innerText = isABase ? "トラックA (基準)" : "トラックA";
    document.getElementById('labelB').innerText = isABase ? "トラックB" : "トラックB (基準)";
  } else {
    document.getElementById('labelA').innerText = isABase ? "トラックA (先)" : "トラックA (後)";
    document.getElementById('labelB').innerText = isABase ? "トラックB (後)" : "トラックB (先)";
  }
}

// --- エフェクトと音量のスライダーを動かしたときもリセットする ---
const effectInputs = ['volA', 'distA', 'echoA', 'lpA', 'hpA', 'volB', 'distB', 'echoB', 'lpB', 'hpB'];
effectInputs.forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    resetMixStatus();
  });
});

// --- 状態をリセットして再合成を可能にする関数 ---
function resetMixStatus() {
  mixedBuffer = null; 
  document.getElementById('mixBtn').disabled = false;
  document.getElementById('mixBtn').innerText = "③ 音声の読み込みと合成を開始";
  document.getElementById('resultStatus').innerText = "";
  document.getElementById('playBtn').disabled = true;
  document.getElementById('downloadBtn').disabled = true;

  if (previewPlayer) {
    previewPlayer.stop();
    previewPlayer.dispose();
    previewPlayer = null;
    document.getElementById('playBtn').innerText = "④ BGMを試聴する";
    toggleUiLock(false);
  }
}

// --- タイムラインバーの伸縮・結合の視覚化ロジック ---
function updateTimelineBars() {
  const durA = loadedRhythmBuffer ? loadedRhythmBuffer.duration : 0;
  const durB = loadedPhraseBuffer ? loadedPhraseBuffer.duration : 0;

  document.getElementById('rhythmTime').innerText = `${durA.toFixed(2)}s`;
  document.getElementById('phraseTime').innerText = `${durB.toFixed(2)}s`;

  const isMix = document.getElementById('modeMix').checked;
  const isABase = document.getElementById('baseRhythm').checked;

  const barA = document.getElementById('rhythmBar');
  const barB = document.getElementById('phraseBar');

  if (isMix) {
    const maxDuration = Math.max(durA, durB);
    if (maxDuration === 0) return;

    barA.style.width = `${(durA / maxDuration) * 100}%`;
    barB.style.width = `${(durB / maxDuration) * 100}%`;
    barA.style.opacity = isABase ? "1.0" : "0.6";
    barB.style.opacity = isABase ? "0.6" : "1.0";
  } else {
    const totalDuration = durA + durB;
    if (totalDuration === 0) return;

    barA.style.width = `${(durA / totalDuration) * 100}%`;
    barB.style.width = `${(durB / totalDuration) * 100}%`;
    barA.style.opacity = "1.0";
    barB.style.opacity = "1.0";
  }
}

// --- ③ 合成ボタンクリック時の処理 ---
document.getElementById('mixBtn').addEventListener('click', async () => {
  if (!loadedRhythmBuffer || !loadedPhraseBuffer) {
    alert("両方のファイルを選択し、解析が完了するまでお待ちください。");
    return;
  }

  await Tone.start();
  const mixBtn = document.getElementById('mixBtn');
  const resultStatus = document.getElementById('resultStatus');
  
  mixBtn.disabled = true;
  mixBtn.innerText = "音声を処理中...";
  resultStatus.innerText = ""; 

  try {
    const isMix = document.getElementById('modeMix').checked;
    const isABase = document.getElementById('baseRhythm').checked;

    const effects = {
      volA: parseFloat(document.getElementById('volA').value),
      distA: parseFloat(document.getElementById('distA').value),
      echoA: parseFloat(document.getElementById('echoA').value),
      lpA: parseFloat(document.getElementById('lpA').value),
      hpA: parseFloat(document.getElementById('hpA').value),
      volB: parseFloat(document.getElementById('volB').value),
      distB: parseFloat(document.getElementById('distB').value),
      echoB: parseFloat(document.getElementById('echoB').value),
      lpB: parseFloat(document.getElementById('lpB').value),
      hpB: parseFloat(document.getElementById('hpB').value)
    };

    mixedBuffer = await processAudio(loadedRhythmBuffer, loadedPhraseBuffer, isMix, isABase, effects);
    mixBtn.innerText = "合成完了！";
    
    if (isMix) {
      resultStatus.innerText = isABase ? "✓ トラックA の長さに合わせて重ね合わせました！" : "✓ トラックB の長さに合わせて重ね合わせました！";
    } else {
      resultStatus.innerText = isABase ? "✓ トラックA ➔ トラックB の順で一本に結合しました！" : "✓ トラックB ➔ トラックA の順で一本に結合しました！";
    }

    document.getElementById('playBtn').disabled = false;
    document.getElementById('downloadBtn').disabled = false;
  } catch (error) {
    console.error("エラーが発生しました:", error);
    mixBtn.disabled = false;
    mixBtn.innerText = "③ 音声の読み込みと合成を開始";
    resultStatus.innerText = "❌ 処理失敗";
  }
});

// --- ④ 試聴ボタンの処理 ---
document.getElementById('playBtn').addEventListener('click', () => {
  if (previewPlayer) {
    previewPlayer.stop();
    previewPlayer.dispose();
    previewPlayer = null;
    document.getElementById('playBtn').innerText = "④ BGMを試聴する";
    toggleUiLock(false);
    return;
  }

  toggleUiLock(true);
  previewPlayer = new Tone.Player(mixedBuffer).toDestination();
  previewPlayer.loop = true; 
  previewPlayer.start();
  document.getElementById('playBtn').innerText = "停止する";
});

// --- ⑤ Wav保存ボタンの処理 ---
document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!mixedBuffer) return;
  const wavBlob = audioBufferToWav(mixedBuffer);
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "mixed_bgm.wav"; 
  a.click();
  URL.revokeObjectURL(url);
});

// --- 再生中のUIロック切り替え関数 ---
function toggleUiLock(isLock) {
  document.getElementById('modeMix').disabled = isLock;
  document.getElementById('modeJoin').disabled = isLock;
  document.getElementById('baseRhythm').disabled = isLock;
  document.getElementById('basePhrase').disabled = isLock;
  document.getElementById('rhythmFile').disabled = isLock;
  document.getElementById('phraseFile').disabled = isLock;
  document.getElementById('mixBtn').disabled = isLock;
  effectInputs.forEach(id => {
    document.getElementById(id).disabled = isLock;
  });
}

// --- ファイル非同期読み込み補助関数 ---
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
