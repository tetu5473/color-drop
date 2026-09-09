// color-drop/game.mjs【修正】ゲーム本体を画面・キーボード・タッチ操作につなぎます。
import { ColorDropGame, WIDTH, HEIGHT, pieceCells } from './engine.mjs';
import { characterMarkup, connectionsAt } from './characters.mjs?v=4';
import { GameAudio } from './audio.mjs?v=8';
import { TRACKS } from './tracks.mjs?v=8';
import { GameVoice } from './voice.mjs?v=6';

const game = new ColorDropGame();
const sound = new GameAudio();
const soundButton = document.querySelector('#sound');
const trackSelect = document.querySelector('#music-track');
const voiceButton = document.querySelector('#voice-toggle');
const previewButton = document.querySelector('#sound-preview');
const soundFeedback = document.querySelector('#sound-feedback');
const voice = new GameVoice(document.querySelector('#callout-audio'), () => {
  soundFeedback.textContent = '声を再生できません。「消去音と声を試す」を押してください。';
});
// 曲名は定義から作り、選曲表示と実際の再生データを一致させます。
trackSelect.innerHTML = TRACKS.map((track) => `<option value="${track.id}">${track.title}</option>`).join('')
  + '<option value="none">BGMなし（効果音・声のみ）</option>';
document.querySelector('#mascots').innerHTML = [1,2,3,4].map((color) => characterMarkup(color)).join('');
const colorNames = ['', 'ピンク', '水色', '黄色', '緑'];
const boardElement = document.querySelector('#board');
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const restartButton = document.querySelector('#restart');
const cancelRestartButton = document.querySelector('#cancel-restart');
const announcement = document.querySelector('#announcement');
const controls = [...document.querySelectorAll('[data-action]')];
let isPaused = false;
let isRestartPending = false; // 盤面を保持したままリセットの確認を表示する状態です。
let wasPausedBeforeRestart = false; // キャンセル時に元の停止状態へ戻します。
let previousTime = 0;
let elapsed = 0;
let lastPhase = 'ready';
let heldControl = null;
let holdDelay = null;
let holdTimer = null;

// 盤面のDOMは最初に作り、プレイ中は既存のセルだけを更新します。
const cells = Array.from({ length: WIDTH * (HEIGHT - 1) }, () => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  boardElement.append(cell);
  return cell;
});

// HTMLは内部の固定値からのみ作り、入力された文章を挿入しません。
function blockMarkup(color, extraClass = '', connections = {}) {
  return characterMarkup(color, extraClass, connections);
}

// 動く組・着地点・消去対象を、固定済み盤面に重ねて描画します。
function render() {
  const activeCells = game.piece ? pieceCells(game.piece) : [];
  const ghostCells = game.piece ? pieceCells(game.landingPiece()) : [];
  // 操作中の組と着地点は各々の二個だけをつなぎ、固定盤面とは混ぜません。
  const activeColorAt = (column, row) => activeCells.find((cell) => cell.x === column && cell.y === row)?.color;
  const ghostColorAt = (column, row) => ghostCells.find((cell) => cell.x === column && cell.y === row)?.color;
  const fixedColorAt = (column, row) => game.board[row]?.[column];
  for (let row = 1; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      const cell = cells[(row - 1) * WIDTH + column];
      const active = activeCells.find((position) => position.x === column && position.y === row);
      const ghost = ghostCells.find((position) => position.x === column && position.y === row);
      const fixedColor = game.board[row][column];
      const markup = active ? blockMarkup(active.color, 'active-block', connectionsAt(activeColorAt, column, row, active.color))
        : fixedColor ? blockMarkup(fixedColor, '', connectionsAt(fixedColorAt, column, row, fixedColor))
        : ghost ? blockMarkup(ghost.color, 'ghost', connectionsAt(ghostColorAt, column, row, ghost.color)) : '';
      if (cell.innerHTML !== markup) cell.innerHTML = markup;
      cell.classList.toggle('clearing', game.matches.some((position) => position.x === column && position.y === row));
    }
  }
  document.querySelector('#score').textContent = game.score.toLocaleString('ja-JP');
  document.querySelector('#cleared').textContent = String(game.cleared);
  document.querySelector('#max-chain').textContent = String(game.maxChain);
  document.querySelector('#next').innerHTML = game.next.map((color) => blockMarkup(color)).join('');
  document.querySelector('#next').setAttribute('aria-label', game.next.length ? `次のブロック：${game.next.map((color) => colorNames[color]).join('と')}` : '開始後に表示');
  // 接地後まで長押しを持ち越さず、次の組の意図しない操作を防ぎます。
  if (game.phase !== 'falling' || isPaused) releaseControl();
  const isPlaying = game.phase !== 'ready' && game.phase !== 'gameover';
  // 休止・終了・画面離脱では音も止め、音の状態をボタンへ伝えます。
  sound.setPlaying(isPlaying && !isPaused);
  voice.setPlaying(isPlaying && !isPaused && sound.enabled);
  voiceButton.textContent = voice.enabled ? '声 ON' : '声 OFF';
  voiceButton.setAttribute('aria-pressed', String(voice.enabled));
  previewButton.disabled = !sound.enabled;
  document.querySelector('#current-track').textContent = sound.musicEnabled ? sound.track.title : 'BGMなし';
  soundButton.textContent = sound.enabled ? '♫ 音 ON' : '♪ 音 OFF';
  soundButton.setAttribute('aria-pressed', String(sound.enabled));
  pauseButton.disabled = !isPlaying;
  pauseButton.textContent = isPaused ? '▶ 再開' : 'Ⅱ 一時停止';
  restartButton.disabled = game.phase === 'ready';
  for (const button of controls) button.disabled = !isPlaying || isPaused || game.phase !== 'falling';
  document.querySelector('#phase-label').textContent = isPaused ? 'PAUSED' : game.phase === 'gameover' ? 'GAME OVER' : game.phase === 'ready' ? 'READY' : 'PLAYING';
  overlay.hidden = isPlaying && !isPaused;
  cancelRestartButton.hidden = !isRestartPending;
  if (isRestartPending) showOverlay('最初から遊びますか？', '現在のスコアと盤面をリセットします。', 'リセットして開始 →');
  else if (isPaused) showOverlay('ちょっと、ひと休み。', '落下は止まっています。\n準備ができたら続きをどうぞ。', '続ける →');
  else if (game.phase === 'gameover') showOverlay('ゲームオーバー', `スコア ${game.score.toLocaleString('ja-JP')} ／ 最大 ${game.maxChain} 連鎖\nもう一度、連鎖をつなげよう。`, 'もう一度プレイ →');
}

