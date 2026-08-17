// タイムストレッチ重ね合わせ ＆ 直列結合を統合したコア音声処理（テンポ崩れ・間隔空き完全解消版）
async function processAudio(bufferA, bufferB, isMix, isABase, effects) {
  const durA = bufferA.duration;
  const durB = bufferB.duration;
  
  let targetDuration;
  let ratioA = 1.0;
  let ratioB = 1.0;
  let startA = 0;
  let startB = 0;

  if (isMix) {
    // 【重ね合わせモード】の音楽的な長さ
    if (isABase) {
      targetDuration = durA;       
      ratioB = durB / durA;        
    } else {
      targetDuration = durB;       
      ratioA = durA / durB;        
    }
  } else {
    // 【結合モード】の音楽的な長さ（AとBの合算秒数）
    targetDuration = durA + durB; 
    ratioA = 1.0;                 
    ratioB = 1.0;                 
    
    if (isABase) {
      startA = 0;                 
      startB = durA;              
    } else {
      startA = durB;              
      startB = 0;                 
    }
  }

  // 【重要】無限ループで余韻を回り込ませるために、裏側では少し長め（+2.5秒）に計算する
  const tailDuration = 2.5; 
  const totalRenderDuration = targetDuration + tailDuration;

  // 1. 裏側（OfflineContext）でレンダリング
  const longBuffer = await Tone.Offline(async (context) => {
    let playerA, playerB;

    if (isMix) {
      playerA = new Tone.GrainPlayer(bufferA);
      playerB = new Tone.GrainPlayer(bufferB);
      playerA.grainSize = 0.1; 
      playerA.overlap = 0.05;
      playerB.grainSize = 0.1; 
      playerB.overlap = 0.05;
      playerA.playbackRate = ratioA;
      playerB.playbackRate = ratioB;
    } else {
      playerA = new Tone.Player(bufferA);
      playerB = new Tone.Player(bufferB);
    }

    playerA.volume.value = effects.volA;
    playerB.volume.value = effects.volB;

    // トラックAのエフェクトチェーン
    const distNodeA = new Tone.Distortion(effects.distA).toDestination();
    const delayNodeA = new Tone.FeedbackDelay("4n", effects.echoA).connect(distNodeA);
    const hpNodeA = new Tone.Filter(effects.hpA * 2000, "highpass").connect(delayNodeA);
    const lpFreqA = 20000 - (effects.lpA * 19600);
    const lpNodeA = new Tone.Filter(lpFreqA, "lowpass").connect(hpNodeA);
    playerA.connect(lpNodeA); 

    // トラックBのエフェクトチェーン
    const distNodeB = new Tone.Distortion(effects.distB).toDestination();
    const delayNodeB = new Tone.FeedbackDelay("4n", effects.echoB).connect(distNodeB);
    const hpNodeB = new Tone.Filter(effects.hpB * 2000, "highpass").connect(delayNodeB);
    const lpFreqB = 20000 - (effects.lpB * 19600);
    const lpNodeB = new Tone.Filter(lpFreqB, "lowpass").connect(hpNodeB);
    playerB.connect(lpNodeB); 

    playerA.start(startA);
    playerB.start(startB);
  }, totalRenderDuration);

  // 2. 【核心】書き出すファイルの大きさは、余白なしの「音楽的なジャストサイズ」にする
  const sampleRate = longBuffer.sampleRate;
  const numChannels = longBuffer.numberOfChannels;
  const finalLength = Math.floor(targetDuration * sampleRate); // ミリ秒の隙間も許さない厳密な長さ
  
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const finalBuffer = ctx.createBuffer(numChannels, finalLength, sampleRate);

  // 3. 波形データのコピーと、重ね合わせ時のみの回り込み処理
  for (let channel = 0; channel < numChannels; channel++) {
    const longData = longBuffer.getChannelData(channel);
    const finalData = finalBuffer.getChannelData(channel);

    // ジャストサイズ分だけをキッチリコピー（結合モードならこれで完璧に隙間なく終わる）
    for (let i = 0; i < finalLength; i++) {
      finalData[i] = longData[i];
    }

    // 重ね合わせ（Mix）モードの時だけ、はみ出たエコーの余韻（テイル）を頭に回り込ませる
    if (isMix) {
      const tailLength = longData.length - finalLength;
      for (let i = 0; i < tailLength; i++) {
        if (i < finalLength) {
          finalData[i] += longData[finalLength + i];
        }
      }
    }
  }

  return finalBuffer;
}
