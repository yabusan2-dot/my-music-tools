# 🎵 Web Audio API & Canvas: Creative Music Tools

本プロジェクトは、外部の音源ファイル（Wav/MP3など）を一切使用せず、HTML5の **Web Audio API** と **Canvas** のコード制御のみで、シンセサイザー、ミキサー、シーケンサーなどをスクラッチ開発したWeb音楽制作ツール群です。

30年の組込み開発で培った「ミリ秒単位の時間制御」と、AI（OpenAI API/Gemini）との協調ワークフローを融合させ、軽量かつ動的なリアルタイム音声合成システムを構築しました。

---

## 🛠 内包ツールと技術的見どころ

本リポジトリは役割ごとにディレクトリを分離し、コンポーネント指向（再利用性）を意識した構造設計を行っています。

### 1. 🎛 Mixer (`/mixer`) & Processor (`/processor`)
* **概要**: 各音声トラックのボリューム、パン（左右の定位）、エフェクトのルーティングを管理。
* **技術的工夫**: `AudioGainNode` や `PannerNode` を網羅的に組み合わせ、ブラウザ内部での高度なオーディオミキシングバス（信号経路）をJavaScript上で再現しています。

### 2. 🥁 Rhythm Machine (`/rhythm-machine`) & Sequencer (`/sequencer`)
* **概要**: 時間軸に沿って正確なテンポで音を鳴らす自動演奏エンジン。
* **技術的工夫**: JavaScriptの `setInterval` のゆらぎ（遅延）によるリズム崩れを防ぐため、Web Audio APIの `audioContext.currentTime`（高精度タイムスタンプ）を基準とした先読みスケジュール管理を実装。ミリ秒単位の厳格な同期制御を行っています。

### 3. 💥 SE Generator (`/se-generator`) & Simple Phrase (`/simple-phrase`)
* **概要**: 0から周波数と波形（正弦波、矩形波、のこぎり波など）を合成して効果音を作る音響ジェネレーター。
* **AI連携（OpenAI API / Gemini）**: 「音楽的なサンプルフレーズの生成」や「シンセサイザーの複雑なパラメータの初期設定」にLLMを活用。AIに音楽の構成要素を確率計算させ、それをJavaScriptのシンセサイズコードへとマッピングする実験的な共創アプローチを取り入れています。

---

## 📊 システム・オーディオルーティング図

Web Audio APIのノード（Node）をどのように接続して音声を合成・出力しているかの基本アーキテクチャです（Mermaidによる可視化）。

```mermaid
graph TD

    subgraph Sound Sources (各音源)
        A[OscillatorNode / 独自波形]
        B[Rhythm Trigger]
    end

    subgraph Audio Processor (エフェクト・ミキサー)
        C[GainNode / 各トラック音量]
        D[PannerNode / 左右定位]
        E[Effect Processor / フィルター等]
    end

    subgraph Output
        F[Master GainNode]
        G[AudioContext.destination / スピーカー]
    end

    A --> C
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
```

---

## 🚀 今後のロードマップ（ライフワーク）

本音楽ツールの設計思想（コンポーネント指向）をベースに、ADSRの追加、openiを利用したサンプルフレーズデータベースからの検索機能等を追加します。

