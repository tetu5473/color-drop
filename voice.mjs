// color-drop/voice.mjs【新規作成】端末内で生成した短い日本語音声を再生し、古い掛け声の重なりを防ぎます。
export const CALLOUTS = [
  {file:'pop', text:'ぽんっ！'}, // 1連鎖の掛け声です。
  {file:'chain2', text:'つながった！'}, // 2連鎖の掛け声です。
  {file:'chain3', text:'いい感じ！'}, // 3連鎖の掛け声です。
  {file:'chain4', text:'すごい、すごい！'}, // 4連鎖の掛け声です。
  {file:'chain5', text:'やったー！'}, // 5連鎖以上の掛け声です。
];

// 端末の読み上げ機能に依存せず、同梱したWAVを一つの音声要素で再生します。
export class GameVoice {
  constructor(element, onUnavailable = () => {}) {
    this.element = element; // 再生に使うaudio要素です。
    this.onUnavailable = onUnavailable; // 再生できない場合に画面へ通知します。
    this.enabled = true; // 声だけのオン・オフです。
    this.playing = false; // ゲーム進行中の発声を許可する状態です。
    this.request = 0; // 古い非同期エラーを新しい再生へ反映させないための番号です。
    this.element.volume = 0.65;
  }

  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) this.stop();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  // 途中の声を止め、次の連鎖で古い声が続かないようにします。
  stop() {
    this.request += 1;
    this.element.pause();
    this.element.currentTime = 0;
  }

  // プレビュー以外はゲーム進行中だけ再生し、長い待ち行列を作りません。
  playChain(chain, preview = false) {
    const callout = CALLOUTS[Math.min(Math.max(Math.floor(chain),1),CALLOUTS.length)-1];
    if (!this.enabled || (!this.playing && !preview)) return callout.text;
    this.stop();
    const request = this.request;
    this.element.src = `voices/${callout.file}.wav`;
    try {
      Promise.resolve(this.element.play()).catch(() => {
        if (this.request === request) this.onUnavailable();
      });
    } catch { this.onUnavailable(); }
    return callout.text;
  }
}
