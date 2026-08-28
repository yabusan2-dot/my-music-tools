    let isDragging = false;
    let dragStartX = 0;
    let dragCurrentX = 0;

    zoomStartRatio = 0.0;
    zoomEndRatio = 1.0;

    const marginLeft = 45;

    function refreshWaveform() {

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 35;
      
      if (window.opener && window.opener.currentAudioBuffer) {
        let trimStart = 0;
        let trimEnd = window.opener.currentAudioBuffer.duration;
        
        if (typeof window.opener.getUiParams === 'function') {
          const params = window.opener.getUiParams();
          trimStart = params.trimStart;
          trimEnd = params.trimEnd;
        }

        drawZoomedWaveform(canvas, window.opener.currentAudioBuffer, zoomStartRatio, zoomEndRatio, trimStart, trimEnd);
      } else {
        drawWaveform(canvas, null);
      }
    }

    function refreshWaveformExternal() {
      zoomStartRatio = 0.0;
      zoomEndRatio = 1.0;
      refreshWaveform();
    }

    // ズーム限定描画関数
    function drawZoomedWaveform(canvas, audioBuffer, startRatio, endRatio, trimStart = 0, trimEnd) {
      // 【完全修正】第2引数を audioBuffer ➔ null に変更！
      // これにより、背景の目盛りとハイライト色だけを綺麗にクリアした状態から拡大描画を始めます
      drawWaveform(canvas, null, (window.opener ? window.opener.currentBpm : null), trimStart, trimEnd); 

      const marginBottom = 20;
      const width = canvas.width - marginLeft;
      const height = canvas.height - marginBottom;

      const channelData = audioBuffer.getChannelData(0);
      const totalSamples = channelData.length;

      const startSampleGlobal = Math.floor(totalSamples * startRatio);
      const endSampleGlobal = Math.floor(totalSamples * endRatio);
      const zoomedSamplesCount = endSampleGlobal - startSampleGlobal;

      const blockSize = Math.ceil(zoomedSamplesCount / width);

      // デジタルカウンター表示の計算
      const totalDuration = audioBuffer.duration;
      const startTimeSec = totalDuration * startRatio;
      const endTimeSec = totalDuration * endRatio;
      const rangeDuration = endTimeSec - startTimeSec;

      document.getElementById('digitalStart').innerText = `${startTimeSec.toFixed(3)}s`;
      document.getElementById('digitalEnd').innerText = `${endTimeSec.toFixed(3)}s`;
      document.getElementById('digitalDiff').innerText = `${rangeDuration.toFixed(3)}s`;
      
      if (startRatio === 0.0 && endRatio === 1.0) {
        document.getElementById('zoomStatus').innerText = "(全体表示中)";
        document.getElementById('zoomStatus').style.color = "#718096";
      } else {
        document.getElementById('zoomStatus').innerText = "(拡大表示中)";
        document.getElementById('zoomStatus').style.color = "#4facfe";
      }

      // 横軸メーターの秒数テキスト再計算
      ctx.fillStyle = '#050608'; 
      ctx.fillRect(marginLeft, height + 1, canvas.width, marginBottom);
      
      ctx.fillStyle = '#718096';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      ctx.fillText(`${startTimeSec.toFixed(3)}s`, marginLeft, height + 4);
      for (let i = 1; i < 10; i++) {
        const x = marginLeft + (width / 10) * i;
        const currentSecond = startTimeSec + (rangeDuration / 10) * i;
        ctx.fillText(`${currentSecond.toFixed(3)}s`, x, height + 4);
      }
      ctx.fillText(`${endTimeSec.toFixed(3)}s`, canvas.width - 20, height + 4);

      // 拡大画面用のBPMテンポガイドライン
      const bpm = (window.opener && window.opener.currentBpm) ? window.opener.currentBpm : null;
      if (bpm && bpm > 0) {
        const beatDuration = 60 / bpm; 
        ctx.save();
        ctx.strokeStyle = '#ffb300';  
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);      
        ctx.beginPath();
        for (let time = beatDuration; time < totalDuration; time += beatDuration) {
          if (time >= startTimeSec && time <= endTimeSec) {
            const localRatio = (time - startTimeSec) / rangeDuration;
            const x = marginLeft + (width * localRatio);
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
        }
        ctx.stroke();
        ctx.restore();
      }

      // ズーム波形自体の再描画
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#78ffd6';

      for (let i = 0; i < width; i++) {
        const startSample = startSampleGlobal + (i * blockSize);
        if (startSample >= endSampleGlobal || startSample >= totalSamples) break;

        const currentSec = (startSample / totalSamples) * totalDuration;
        const tEndVal = trimEnd || totalDuration;
        const isInRange = (currentSec >= trimStart && currentSec <= tEndVal);
        ctx.strokeStyle = isInRange ? '#78ffd6' : '#233038'; 

        let min = 1.0;
        let max = -1.0;
        let hasData = false;

        for (let j = 0; j < blockSize; j++) {
          const sampleIdx = startSample + j;
          if (sampleIdx >= endSampleGlobal || sampleIdx >= totalSamples) break;
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