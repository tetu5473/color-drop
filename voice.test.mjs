// color-drop/voice.test.mjs【新規作成】連鎖の掛け声・中断・再生失敗を音声要素の代役で検証します。
import test from 'node:test';
import assert from 'node:assert/strict';
import {GameVoice} from './voice.mjs';

// 再生回数と停止回数を記録し、同時に声が積み重ならないことを確かめます。
function setupVoice() {
  const element={src:'',currentTime:1,plays:0,pauses:0,
    play(){this.plays+=1;return Promise.resolve();},pause(){this.pauses+=1;}};
  return {element,voice:new GameVoice(element)};
}

test('連鎖数で声を変え、新しい声の前に古い声を止める', () => {
  const {voice,element}=setupVoice();voice.setPlaying(true);
  for(const [chain,file] of [[1,'pop'],[2,'chain2'],[3,'chain3'],[4,'chain4'],[9,'chain5']]){
    voice.playChain(chain);
    assert.equal(element.src,`voices/${file}.wav`);
  }
  assert.equal(element.plays,5);assert.equal(element.pauses,5);
});

test('声OFF・一時停止では再生せず、停止中は試聴だけを許可する', () => {
  const {voice,element}=setupVoice();
  voice.playChain(1);assert.equal(element.plays,0);
  voice.playChain(2,true);assert.equal(element.plays,1);
  voice.setPlaying(true);voice.setPlaying(false);
  assert.equal(element.currentTime,0);
  voice.setEnabled(false);voice.playChain(2,true);
  assert.equal(element.plays,1);
});

test('再生拒否を通知し、停止後に届いた古いエラーは無視する', async () => {
  let notifications=0;
  const element={pause(){},play(){return Promise.reject(Error('blocked'));}};
  const voice=new GameVoice(element,()=>{notifications+=1;});
  voice.playChain(1,true);await Promise.resolve();
  assert.equal(notifications,1);
  voice.playChain(1,true);voice.stop();await Promise.resolve();
  assert.equal(notifications,1);
});

// 音声合成が空ファイルを返した場合を検出し、実際の波形がある素材だけを配布します。
test('全5種類の音声ファイルに空でないPCM波形が入っている', async () => {
  const {readFileSync}=await import('node:fs');
  for(const name of ['pop','chain2','chain3','chain4','chain5']){
    const buffer=readFileSync(new URL(`./voices/${name}.wav`,import.meta.url));
    assert.equal(buffer.toString('ascii',0,4),'RIFF');
    let waveform;
    for(let offset=12;offset+8<=buffer.length;){
      const length=buffer.readUInt32LE(offset+4);
      if(buffer.toString('ascii',offset,offset+4)==='data')waveform=buffer.subarray(offset+8,offset+8+length);
      offset+=8+length+(length%2);
    }
    assert.ok(waveform?.length>4000,`${name} の音声が空です`);
    assert.ok(waveform.some((value)=>value!==0),`${name} が無音です`);
  }
});
