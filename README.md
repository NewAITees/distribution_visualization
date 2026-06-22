# Distribution Visualization

3D 物理演算を使って、確率分布の生成過程そのものを見せるウェブアプリのためのプロジェクト。

このプロジェクトの狙いは、分布の形をグラフとして描くだけでなく、
「玉がどう落ちるか」「どこで分岐するか」「どう集積するか」を空間的に見せること。

## コンセプト

- 3D を基本にする
- 物理演算で粒子の運動を表現する
- 分布ごとに専用の舞台を用意する
- 結果をヒストグラムと理論曲線で確認する

## 主要な見せ方

- 正規分布: Galton board / パチンコ玉
- 二項分布: 左右に分岐する多段ピンボード
- 超幾何分布: 戻さない抽選箱
- ポアソン分布: 3D 空間への着弾点マップ
- 指数分布: 次のイベントまでの待ち時間を落下距離へ変換
- ガンマ分布: 複数回の待ち時間を積み上げる多段ゲート
- ベータ分布: MVP では外す
- 対数正規分布: 乗法的な増減を伴うバウンス

## MVP の優先候補

1. 正規分布
2. 二項分布
3. 超幾何分布
4. ポアソン分布
5. 指数分布
6. ガンマ分布
7. 対数正規分布
8. 一様分布
9. 離散一様分布

## 進め方

1. Galton board を 3D 物理シーンで実装する
2. 二項分布を Galton と統合して `p` の違いで見せる
3. 超幾何分布で復元あり / なしの差を見せる
4. ポアソン分布は着弾点マップとして作る
5. 連続分布を「物理現象の見た目」に変換する
6. 見た目の工夫として、歪み・層構造・外力を足す

## 参考

- [Galton board](https://en.wikipedia.org/wiki/Galton_board)
- [SciPy stats overview](https://docs.scipy.org/doc/scipy/reference/stats.html)
- [scipy.stats.norm](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.norm.html)
- [scipy.stats.binom](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.binom.html)
- [scipy.stats.hypergeom](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.hypergeom.html)
- [scipy.stats.poisson](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.poisson.html)
- [scipy.stats.expon](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.expon.html)
- [scipy.stats.gamma](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.gamma.html)
- [scipy.stats.beta](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.beta.html)
- [scipy.stats.lognorm](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.lognorm.html)
- [scipy.stats.uniform](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.uniform.html)
- [scipy.stats.randint](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.randint.html)

## Prototype

ルートの [`index.html`](/C:/analysis2/distribution_visualization/index.html) を開くと、3D 風の分布可視化プロトタイプを確認できる。
分布切替、パラメータスライダー、再生成、理論曲線の重ね描き、planck.js による Galton board の実衝突を含む。
