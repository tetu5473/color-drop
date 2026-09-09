// color-drop/input.test.mjs【修正】入力イベントと時計を模擬し、長押し解除と一時停止の退行を検証します。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { characterMarkup, connectionsAt } from './characters.mjs';
import { GameAudio } from './audio.mjs';
import { TRACKS } from './tracks.mjs';
import { GameVoice } from './voice.mjs';
import { ColorDropGame, WIDTH, HEIGHT, pieceCells } from './engine.mjs';

// ブラウザに依存する最小限の要素・イベント・時計を用意します。
function setup() {
  const timers = new Map();
  const elements = new Map();
  let timerIdentifier = 0;
  let focused = null;
  class Element {
    constructor(action) { this.dataset = {action}; this.events = {}; this.classList = {add(){},remove(){},toggle(){}}; }
    addEventListener(name, handler) { this.events[name] = handler; }
    append() {}
    pause() {}
    play() { return Promise.resolve(); }
    setAttribute() {}
    setPointerCapture() {}
    focus() { focused = this; }
    blur() { if (focused === this) focused = null; }
    matches(selector) { return selector === 'button'; }
  }
  const controls = ['left','right','down','drop'].map((action) => new Element(action));
  const document = {
    events: {}, hidden: false,
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    querySelectorAll() { return controls; },
    createElement() { return new Element(); },
    addEventListener(name, handler) { this.events[name] = handler; },
  };
  const window = {events:{},addEventListener(name,handler){this.events[name]=handler;},confirm(){return true;}};
  const schedule = (handler) => { const identifier = ++timerIdentifier; timers.set(identifier,handler); return identifier; };
  const context = vm.createContext({ColorDropGame,WIDTH,HEIGHT,pieceCells,characterMarkup,connectionsAt,GameAudio,GameVoice,TRACKS,document,window,HTMLElement:Element,
    setTimeout:schedule,setInterval:schedule,clearTimeout:(identifier)=>timers.delete(identifier),clearInterval:(identifier)=>timers.delete(identifier),requestAnimationFrame(){}});
  const source = readFileSync(new URL('./game.mjs',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
  vm.runInContext(source,context);
  return {context,document,window,controls,timers,elements,focus(element){focused=element;},get focused(){return focused;},run(source){return vm.runInContext(source,context);}};
}

// 実際と同じ入力ハンドラにイベントを渡します。
function pressControl(control) { control.events.pointerdown({preventDefault(){},pointerId:1}); }

test('続けるボタンで再開するとフォーカスを解除する', () => {
  const environment = setup();
  environment.run('startGame(); togglePause();');
  environment.focus(environment.elements.get('#start'));
  environment.elements.get('#start').events.click();
  assert.equal(environment.focused,null);
  assert.equal(environment.run('isPaused'),false);
});

test('指を離す・キャンセル・キャプチャ喪失で長押し時計を解除する', () => {
  for (const eventName of ['pointerup','pointercancel','lostpointercapture']) {
    const environment = setup();
    environment.run('startGame()');
    const control = environment.controls[0];
    pressControl(control);
    assert.equal(environment.timers.size,1);
    control.events[eventName]();
    assert.equal(environment.timers.size,0);
    assert.equal(environment.run('heldControl'),null);
  }
});

test('一時停止・画面非表示・ウィンドウ離脱で長押しを停止する', () => {
  for (const stop of ['pause','hidden','blur']) {
    const environment = setup();
    environment.run('startGame()');
    pressControl(environment.controls[0]);
    if (stop === 'pause') environment.run('togglePause()');
    if (stop === 'hidden') { environment.document.hidden = true; environment.document.events.visibilitychange(); }
    if (stop === 'blur') environment.window.events.blur();
    assert.equal(environment.timers.size,0);
    assert.equal(environment.run('isPaused'),true);
  }
});

test('下の長押しで接地すると、次の組に反復操作を持ち越さない', () => {
  const environment = setup();
  environment.run('startGame(); game.piece = game.landingPiece();');
  pressControl(environment.controls[2]);
  assert.equal(environment.run('game.phase'),'settling');
  assert.equal(environment.timers.size,0);
  assert.equal(environment.run('heldControl'),null);
});

test('一時停止中は時間もキーも盤面を動かさず、再開時は休止時間を捨てる', () => {
  const environment = setup();
  environment.run('startGame(); tick(100); togglePause();');
  const before = environment.run('JSON.stringify(game.piece)');
  environment.run("tick(100000); act('left'); act('drop');");
  assert.equal(environment.run('JSON.stringify(game.piece)'),before);
  environment.run('togglePause(); tick(200000);');
  assert.equal(environment.run('JSON.stringify(game.piece)'),before);
});

// 確認・キャンセルのどちらも盤面と停止状態が意図どおりになるか検証します。
test('リスタート確認はキャンセルで盤面を保持し、確定時だけ初期化する', () => {
  const environment = setup();
  environment.run('startGame(); game.score = 200;');
  environment.elements.get('#restart').events.click();
  assert.equal(environment.run('isRestartPending && isPaused'),true);
  assert.equal(environment.run('game.score'),200);
  environment.elements.get('#cancel-restart').events.click();
  assert.equal(environment.run('isPaused'),false);
  assert.equal(environment.run('game.score'),200);
  environment.elements.get('#restart').events.click();
  environment.elements.get('#start').events.click();
  assert.equal(environment.run('game.score'),0);
  assert.equal(environment.run('isRestartPending || isPaused'),false);
});
// エンジンの盤面が描画へ渡り、隣接セルの双方で輪郭が変わることを確認します。
test('固定盤面の同色接続と消去後の切断が描画へ反映される', () => {
  const environment = setup();
  environment.run('startGame(); game.piece = null; game.board[12][0] = 1; game.board[12][1] = 1; render();');
  assert.match(environment.run('cells[66].innerHTML'), /data-connections="right"/);
  assert.match(environment.run('cells[67].innerHTML'), /data-connections="left"/);
  environment.run('game.board[12][1] = 0; render();');
  assert.match(environment.run('cells[66].innerHTML'), /data-connections=""/);
});

test('操作中の同色ペアも回転に応じて接続方向が変わる', () => {
  const environment = setup();
  environment.run('startGame(); game.piece = {x:2,y:3,rotation:0,colors:[2,2]}; render();');
  assert.match(environment.run('cells[14].innerHTML'), /data-connections="top"/);
  environment.run('game.rotate(); render();');
  assert.match(environment.run('cells[14].innerHTML'), /data-connections="right"/);
});

// 実際の消去への遷移に、効果音と掛け声が一度だけ結び付くことを確かめます。
test('4個消去の瞬間に効果音と掛け声を1回ずつ再生する', () => {
  const environment=setup();
  environment.run(`startGame(); sound.enabled=true; render(); game.piece=null; game.board[12]=[1,1,1,1,0,0];
    game.phase='settling'; lastPhase='settling'; let effects=0;
    sound.effect=()=>{effects+=1;}; elapsed=180; tick(100);`);
  assert.equal(environment.run('effects'),1);
  assert.equal(environment.elements.get('#callout-audio').src,'voices/pop.wav');
  assert.match(environment.elements.get('#announcement').textContent,/1連鎖！ ぽんっ/);
  environment.run('tick(101)');
  assert.equal(environment.run('effects'),1);
});
