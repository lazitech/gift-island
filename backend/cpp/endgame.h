#pragma once

// Exact minimax over at most nine empty cells. Each solve owns a local
// ternary transposition table; no state is shared across search threads.
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

struct ExactEndgame {
  int value = 0;
  std::vector<int> actions;
  uint64_t positions = 0;
  uint64_t cache_hits = 0;
};

namespace giftisland_endgame_detail {

class Solver {
  Board& board;
  int n;
  int root_player;
  std::vector<int> cells;
  std::vector<std::size_t> powers;
  std::vector<int8_t> cache;

 public:
  uint64_t positions = 0;
  uint64_t cache_hits = 0;

  Solver(Board& b, int board_size, int player, std::vector<int> local_cells)
      : board(b), n(board_size), root_player(player), cells(std::move(local_cells)) {
    powers.resize(cells.size());
    powers[0] = 1;
    for (std::size_t i = 1; i < powers.size(); ++i) powers[i] = powers[i - 1] * 3;
    cache.assign(powers.back() * 3, static_cast<int8_t>(2));
  }

  // Pieces are never moved or removed. The local coloring fixes the number
  // of completed pairs, and therefore the player, so code alone is a key.
  int value(std::size_t code, int empty, int player) {
    const int8_t saved = cache[code];
    if (saved != static_cast<int8_t>(2)) {
      ++cache_hits;
      return static_cast<int>(saved);
    }
    ++positions;
    if (empty < 2) {
      const int result = terminal_value(board, n, player);
      cache[code] = static_cast<int8_t>(result);
      return result;
    }

    int best = -2;
    for (std::size_t i = 0; i < cells.size(); ++i) {
      const int x = cells[i];
      if (board[x] != 0) continue;
      for (std::size_t j = 0; j < cells.size(); ++j) {
        const int y = cells[j];
        if (i == j || board[y] != 0) continue;
        board[x] = static_cast<int8_t>(player);
        board[y] = static_cast<int8_t>(3 - player);
        const std::size_t child_code = code + static_cast<std::size_t>(player) * powers[i]
                                             + static_cast<std::size_t>(3 - player) * powers[j];
        const int candidate = -value(child_code, empty - 2, 3 - player);
        board[x] = 0;
        board[y] = 0;
        best = std::max(best, candidate);
        // A non-root +1 is proven and needs no further siblings.  The root
        // uses root_value below and always evaluates all ordered actions.
        if (best == 1) {
          cache[code] = static_cast<int8_t>(1);
          return 1;
        }
      }
    }
    cache[code] = static_cast<int8_t>(best);
    return best;
  }

  ExactEndgame root_value(int empty) {
    ExactEndgame result;
    ++positions;  // the root is counted even though it is not cached first
    if (empty < 2) {
      result.value = terminal_value(board, n, root_player);
      result.positions = positions;
      result.cache_hits = cache_hits;
      return result;
    }
    int best = -2;
    for (std::size_t i = 0; i < cells.size(); ++i) {
      const int x = cells[i];
      if (board[x] != 0) continue;
      for (std::size_t j = 0; j < cells.size(); ++j) {
        const int y = cells[j];
        if (i == j || board[y] != 0) continue;
        board[x] = static_cast<int8_t>(root_player);
        board[y] = static_cast<int8_t>(3 - root_player);
        const std::size_t child_code = static_cast<std::size_t>(root_player) * powers[i]
                                     + static_cast<std::size_t>(3 - root_player) * powers[j];
        const int candidate = -value(child_code, empty - 2, 3 - root_player);
        board[x] = 0;
        board[y] = 0;
        const int action = n * n * x + y;
        if (candidate > best) {
          best = candidate;
          result.actions.clear();
          result.actions.push_back(action);
        } else if (candidate == best) {
          result.actions.push_back(action);
        }
      }
    }
    cache[0] = static_cast<int8_t>(best);
    result.value = best;
    result.positions = positions;
    result.cache_hits = cache_hits;
    return result;
  }
};

}  // namespace giftisland_endgame_detail

inline ExactEndgame solve_endgame(Board board, int n, int player) {
  if (n <= 0 || n > 9 || (n % 2) == 0)
    throw std::invalid_argument("endgame board size must be odd and in [1,9]");
  if (player != 1 && player != 2) throw std::invalid_argument("endgame player must be 1 or 2");
  const int area = n * n;
  int empty = 0, black = 0, white = 0;
  std::vector<int> cells;
  for (int cell = 0; cell < area; ++cell) {
    const int value = board[cell];
    if (value == 0) { ++empty; cells.push_back(cell); }
    else if (value == 1) ++black;
    else if (value == 2) ++white;
    else throw std::invalid_argument("endgame board color");
  }
  if (empty > 9) throw std::invalid_argument("endgame has more than nine empty cells");
  if (black != white || player != (black % 2 ? 2 : 1))
    throw std::invalid_argument("endgame board/turn is unreachable");
  if (empty < 2) {
    ExactEndgame result;
    result.value = terminal_value(board, n, player);
    result.positions = 1;
    return result;
  }
  giftisland_endgame_detail::Solver solver(board, n, player, std::move(cells));
  return solver.root_value(empty);
}