// 同じオーバーレイで開始・一時停止・終了からの再開を案内します。
function showOverlay(title, description, buttonText) {
  document.querySelector('#overlay-title').textContent = title;
  document.querySelector('#overlay-description').textContent = description;
  startButton.textContent = buttonText;
}

// 長押し処理は停止・画面変更・指が離れたタイミングですべて解除します。
function releaseControl() {
  clearTimeout(holdDelay);
  clearInterval(holdTimer);
  heldControl?.classList.remove('is-held');
  heldControl = null;
}

// 一時停止から戻るときに、休止中の時間をまとめて落下へ使わないようにします。
function togglePause() {
  if (isRestartPending || game.phase === 'ready' || game.phase === 'gameover') return;
  releaseControl();
  sound.unlock();
  isPaused = !isPaused;
  // オーバーレイの再開後も、矢印キーをゲームへ届けます。
  if (!isPaused) startButton.blur();
  previousTime = 0;
  render();
}

// 再スタート時は演出用の時計と案内も初期化します。
function startGame() {
  releaseControl();
  isRestartPending = false;
  sound.unlock();
  sound.stopVoices();
  voice.stop();
  sound.step = 0;
  game.start();
  isPaused = false;
  elapsed = 0;
  previousTime = 0;
  lastPhase = game.phase;
  announcement.textContent = '同じ色を4つ。薄い枠は着地点です。';
  render();
  startButton.blur();
}

// キーと画面ボタンの操作を一つにまとめ、どちらでも同じルールで動かします。
function act(action) {
  if (isPaused || game.phase !== 'falling') return;
  if (action === 'left') game.move(-1);
  if (action === 'right') game.move(1);
  if (action === 'rotate-left') game.rotate(-1);
  if (action === 'rotate-right') game.rotate(1);
  if (action === 'down') { game.step(); elapsed = 0; }
  if (action === 'drop') { game.hardDrop(); elapsed = 0; sound.effect('drop'); }
  if (action.startsWith('rotate')) sound.effect('rotate');
  render();
}

// 矢印やSpaceの既定スクロールはプレイ中に限って抑えます。
document.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  if (event.target instanceof HTMLElement && event.target.matches('button, select, input, summary')) return;
  const key = event.key.toLowerCase();
  if (key === 'p' && !event.repeat) { event.preventDefault(); togglePause(); return; }
  const action = { arrowleft: 'left', arrowright: 'right', arrowdown: 'down', arrowup: 'rotate-right', x: 'rotate-right', z: 'rotate-left', ' ': 'drop' }[key];
  if (!action || game.phase === 'ready' || game.phase === 'gameover') return;
  event.preventDefault();
  if (event.repeat && ['drop', 'rotate-left', 'rotate-right'].includes(action)) return;
  act(action);
});

