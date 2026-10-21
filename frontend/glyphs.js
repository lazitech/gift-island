// Characters drawn in stones. Each stroke lists its cells [row, col] in the direction of the
// brush, and strokes are in writing order, so a glyph can be written as well as shown.

/** Cells from a to b inclusive, along a row, a column or a diagonal. */
function line([r0, c0], [r1, c1]) {
  const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0), out = [];
  for (let r = r0, c = c0; ; r += dr, c += dc) {
    out.push([r, c]);
    if (r === r1 && c === c1) return out;
  }
}

export const ZENG = {
  width: 15, height: 14,
  strokes: [
    line([1, 0], [9, 0]),                                  // 贝 丨
    [...line([1, 1], [1, 4]), ...line([2, 4], [9, 4])],    // 𠃍
    [...line([3, 2], [10, 2]), [11, 1], [12, 0]],          // 丿
    [[11, 3], [12, 4]],                                    // 丶
    [[0, 8], [1, 9]],                                      // 曾 丷
    [[0, 12], [1, 11]],
    line([3, 6], [7, 6]),                                  // 丨
    [...line([3, 7], [3, 14]), ...line([4, 14], [7, 14])], // 𠃍
    [[5, 8]],                                              // 丶
    [[5, 12]],                                             // 丿
    line([4, 10], [6, 10]),                                // 丨
    line([7, 7], [7, 13]),                                 // 一
    line([9, 7], [13, 7]),                                 // 日 丨
    [...line([9, 8], [9, 13]), ...line([10, 13], [13, 13])],
    line([11, 8], [11, 12]),
    line([13, 8], [13, 12]),
  ],
};

export const DAO = {
  width: 13, height: 14,
  strokes: [
    [[0, 6], [1, 5]],                                      // 丿
    [...line([2, 1], [2, 10]), ...line([3, 10], [6, 10])], // 横折
    [[4, 4], [5, 5]],                                      // 丶
    [...line([3, 1], [7, 1]), ...line([7, 2], [7, 12]),    // 竖折折钩
      ...line([8, 12], [13, 12]), [13, 11], [13, 10]],
    line([9, 4], [11, 4]),                                 // 山 丨
    [...line([10, 0], [12, 0]), ...line([12, 1], [12, 8])], // 竖折
    line([10, 8], [11, 8]),                                // 丨
  ],
};

export const ZHU = {
  width: 13, height: 12,
  strokes: [
    [[0, 5], [1, 6]],                                      // 丶
    line([3, 1], [3, 11]),                                 // 一
    line([7, 2], [7, 10]),                                 // 一
    [...line([4, 6], [6, 6]), ...line([8, 6], [10, 6])],   // 丨
    line([11, 0], [11, 12]),                               // 一
  ],
};

/**
 * Lay glyphs out on a cols-wide grid. `placed` is [[glyph, row, col, color], …].
 * Returns the board (0 empty, else the colour) and, per glyph, its cells in writing order.
 */
export function compose(cols, rows, placed) {
  const board = new Array(cols * rows).fill(0);
  const order = placed.map(([glyph, r0, c0, color]) => glyph.strokes.flat().map(([r, c]) => {
    const i = (r0 + r) * cols + c0 + c;
    board[i] = color;
    return i;
  }));
  return { board, order };
}
