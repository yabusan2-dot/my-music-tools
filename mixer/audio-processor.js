// タイムストレッチ重ね合わせ ＆ 直列結合を統合したコア音声処理（完全バイパス・直列連結版）
async function processAudio(bufferA, bufferB, isMix, isABase, effects) {
  const durA = bufferA.duration;
  const durB = bufferB.duration;
  const sampleRate = bufferA.sampleRate; // 通常は同じサンプリングレートを想定
  const numChannels = bufferA.numberOfChannels;

  // ==========================================
  // 【新設】B. 結合（直列つなぎ）モードの処理
  // ==========================================
  if (!isMix) {
    // 2つのトラックの長さをジャストで合算（余白や無音は1ミリ秒も入りません）
    const totalLength = Math.floor((durA + durB) * sampleRate);
    
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const joinedBuffer = ctx.createBuffer(numChannels, totalLength, sampleRate);

    // チャンネルごとに、エフェクトを通さない純粋なPCMデータをダイレクトに直列コピーする
    for (let channel = 0; channel < numChannels; channel++) {
      const dataA = bufferA.getChannelData(channel);
      const dataB = bufferB.getChannelData(channel);
      const joinedData = joinedBuffer.getChannelData(channel);

      if (isABase) {
        // トラックA ➔ トラックB の順で結合
        joinedData.set(dataA, 0);       // 0秒からAをコピー
        joinedData.set(dataB, dataA.length); // Aが終わったジャストの位置からBをコピー
      } else {
        // トラックB ➔ トラックA の順で結合
        joinedData.set(dataB, 0);       // 0秒からBをコピー
        joinedData.set(dataA, dataB.length); // Bが終わったジャストの位置からAをコピー
      }
    }
    // エフェクトの濁りも、音漏れも、後ろの無音も発生しない、完璧な3.5秒のバッファを返す
    return joinedBuffer;
  }

  // ==========================================
  // A. 重ね合わせ（ミックス）モードの処理（従来通り）
  // ==========================================
  let targetDuration;
  let ratioA = 1.0;
  let ratioB = 1.0;

  if (isABase) {
    targetDuration = durA;       
    ratioB = durB / durA;        
  } else {
    targetDuration = durB;       
    ratioA = durA / durB;        
  }

  const tailDuration = 2.5; 
  const totalRenderDuration = targetDuration + tailDuration;

  const longBuffer = await Tone.Offline(async (context) => {
    const playerA = new Tone.GrainPlayer(bufferA);
    const playerB = new Tone.GrainPlayer(bufferB);

    playerA.playbackRate = ratioA;
    playerB.playbackRate = ratioB;
    playerA.grainSize = 0.1; 
    playerA.overlap = 0.05;
    playerB.grainSize = 0.1; 
    playerB.overlap = 0.05;

    playerA.volume.value = effects.volA;
    playerB.volume.value = effects.volB;

    const distNodeA = new Tone.Distortion(effects.distA).toDestination();
    const delayNodeA = new Tone.FeedbackDelay("4n", effects.echoA).connect(distNodeA);
    const hpNodeA = new Tone.Filter(effects.hpA * 2000, "highpass").connect(delayNodeA);
    const lpFreqA = 20000 - (effects.lpA * 19600);
    const lpNodeA = new Tone.Filter(lpFreqA, "lowpass").connect(hpNodeA);
    playerA.connect(lpNodeA); 

    const distNodeB = new Tone.Distortion(effects.distB).toDestination();
    const delayNodeB = new Tone.FeedbackDelay("4n", effects.echoB).connect(distNodeB);
    const hpNodeB = new Tone.Filter(effects.hpB * 2000, "highpass").connect(delayNodeB);
    const lpFreqB = 20000 - (effects.lpB * 19600);
    const lpNodeB = new Tone.Filter(lpFreqB, "lowpass").connect(hpNodeB);
    playerB.connect(lpNodeB); 

    playerA.start(0);
    playerB.start(0);
  }, totalRenderDuration);

  const finalLength = Math.floor(targetDuration * sampleRate); 
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const finalBuffer = ctx.createBuffer(numChannels, finalLength, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const longData = longBuffer.getChannelData(channel);
    const finalData = finalBuffer.getChannelData(channel);

    for (let i = 0; i < finalLength; i++) {
      finalData[i] = longData[i];
    }

    const tailLength = longData.length - finalLength;
    for (let i = 0; i < tailLength; i++) {
      if (i < finalLength) {
        finalData[i] += longData[finalLength + i];
      }
    }
  }

  return finalBuffer;
}
