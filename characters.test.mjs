// color-drop/characters.test.mjs【新規作成】隣接する同色だけがつながることと全16方向の輪郭を検証します。
import test from 'node:test';
import assert from 'node:assert/strict';
import { characterMarkup, connectionsAt } from './characters.mjs';
import { emptyBoard, applyGravity } from './engine.mjs';

// 小さな盤面から対象位置の接続方向を読み取ります。
function inspect(board, column, row) {
  return connectionsAt((column, row) => board[row]?.[column], column, row, board[row][column]);
}

test('横並びの同色は双方の接続面だけを開く', () => {
  const board = [[1,1]];
  assert.deepEqual(inspect(board,0,0),{top:false,right:true,bottom:false,left:false});
  assert.deepEqual(inspect(board,1,0),{top:false,right:false,bottom:false,left:true});
});

test('縦・L字・十字の同色へ輪郭を伸ばす', () => {
  assert.deepEqual(inspect([[0,2,0],[2,2,2],[0,2,0]],1,1),{top:true,right:true,bottom:true,left:true});
  assert.deepEqual(inspect([[1,1],[1,0]],0,0),{top:false,right:true,bottom:true,left:false});
});

test('異色と斜めはつながらず、盤面外も安全に扱う', () => {
  assert.deepEqual(inspect([[1,2],[3,1]],0,0),{top:false,right:false,bottom:false,left:false});
});

test('消去後の重力で接続方向が更新される', () => {
  const board = emptyBoard();board[10][0]=1;board[12][1]=1;
  assert.equal(inspect(board,0,10).right,false);
  const settled = applyGravity(board);
  assert.equal(inspect(settled,0,12).right,true);
  settled[12][1]=0;
  assert.equal(inspect(settled,0,12).right,false);
});

test('16通りの接続形を描け、内側の接続面に輪郭線を引かない', () => {
  const sides = ['top','right','bottom','left'];
  for(let mask=0;mask<16;mask+=1){
    const connections = Object.fromEntries(sides.map((side,index)=>[side,Boolean(mask & (1 << index))]));
    const markup = characterMarkup(1,'',connections);
    assert.ok(!markup.includes('undefined'));
    const outline = markup.match(/<path d="([^"]+)" fill="none" stroke=/)[1];
    assert.ok(!outline.includes(' L'));
    for(const side of sides) assert.equal(markup.match(/data-connections="([^"]*)"/)[1].includes(side),connections[side]);
  }
});
