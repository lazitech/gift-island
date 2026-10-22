"""Randomly initialized residual joint policy/WDL network (no Go weights)."""
import math

import torch
from torch import nn
import torch.nn.functional as F


class ResidualBlock(nn.Module):
    def __init__(self, channels, blocks, pooled=False):
        super().__init__()
        self.bias1 = nn.Parameter(torch.zeros(1, channels, 1, 1))
        self.bias2 = nn.Parameter(torch.zeros(1, channels, 1, 1))
        self.scale = nn.Parameter(torch.ones(1, channels, 1, 1))
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.pool = nn.Linear(2 * channels, channels, bias=False) if pooled else None
        nn.init.kaiming_normal_(self.conv1.weight, nonlinearity="relu")
        self.conv1.weight.data.mul_(1 / math.sqrt(blocks))
        nn.init.zeros_(self.conv2.weight)
        if self.pool is not None:
            nn.init.zeros_(self.pool.weight)

    def forward(self, x):
        y = self.conv1(F.relu(x + self.bias1))
        if self.pool is not None:
            context = torch.cat((y.mean((2, 3)), y.amax((2, 3))), dim=1)
            y = y + self.pool(context)[:, :, None, None]
        return x + self.conv2(F.relu(y + self.bias2) * self.scale)


class GiftNet(nn.Module):
    def __init__(self, blocks=10, channels=128, pair_rank=16, board_size=9):
        super().__init__()
        self.spec = dict(blocks=blocks, channels=channels, pair_rank=pair_rank, board_size=board_size)
        self.n = board_size
        self.area = board_size**2
        self.pair_rank = pair_rank
        self.stem = nn.Conv2d(3, channels, 3, padding=1)
        self.blocks = nn.Sequential(*[
            ResidualBlock(channels, blocks, pooled=(i % 4 == 3)) for i in range(blocks)
        ])
        self.final_bias = nn.Parameter(torch.zeros(1, channels, 1, 1))
        self.policy = nn.Sequential(nn.Conv2d(channels, 64, 1), nn.ReLU(), nn.Conv2d(64, 2 + 2 * pair_rank, 1))
        self.relative_bias = nn.Parameter(torch.zeros((2 * board_size - 1)**2))
        coords = torch.stack(torch.meshgrid(torch.arange(board_size), torch.arange(board_size), indexing="ij")).flatten(1)
        difference = coords[:, :, None] - coords[:, None, :] + board_size - 1
        self.register_buffer("relative_index", difference[0] * (2 * board_size - 1) + difference[1])
        self.value_conv = nn.Conv2d(channels, 32, 1)
        self.value_hidden = nn.Linear(32 * self.area, 256)
        self.wdl = nn.Linear(256, 3)  # loss, draw, win, always current player
        self.score = nn.Linear(256, 2 * self.area - 1)  # component difference -(area-1)..area-1
        nn.init.kaiming_normal_(self.stem.weight, nonlinearity="relu")
        nn.init.zeros_(self.stem.bias)
        # Small randomized outputs without initial WDL or geometric preferences.
        for head in (self.policy[-1], self.wdl, self.score):
            nn.init.normal_(head.weight, std=0.01)
            nn.init.zeros_(head.bias)

    def forward(self, features):
        x = F.relu(self.blocks(self.stem(features)) + self.final_bias)
        p = self.policy(x).flatten(2)
        first, second = p[:, 0, :, None], p[:, 1, None, :]
        q = p[:, 2:2 + self.pair_rank].transpose(1, 2)
        k = p[:, 2 + self.pair_rank:]
        joint = first + second + torch.bmm(q, k) / math.sqrt(self.pair_rank)
        joint = joint + self.relative_bias[self.relative_index]
        v = F.relu(self.value_conv(x)).flatten(1)
        v = F.relu(self.value_hidden(v))
        return joint.flatten(1), self.wdl(v), self.score(v)


def legal_mask(features):
    empty = features[:, 2].flatten(1).bool()
    legal = empty[:, :, None] & empty[:, None, :]
    diagonal = torch.eye(empty.shape[1], device=empty.device, dtype=torch.bool)
    return (legal & ~diagonal).flatten(1)


def losses(outputs, features, actions, probabilities, outcomes, scores, score_weight=0.25):
    policy, wdl, score = outputs
    masked = policy.float().masked_fill(~legal_mask(features), -1e9)
    logpolicy = F.log_softmax(masked, dim=1)
    # Padded sparse entries have zero mass; action index zero is safe padding.
    policy_loss = -(logpolicy.gather(1, actions.long()) * probabilities.float()).sum(1).mean()
    wdl_loss = F.cross_entropy(wdl.float(), outcomes.long() + 1)
    score_loss = F.cross_entropy(score.float(), scores.long() + features.shape[-1]**2 - 1)
    total = policy_loss + wdl_loss + score_weight * score_loss
    return total, dict(policy=policy_loss.detach(), wdl=wdl_loss.detach(), score=score_loss.detach())
