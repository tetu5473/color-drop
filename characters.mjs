// color-drop/characters.mjs【修正】同色の隣接方向に合わせて丸い団子の輪郭をSVGで描き、盤面・次の組・タイトルで共用します。
const palettes = [null,
  {light:'#ffd5dc',middle:'#ff779e',dark:'#d93675',outline:'#923563'},
  {light:'#d0f8ff',middle:'#65d6f4',dark:'#318dcb',outline:'#33659b'},
  {light:'#fff6bf',middle:'#ffd463',dark:'#e9a335',outline:'#a56935'},
  {light:'#e0ffd7',middle:'#90df86',dark:'#44aa83',outline:'#39795d'},
];

// 固定盤面でも操作中の組でも、上下左右の同色だけを接続対象にします。
export function connectionsAt(colorAt, column, row, color) {
  return {
    top: colorAt(column, row - 1) === color, // 上の同色へ輪郭を伸ばします。
    right: colorAt(column + 1, row) === color, // 右の同色へ輪郭を伸ばします。
    bottom: colorAt(column, row + 1) === color, // 下の同色へ輪郭を伸ばします。
    left: colorAt(column - 1, row) === color, // 左の同色へ輪郭を伸ばします。
  };
}

// 各辺の曲線を切り替え、丸い本体から隣のセルへ滑らかな首を伸ばします。
export function characterMarkup(color, extraClass = '', connections = {}) {
  const palette = palettes[color];
  const segments = [
    connections.top ? 'C24 8 24 8 24 0 L56 0 C56 8 56 8 64 16' : 'C29 3 51 3 64 16',
    connections.right ? 'C72 24 72 24 80 24 L80 56 C72 56 72 56 64 64' : 'C77 29 77 51 64 64',
    connections.bottom ? 'C56 72 56 72 56 80 L24 80 C24 72 24 72 16 64' : 'C51 77 29 77 16 64',
    connections.left ? 'C8 56 8 56 0 56 L0 24 C8 24 8 24 16 16' : 'C3 51 3 29 16 16',
  ];
  const silhouette = `M16 16 ${segments.join(' ')} Z`;
  // 接続面だけペンを上げることで、隣同士の内側に境界線を描きません。
  const outline = `M16 16 ${segments.join(' ').replaceAll(' L', ' M')}`;
  const connectedSides = ['top','right','bottom','left'].filter((side) => connections[side]).join(' ');
  const eyes = color === 3
    ? '<path d="M23 38 Q28 32 33 38 M47 38 Q52 32 57 38" fill="none" stroke="#49334e" stroke-width="3.4" stroke-linecap="round"/>'
    : '<ellipse cx="28" cy="38" rx="3.3" ry="5" fill="#49334e"/><ellipse cx="51" cy="38" rx="3.3" ry="5" fill="#49334e"/><circle cx="29" cy="36" r="1.1" fill="white"/><circle cx="52" cy="36" r="1.1" fill="white"/>';
  // SVGをセルいっぱいに描き、余白や縁取りが接続面を分断しないようにします。
  return `<span class="block color-${color} ${extraClass}" data-connections="${connectedSides}" aria-hidden="true"><svg viewBox="0 0 80 80" preserveAspectRatio="none" focusable="false">
    <path d="${silhouette}" fill="${palette.middle}"/>
    <path d="${outline}" fill="none" stroke="${palette.outline}" stroke-width="2.3" stroke-linejoin="round"/>
    <ellipse cx="28" cy="21" rx="11" ry="4.5" transform="rotate(-25 28 21)" fill="${palette.light}" opacity=".85"/>
    <circle cx="57" cy="23" r="2.3" fill="white" opacity=".7"/>
    ${eyes}
    <ellipse cx="20" cy="46" rx="5" ry="2.6" fill="#ec6685" opacity=".5"/><ellipse cx="59" cy="46" rx="5" ry="2.6" fill="#ec6685" opacity=".5"/>
    <path d="M35 47 Q40 ${color === 2 ? 57 : 53} 45 47" fill="none" stroke="#733d5c" stroke-width="2.2" stroke-linecap="round"/>
  </svg></span>`;
}
