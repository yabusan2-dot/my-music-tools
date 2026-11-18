// global.d.ts
// 他のJSファイル（app.jsなど）で定義されているグローバル変数の宣言

declare let currentMeter: number;
declare let currentPhrase: number;
declare let melody1: any;
declare let melody2: any;
melody1
// 他にも app.js や config.js から使っている変数や関数があれば、ここに追加していく
// 例: declare const SOME_CONFIG: string;
// 例: declare function updateUI(): void;
