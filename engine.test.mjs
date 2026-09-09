// color-drop/engine.test.mjs【新規作成】消去・連鎖・衝突・終了を再現可能な盤面で検証します。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ColorDropGame, emptyBoard, findMatches, applyGravity, canPlace, rotatePiece, pieceCells } from './engine.mjs';

// 座標は描画側と共通の列・行で指定し、必要なブロックだけを並べます。
function boardWith(entries) {
  const board = emptyBoard();
  for (const [column, row, color] of entries) board[row][column] = color;
  return board;
}

test('4個以上の直交連結を消し、3個・斜め・別色は消さない', () => {
  assert.equal(findMatches(boardWith([[0,12,1],[1,12,1],[1,11,1]])).length, 0);
  assert.equal(findMatches(boardWith([[0,12,1],[1,11,1],[2,10,1],[3,9,1]])).length, 0);
  assert.equal(findMatches(boardWith([[0,12,1],[1,12,1],[2,12,1],[3,12,2]])).length, 0);
  assert.equal(findMatches(boardWith([[0,12,1],[1,12,1],[1,11,1],[2,11,1],[2,10,1]])).length, 5);
});

test('独立した2色の4個グループを同時に消す', () => {
  const board = emptyBoard();
  for (let column = 0; column < 4; column += 1) { board[12][column] = 1; board[11][column] = 2; }
  assert.equal(findMatches(board).length, 8);
});

test('重力は列内の順序を保ち、入力盤面は変更しない', () => {
  const board = boardWith([[0,0,1],[0,5,2],[0,12,3],[2,2,4]]);
  const result = applyGravity(board);
  assert.deepEqual(result.slice(10).map((row) => row[0]), [1,2,3]);
  assert.equal(result[12][2], 4);
  assert.equal(board[0][0], 1);
});

test('左右の壁・床・固定ブロックとの衝突を拒否する', () => {
  const board = emptyBoard();
  const piece = {x:0, y:12, rotation:0, colors:[1,2]};
  assert.equal(canPlace(board, piece), true);
  assert.equal(canPlace(board, {...piece, x:-1}), false);
  assert.equal(canPlace(board, {...piece, x:6}), false);
  assert.equal(canPlace(board, {...piece, y:13}), false);
  board[11][0] = 3;
  assert.equal(canPlace(board, piece), false);
});

test('左右回転は4回で元に戻り、壁際では1列補正する', () => {
  const board = emptyBoard();
  const piece = {x:2, y:5, rotation:0, colors:[1,2]};
  for (const direction of [-1,1]) {
    let rotated = piece;
    for (let count = 0; count < 4; count += 1) rotated = rotatePiece(board, rotated, direction);
    assert.deepEqual(rotated, piece);
  }
  assert.equal(rotatePiece(board, {...piece,x:0}, -1).x, 1);
  assert.equal(rotatePiece(board, {...piece,x:5}, 1).x, 4);
});

test('床や隣接ブロックで回転できない場合は元の位置を保つ', () => {
  const piece = {x:2,y:12,rotation:1,colors:[1,2]};
  assert.deepEqual(rotatePiece(emptyBoard(),piece,1), piece);
  const board = boardWith([[1,5,3],[3,5,3],[0,5,3]]);
  const upright = {...piece,y:5,rotation:0};
  assert.deepEqual(rotatePiece(board,upright,1), upright);
});

test('即落下は着地点と一致し、横置きの浮いた片方は個別に落ちる', () => {
  const game = new ColorDropGame(() => 0);
  game.start();
  game.board[12][2] = 3;
  game.rotate();
  const landing = pieceCells(game.landingPiece());
  assert.deepEqual(landing.map(({y}) => y), [11,11]);
  game.hardDrop();
  assert.equal(game.board[11][2],1);
  assert.equal(game.board[12][3],1);
  assert.equal(game.phase,'settling');
  assert.equal(game.score,0);
});

test('消去→重力→2連鎖で8個・200点になり、次の組が出る', () => {
  const game = new ColorDropGame(() => 0);
  game.start();
  // 赤の縦4個が消えると、上の青が床の青3個につながります。
  game.board = boardWith([[3,12,1],[3,11,1],[3,10,1],[3,9,1],[0,12,2],[1,12,2],[2,12,2],[3,8,2]]);
  game.phase = 'settling';
  game.piece = null;
  game.advanceResolution();
  assert.equal(game.phase,'clearing');
  assert.equal(game.score,40);
  game.advanceResolution();
  game.advanceResolution();
  assert.equal(game.chain,2);
  assert.equal(game.score,200);
  assert.equal(game.cleared,8);
  game.advanceResolution();
  game.advanceResolution();
  assert.equal(game.phase,'falling');
  assert.equal(game.maxChain,2);
});

test('出現位置または非表示行が埋まると終了し、再開でリセットする', () => {
  for (const [column,row] of [[2,1],[5,0]]) {
    const game = new ColorDropGame(() => 0.99);
    game.start();
    game.board[row][column] = 1;
    game.score = 200;
    game.spawn();
    assert.equal(game.phase,'gameover');
    assert.equal(game.piece,null);
    game.move(1);
    game.hardDrop();
    game.start();
    assert.equal(game.phase,'falling');
    assert.equal(game.score,0);
    assert.deepEqual(game.next,[4,4]);
    assert.deepEqual(game.board,emptyBoard());
  }
});
