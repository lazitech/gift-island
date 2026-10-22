#pragma once

// Immediate component-gain baseline for Gift Island.  This header is included
// by search.cpp after its Board alias and uses only the board representation;
// it does not depend on the neural search implementation.
#include <algorithm>
#include <array>
#include <cstdint>
#include <stdexcept>
#include <vector>

struct GreedyActions {
  std::vector<int> actions;
  int best_delta = 0;
  int score_difference = 0;  // black components minus white components
};

namespace giftisland_greedy_detail {

struct DisjointSet {
  std::array<int, 81> parent{};
  std::array<unsigned char, 81> rank{};

  DisjointSet() {
    parent.fill(-1);
    rank.fill(0);
  }

  void activate(int cell) { parent[cell] = cell; }

  int find(int cell) {
    int root = cell;
    while (parent[root] != root) root = parent[root];
    while (parent[cell] != cell) {
      const int next = parent[cell];
      parent[cell] = root;
      cell = next;
    }
    return root;
  }

  void unite(int first, int second) {
    first = find(first);
    second = find(second);
    if (first == second) return;
    if (rank[first] < rank[second]) std::swap(first, second);
    parent[second] = first;
    if (rank[first] == rank[second]) ++rank[first];
  }
};

struct ComponentLabels {
  std::array<int, 81> label{};
  int count = 0;
  int color = 0;

  ComponentLabels(const Board& board, int n, int color) {
    this->color = color;
    label.fill(-1);
    DisjointSet dsu;
    const int area = n * n;
    for (int cell = 0; cell < area; ++cell) {
      if (board[cell] == color) dsu.activate(cell);
    }
    for (int row = 0; row < n; ++row) {
      for (int column = 0; column < n; ++column) {
        const int cell = row * n + column;
        if (board[cell] != color) continue;
        if (column + 1 < n && board[cell + 1] == color) dsu.unite(cell, cell + 1);
        if (row + 1 < n && board[cell + n] == color) dsu.unite(cell, cell + n);
      }
    }
    std::array<int, 81> component_root{};
    component_root.fill(-1);
    for (int cell = 0; cell < area; ++cell) {
      if (board[cell] != color) continue;
      const int root = dsu.find(cell);
      if (component_root[root] < 0) component_root[root] = count++;
      label[cell] = component_root[root];
    }
  }

  int delta_if_added(const Board& board, int n, int cell) const {
    const int row = cell / n;
    const int column = cell % n;
    int adjacent[4];
    int adjacent_count = 0;
    const int neighbors[4] = {
      row > 0 ? cell - n : -1,
      row + 1 < n ? cell + n : -1,
      column > 0 ? cell - 1 : -1,
      column + 1 < n ? cell + 1 : -1,
    };
    for (const int neighbor : neighbors) {
      if (neighbor < 0 || board[neighbor] != color) continue;
      const int component = label[neighbor];
      bool duplicate = false;
      for (int index = 0; index < adjacent_count; ++index) {
        if (adjacent[index] == component) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) adjacent[adjacent_count++] = component;
    }
    return 1 - adjacent_count;
  }
};

inline int validate_and_count(const Board& board, int n, int player) {
  if (n <= 0 || n > 9 || (n % 2) == 0) {
    throw std::invalid_argument("greedy board size must be odd and in [1,9]");
  }
  if (player != 1 && player != 2) {
    throw std::invalid_argument("greedy player must be 1 or 2");
  }
  const int area = n * n;
  int black = 0;
  int white = 0;
  for (int cell = 0; cell < area; ++cell) {
    if (board[cell] == 1) {
      ++black;
    } else if (board[cell] == 2) {
      ++white;
    } else if (board[cell] != 0) {
      throw std::invalid_argument("greedy board color");
    }
  }
  if (black != white || player != (black % 2 ? 2 : 1)) {
    throw std::invalid_argument("greedy board/turn is unreachable");
  }
  return area;
}

}  // namespace giftisland_greedy_detail

inline GreedyActions greedy_actions(Board board, int n, int player) {
  using giftisland_greedy_detail::ComponentLabels;
  const int area = giftisland_greedy_detail::validate_and_count(board, n, player);
  const ComponentLabels black(board, n, 1);
  const ComponentLabels white(board, n, 2);

  GreedyActions result;
  result.score_difference = black.count - white.count;
  int empty = 0;
  for (int cell = 0; cell < area; ++cell) empty += board[cell] == 0;
  if (empty < 2) return result;

  std::array<int, 81> own_delta{};
  std::array<int, 81> opponent_delta{};
  for (int cell = 0; cell < area; ++cell) {
    if (board[cell] != 0) continue;
    own_delta[cell] = player == 1
        ? black.delta_if_added(board, n, cell)
        : white.delta_if_added(board, n, cell);
    opponent_delta[cell] = player == 1
        ? white.delta_if_added(board, n, cell)
        : black.delta_if_added(board, n, cell);
  }

  result.best_delta = -1000000;
  for (int first = 0; first < area; ++first) {
    if (board[first] != 0) continue;
    for (int second = 0; second < area; ++second) {
      if (second == first || board[second] != 0) continue;
      const int value = own_delta[first] - opponent_delta[second];
      const int action = first * area + second;
      if (value > result.best_delta) {
        result.best_delta = value;
        result.actions.clear();
        result.actions.push_back(action);
      } else if (value == result.best_delta) {
        result.actions.push_back(action);
      }
    }
  }
  return result;
}

