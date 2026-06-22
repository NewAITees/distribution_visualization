# Galton Board 物理パラメータメモ

このメモは、`doc1.md` と `doc2.md` を踏まえて、現在の Galton board 実装に入れるための**開始値**を整理したもの。

目的は「最終値の確定」ではなく、**分布が正規形に寄るかを確認するための出発点**を固定すること。

## 文献から読める前提

- 14 rows / 15 bins は妥当
- 分布は `peg distance to bead size ratio` の影響を強く受ける
- ピン形状よりも、まずは「各段で自然に衝突するか」が重要
- うまくいかないときは、ボール径を変えて比率を調整する

## 今回の開始値

以下を初期値として使う。

```js
pegGapX = binWidth
pegGapY = pegGapX * 0.85

PEG_R_PX   = pegGapX * 0.09
BALL_R_PHY = pegGapX * 0.41

railGap = PEG_R_PX + BALL_R_PHY + pegGapX * 0.05
railTopY = board.topY - pegGapY * 0.85
railBotY = pegBottomY
```

## 数値の意味

- `pegGapX`: 水平のピン間隔
- `pegGapY`: 縦方向の段間隔
- `PEG_R_PX`: ピン半径
- `BALL_R_PHY`: ボール半径
- `railGap`: ガードレールの外側オフセット

## 期待する関係

- ボールは今より明確にピンへ当たる
- 1球あたりの段ヒット数が増える
- 中央に寄る分布が出やすくなる
- ガードレールは外側ピンを逃がしつつ、広げすぎない

## まず確認するログ

- `pegHits.items`
- 各ペグの `hitCount`
- 中央 bin の増え方
- `sd` が理論値に近づくか

## 注意

この値は最適化の確定値ではない。
まずはこの比率で走らせ、段ごとの接触が不足するなら `BALL_R_PHY` を、外側へ逃げすぎるなら `railGap` を調整する。
