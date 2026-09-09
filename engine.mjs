// color-drop/engine.mjs【新規作成】落下・回転・連鎖・得点を管理する、画面に依存しないゲーム本体です。
export const WIDTH = 6;
export const HEIGHT = 13; // 最上段は新しい組が現れる非表示の待機行です。
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// 盤面は行ごとに独立した配列にし、他の行を誤って書き換えないようにします。
export function emptyBoard() {
  return Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(0));
}

// 回転軸のブロックと、その周囲のブロックの座標を返します。
export function pieceCells(piece) {
  const [offsetX, offsetY] = DIRECTIONS[piece.rotation];
  return [
    { x: piece.x, y: piece.y, color: piece.colors[0] },
    { x: piece.x + offsetX, y: piece.y + offsetY, color: piece.colors[1] },
  ];
}

// 壁・床・固定済みブロックのいずれにも重ならない位置だけを許可します。
export function canPlace(board, piece) {
  return pieceCells(piece).every(({ x, y }) => (
    x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && board[y][x] === 0
  ));
}

// 壁際では横へ一マスずらして回転を試し、入らない場合は元の位置を保持します。
export function rotatePiece(board, piece, direction = 1) {
  const rotation = (piece.rotation + direction + 4) % 4;
  for (const offsetX of [0, -1, 1]) {
    const candidate = { ...piece, rotation, x: piece.x + offsetX };
    if (canPlace(board, candidate)) return candidate;
  }
  return piece;
}

// 色ごとの連結成分を探索し、上下左右に四つ以上つながる全グループを同時に消します。
export function findMatches(board) {
  const visited = new Set();
  const matched = [];
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let column = 0; column < WIDTH; column += 1) {
      const color = board[row][column];
      const origin = row * WIDTH + column;
      if (!color || visited.has(origin)) continue;
      const group = [{ x: column, y: row }];
      visited.add(origin);
      for (let cursor = 0; cursor < group.length; cursor += 1) {
        const cell = group[cursor];
        for (const [offsetX, offsetY] of DIRECTIONS) {
          const x = cell.x + offsetX;
          const y = cell.y + offsetY;
          const position = y * WIDTH + x;
          if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || visited.has(position)) continue;
          if (board[y][x] !== color) continue;
          visited.add(position);
          group.push({ x, y });
        }
      }
      if (group.length >= 4) matched.push(...group);
    }
  }
  return matched;
}

// 消えた跡へ各列を落とし、上下の並び順は保持します。
export function applyGravity(board) {
  const result = emptyBoard();
  for (let column = 0; column < WIDTH; column += 1) {
    let destination = HEIGHT - 1;
    for (let row = HEIGHT - 1; row >= 0; row -= 1) {
      if (board[row][column]) result[destination--][column] = board[row][column];
    }
  }
  return result;
}

// 消去・落下の段階を分け、ブラウザ側で連鎖を見せる時間を設けられるようにします。
export class ColorDropGame {
  constructor(random = Math.random) {
    this.random = random; // テストで色順を再現できる乱数の供給元です。
    this.board = emptyBoard(); // 固定済みのブロックだけを保持する盤面です。
    this.piece = null; // 現在操作する二個一組です。
    this.next = []; // 次に出現する二色です。
    this.phase = 'ready'; // ready・falling・settling・clearing・gameoverの進行状態です。
    this.score = 0; // 今回のプレイで得た点数です。
    this.chain = 0; // 現在の消去から続く連鎖数です。
    this.maxChain = 0; // 今回の最大連鎖数です。
    this.cleared = 0; // 今回消したブロックの合計です。
    this.matches = []; // 消去演出中の座標です。
  }

  // 四色から次の組を作ります。色に対応する記号は画面側が受け持ちます。
  randomPair() {
    return [1 + Math.floor(this.random() * 4), 1 + Math.floor(this.random() * 4)];
  }

  // リスタート時は点数・連鎖・盤面をすべて初期化します。
  start() {
    this.board = emptyBoard();
    this.score = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.cleared = 0;
    this.matches = [];
    this.next = this.randomPair();
    this.spawn();
  }

  // 盤面上端まで積み上がった場合は、新しい組を出さず終了します。
  spawn() {
    const candidate = { x: 2, y: 1, rotation: 0, colors: [...this.next] };
    if (this.board[0].some(Boolean) || !canPlace(this.board, candidate)) {
      this.piece = null;
      this.phase = 'gameover';
      return;
    }
    this.piece = candidate;
    this.next = this.randomPair();
    this.phase = 'falling';
  }

  // 落下中以外の操作は無視し、消去演出中の盤面を変えません。
  move(horizontal, vertical = 0) {
    if (this.phase !== 'falling') return false;
    const candidate = { ...this.piece, x: this.piece.x + horizontal, y: this.piece.y + vertical };
    if (!canPlace(this.board, candidate)) return false;
    this.piece = candidate;
    return true;
  }

  // 左右どちらの回転も同じ衝突判定を使います。
  rotate(direction = 1) {
    if (this.phase !== 'falling') return;
    this.piece = rotatePiece(this.board, this.piece, direction);
  }

  // 一段下へ進めずに接地したとき、二個を盤面へ固定します。
  step() {
    if (this.phase !== 'falling') return;
    if (!this.move(0, 1)) this.lock();
  }

  // 着地点の予告と即落下が同じ位置になるよう、同じ探索を使います。
  landingPiece() {
    if (!this.piece) return null;
    let candidate = this.piece;
    while (canPlace(this.board, { ...candidate, y: candidate.y + 1 })) {
      candidate = { ...candidate, y: candidate.y + 1 };
    }
    return candidate;
  }

  // 即落下は点数を水増しせず、その場で組を固定します。
  hardDrop() {
    if (this.phase !== 'falling') return;
    this.piece = this.landingPiece();
    this.lock();
  }

  // 横置きした組の片方だけが浮いている場合も、重力で別々に落とします。
  lock() {
    for (const { x, y, color } of pieceCells(this.piece)) this.board[y][x] = color;
    this.board = applyGravity(this.board);
    this.piece = null;
    this.chain = 0;
    this.phase = 'settling';
  }

  // 連鎖は「消えた数 × 10 × 連鎖数の二乗」で加点します。
  advanceResolution() {
    if (this.phase === 'clearing') {
      for (const { x, y } of this.matches) this.board[y][x] = 0;
      this.board = applyGravity(this.board);
      this.matches = [];
      this.phase = 'settling';
      return;
    }
    if (this.phase !== 'settling') return;
    this.matches = findMatches(this.board);
    if (this.matches.length === 0) {
      this.spawn();
      return;
    }
    this.chain += 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.cleared += this.matches.length;
    this.score += this.matches.length * 10 * this.chain ** 2;
    this.phase = 'clearing';
  }
}
