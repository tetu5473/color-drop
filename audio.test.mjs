// color-drop/audio.test.mjs【新規作成】発音予約・ミュート・休止・曲のループを音声装置なしで検証します。
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, MELODY } from './audio.mjs';

// 予約された開始・停止時刻を記録し、音が停止後に新規作成されないかを確かめます。
function setupAudio() {
  const voices = [];
  const parameter = () => ({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  const context = {state:'running',currentTime:0,destination:{},
    createGain(){return {gain:parameter(),connect(){},disconnect(){}};},
    createOscillator(){const voice = {frequency:parameter(),connect(){},disconnect(){},start(time){this.started=time;},stop(time){this.stopped=time ?? 'immediate';}};voices.push(voice);return voice;},
  };
  const sound = new GameAudio(() => context);
  return {sound,context,voices};
}

test('ユーザーが開始するまで音声装置を作らない', () => {
  let created = false;
  const sound = new GameAudio(() => {created=true;throw Error();});
  sound.update();
  assert.equal(created,false);
  sound.unlock();
  assert.equal(sound.enabled,false);
});

test('再生中だけ発音を予約し、一時停止では予約音を止める', () => {
  const {sound,context,voices} = setupAudio();
  sound.unlock();sound.setPlaying(true);sound.update();
  assert.ok(voices.length > 0);
  assert.ok(voices.every((voice) => Number.isFinite(voice.started)));
  const count = voices.length;
  sound.setPlaying(false);
  assert.ok(voices.every((voice) => voice.stopped === 'immediate'));
  context.currentTime=200;sound.update();
  assert.equal(voices.length,count);
  sound.setPlaying(true);sound.update();
  assert.ok(voices.slice(count).every((voice) => voice.started >= 200));
});

test('ミュート中はBGMと連鎖音が増えず、解除で再開する', () => {
  const {sound,context,voices} = setupAudio();
  sound.unlock();sound.setPlaying(true);sound.update();sound.setEnabled(false);
  const count=voices.length;
  context.currentTime=2;sound.update();sound.effect('clear',2);
  assert.equal(voices.length,count);
  sound.setEnabled(true);sound.update();
  assert.ok(voices.length>count);
});

test('16小節を繰り返しても時刻が前進し、同時予約を過剰に増やさない', () => {
  const {sound,context,voices} = setupAudio();
  assert.equal(MELODY.length,16);
  assert.ok(MELODY.every((bar) => bar.length===8));
  sound.unlock();sound.setPlaying(true);
  for(let frame=0;frame<4000;frame+=1){context.currentTime=frame/60;sound.update();}
  assert.ok(sound.step>=0 && sound.step<128);
  assert.ok(sound.nextTime>context.currentTime);
  assert.ok(voices.length<2000);
});

// 選曲しても前の音が残らず、それぞれの拍数・曲長でループすることを確認します。
test('全4曲の選択・ループとBGMだけの停止', async () => {
  const {TRACKS} = await import('./tracks.mjs');
  const {sound,context,voices} = setupAudio();
  sound.unlock();sound.setPlaying(true);
  assert.equal(TRACKS.length,4);
  for(const track of TRACKS){
    sound.selectTrack(track.id);
    assert.equal(sound.step,0);
    for(let frame=0;frame<4000;frame+=1){context.currentTime+=1/60;sound.update();}
    assert.ok(sound.step < track.melody.length * track.melody[0].length);
    assert.ok(sound.nextTime > context.currentTime);
    assert.ok(voices.every((voice)=>Number.isFinite(voice.started)));
  }
  sound.selectTrack('none');
  const count=voices.length;
  context.currentTime+=1;sound.update();
  assert.equal(voices.length,count);
  sound.effect('clear',2);
  assert.equal(voices.length,count+6);
  assert.equal(sound.selectTrack('missing'),false);
});

test('開始前の試聴で消去音を再生でき、全体ミュートは優先される', async () => {
  const {sound,voices} = setupAudio();
  await sound.previewClear(2);
  assert.equal(sound.playing,false);
  assert.equal(voices.length,6);
  sound.setEnabled(false);
  await sound.previewClear(2);
  assert.equal(voices.length,6);
});

test('試聴の再生許可を待つ間に停止した場合は、後から音を出さない', async () => {
  const {sound,context,voices}=setupAudio();
  let completeResume;
  const waiting = new Promise((resolve)=>{completeResume=resolve;});
  context.state='suspended';context.resume=()=>waiting;
  const preview=sound.previewClear(2);
  sound.stopVoices();context.state='running';completeResume();
  await preview;
  assert.equal(voices.length,0);
});
