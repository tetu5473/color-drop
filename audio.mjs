// color-drop/audio.mjs【修正】独自の音列をWeb Audioで演奏し、BGMと操作音を外部音源なしで作ります。
// 選曲データを読み込み、BGMと消去音を同じ音声時計で再生します。
import { TRACKS } from './tracks.mjs?v=8';
export const MELODY = TRACKS[0].melody;

// 作成時は無音。プレイなどのユーザー操作を受けて初めて音声を有効にします。
export class GameAudio {
  constructor(contextFactory = () => new window.AudioContext()) {
    this.contextFactory = contextFactory; // テストでは音声装置の代わりを渡します。
    this.context = null; // ブラウザの音声処理です。
    this.output = null; // BGMと効果音の共通音量です。
    this.track = TRACKS[0]; // 現在選んでいる曲です。
    this.musicEnabled = true; // BGMだけを止めて効果音を残せます。
    this.enabled = true; // ユーザーが選ぶ音のオン・オフです。
    this.playing = false; // ゲーム進行中のみ演奏します。
    this.step = 0; // 曲中の八分音符の位置です。
    this.nextTime = 0; // 次に演奏する音の音声時計上の時刻です。
    this.previewGeneration = 0; // 停止後に遅れて再開する試聴を無効にします。
    this.voices = new Set(); // 停止時に予約済みの音も止めるための一覧です。
  }

  // 音声未対応や再生拒否があっても、ゲームの操作は続けられます。
  unlock() {
    try {
      if (!this.context) {
        this.context = this.contextFactory();
        this.output = this.context.createGain();
        this.output.gain.value = 0.32;
        this.output.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { this.enabled = false; }
  }

  // 状態の切り替わりでだけ音を止め、毎フレーム曲を再始動しないようにします。
  setPlaying(playing) {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) this.stopVoices();
    else this.nextTime = this.context?.currentTime ?? 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopVoices();
    else { this.unlock(); this.nextTime = this.context?.currentTime ?? 0; }
  }

  // 変更前に予約した音を止め、新しい曲を先頭から演奏します。
  selectTrack(identifier) {
    const selected = TRACKS.find((track) => track.id === identifier);
    if (!selected && identifier !== 'none') return false;
    this.stopVoices();
    this.musicEnabled = identifier !== 'none';
    if (selected) this.track = selected;
    this.step = 0;
    this.nextTime = this.context?.currentTime ?? 0;
    return true;
  }

  // 開始前でも、ユーザーが押したときだけ消去音を試せます。
  async previewClear(chain = 2) {
    if (!this.enabled) return;
    this.stopVoices();
    const generation = this.previewGeneration;
    this.unlock();
    try {
      if (this.context?.state === 'suspended') await this.context.resume();
      if (generation === this.previewGeneration) this.effect('clear', chain, true);
    } catch { /* 音を再生できない環境でも盤面は止めません。 */ }
  }

  // 一時停止・ミュートでは予約済みの音も終了します。
  stopVoices() {
    this.previewGeneration += 1;
    for (const voice of this.voices) { try { voice.stop(); } catch {} }
    this.voices.clear();
  }

  // 短いアタックと減衰で、音の切れ目のクリックノイズを抑えます。
  tone(note, time, duration, volume = 0.16, type = 'triangle', slide = 0) {
    if (!this.context || !this.enabled) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const frequency = 440 * 2 ** ((note - 69) / 12);
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(frequency * 2 ** (slide / 12), time + duration);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(this.output);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  // メロディ・裏拍の和音・ベース・軽い打音を、音声時計で先行予約します。
  update() {
    if (!this.playing || !this.enabled || !this.musicEnabled || this.context?.state !== 'running') return;
    if (this.nextTime < this.context.currentTime - 0.2) this.nextTime = this.context.currentTime;
    while (this.nextTime < this.context.currentTime + 0.12) {
      const beatsPerBar = this.track.melody[0].length;
      const eighthSeconds = 60 / this.track.tempo / 2;
      const bar = Math.floor(this.step / beatsPerBar) % this.track.melody.length;
      const beat = this.step % beatsPerBar;
      const note = this.track.melody[bar][beat];
      if (note) this.tone(note, this.nextTime, eighthSeconds * 0.85, this.track.volume, this.track.instrument);
      if (beat % 2 === 0) this.tone(this.track.roots[bar] + (beat === 4 ? 7 : 0), this.nextTime, 0.22, 0.23);
      if (beat % 2 === 1) {
        const third = this.track.minorRoots.includes(this.track.roots[bar]) ? 3 : 4;
        for (const interval of [12,12 + third,19]) this.tone(this.track.roots[bar] + interval, this.nextTime, 0.09, 0.035, 'sine');
        this.tone(99, this.nextTime, 0.028, 0.035, 'triangle', -18);
      }
      if (beat === 0 || beat === 4) this.tone(43, this.nextTime, 0.1, 0.2, 'sine', -18);
      this.step = (this.step + 1) % (this.track.melody.length * beatsPerBar);
      this.nextTime += eighthSeconds;
    }
  }

  // 回転・着地・連鎖にそれぞれ短い独自音を付けます。
  effect(action, chain = 1, preview = false) {
    if (!this.enabled || (!this.playing && !preview) || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    if (action === 'rotate') this.tone(79, now, 0.065, 0.13, 'sine', 5);
    if (action === 'drop') this.tone(55, now, 0.12, 0.23, 'sine', -12);
    if (action === 'clear') {
      // 消える瞬間に泡のはじける音を重ね、連鎖が進むほど高くします。
      const lift = Math.min(chain - 1, 6) * 2;
      this.tone(83 + lift, now, 0.11, 0.3, 'sine', -23);
      this.tone(90 + lift, now + 0.035, 0.085, 0.17, 'triangle', -16);
      for (const [index, interval] of [0,4,7,12].entries()) this.tone(72 + interval + Math.min(chain - 1, 6) * 2, now + index * 0.065, 0.2, 0.2, 'sine');
    }
  }
}