// ポインターの長押しは左右・下だけを反復し、回転と即落下は一押し一回にします。
for (const button of controls) {
  button.addEventListener('pointerdown', (event) => {
    if (button.disabled) return;
    event.preventDefault();
    releaseControl();
    button.setPointerCapture(event.pointerId);
    heldControl = button;
    button.classList.add('is-held');
    act(button.dataset.action);
    if (heldControl === button && ['left', 'right', 'down'].includes(button.dataset.action)) {
      holdDelay = setTimeout(() => { holdTimer = setInterval(() => act(button.dataset.action), 85); }, 180);
    }
  });
  button.addEventListener('pointerup', releaseControl);
  button.addEventListener('pointercancel', releaseControl);
  button.addEventListener('lostpointercapture', releaseControl);
  button.addEventListener('click', (event) => { if (event.detail === 0) act(button.dataset.action); });
}
// 音量は小さめで開始し、ボタン一つでBGM・効果音をまとめて切り替えます。
soundButton.addEventListener('click', () => {
  sound.setEnabled(!sound.enabled);
  if (!sound.enabled) voice.stop();
  render();
  soundButton.blur();
});
// 選曲は途中でも変更可能。声を切ってもBGMと効果音は残します。
trackSelect.addEventListener('change', () => {
  sound.selectTrack(trackSelect.value);
  sound.unlock();
  soundFeedback.textContent = sound.musicEnabled ? `選択中：${sound.track.title}` : 'BGMを止めました。効果音と声は再生できます。';
  render();
  trackSelect.blur();
});
voiceButton.addEventListener('click', () => {
  voice.setEnabled(!voice.enabled);
  render();
  voiceButton.blur();
});
// 一回押すと2連鎖の消去音と声を試せます。プレイ中の盤面は変えません。
previewButton.addEventListener('click', () => {
  if (!sound.enabled) return;
  sound.previewClear(2);
  const phrase = voice.playChain(2, true);
  soundFeedback.textContent = voice.enabled ? `試聴：「${phrase}」` : '消去音を試聴（声はOFF）';
  previewButton.blur();
});
startButton.addEventListener('click', () => isPaused && !isRestartPending ? togglePause() : startGame());
pauseButton.addEventListener('click', () => { togglePause(); pauseButton.blur(); });
// ブラウザ標準ダイアログを使わず、ゲーム画面内でリセットを確認します。
restartButton.addEventListener('click', () => {
  if (game.phase === 'gameover') { startGame(); return; }
  if (isRestartPending) return;
  wasPausedBeforeRestart = isPaused;
  if (!isPaused) togglePause();
  isRestartPending = true;
  render();
  startButton.focus();
});

// キャンセルは盤面・得点を保持し、確認前にプレイ中なら再開します。
cancelRestartButton.addEventListener('click', () => {
  isRestartPending = false;
  isPaused = wasPausedBeforeRestart;
  previousTime = 0;
  render();
  cancelRestartButton.blur();
});

// 別の画面へ移った間にゲームが進まないよう、自動で一時停止します。
window.addEventListener('blur', () => { sound.stopVoices(); voice.stop(); if (!isPaused) togglePause(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  sound.stopVoices();
  voice.stop();
  if (!isPaused) togglePause();
});

// フレーム間隔を制限し、PCの復帰直後も一気に積み上がらないようにします。
function tick(time) {
  const delta = previousTime ? Math.min(time - previousTime, 100) : 0;
  previousTime = time;
  if (!isPaused && !['ready', 'gameover'].includes(game.phase)) {
    elapsed += delta;
    const duration = game.phase === 'falling' ? Math.max(230, 720 - game.cleared * 2) : game.phase === 'clearing' ? 360 : 180;
    if (elapsed >= duration) {
      elapsed = 0;
      if (game.phase === 'falling') game.step();
      else game.advanceResolution();
      if (game.phase === 'clearing' && lastPhase !== 'clearing') {
        const phrase = voice.playChain(game.chain);
        announcement.textContent = `${game.chain}連鎖！ ${phrase}（${game.matches.length}個）`;
        sound.effect('clear', game.chain);
      }
      if (game.phase === 'gameover') { releaseControl(); announcement.textContent = 'ゲームオーバー。「もう一度プレイ」で再挑戦できます。'; }
      lastPhase = game.phase;
      render();
    }
  }
  sound.update();
  requestAnimationFrame(tick);
}
render();
requestAnimationFrame(tick);
