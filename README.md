# codex-browser-bridge

Podman コンテナ内で Codex をフル権限で動かし、ブラウザから利用するための bridge です。`ccpocket` に近い会話一覧 UI と、Codex セッション管理の最小実用セットを持ちます。

## 現在のスコープ

- Bridge 自身がブラウザ viewer を配信する
- ブラウザ viewer から Bridge WebSocket URL を指定して再接続できる
- ブラウザ viewer から project path / model / open mode を指定して Codex セッションを開始できる
- 複数会話の一覧を見られる
- 一覧は最大 10 件ずつ表示し、filter と前へ・次へで辿れる
- Final answer 到達前の会話は一覧にスピナー表示される
- 会話を選ぶと URL に session ID が反映される
- スマートフォン幅では一覧と会話を同時表示せず、戻る操作で一覧へ戻れる
- `~/.codex/sessions` にある Codex app の既存会話も一覧と履歴で読め、prompt を送ると thread を resume できる
- ブラウザから開始した session は Codex の thread ID をそのまま使うため、Codex app 側の会話としても見える
- 会話を pin できる
- 会話に完了フラグを付けられる
- 完了会話は一覧でグレー表示される
- pin / 完了フラグ / project path 候補は server 再起動後も残り、別ブラウザから見ても同じ状態になる
- 選択中セッションの repo / model / mode を表示できる
- 新しいメッセージを上に表示する
- Final answer 到達時に、その turn の途中経過を折りたたみ表示する
- 折りたたみ表示に「ユーザー入力から Final answer までの時間」を出す
- 応答中に送った prompt をキューイングし、処理完了後に順次送る
- Plan mode を開始でき、plan review や AskUserQuestion に viewer から応答できる
- ブラウザ viewer から選択 session に prompt を送信し、必要に応じて割り込みできる
- ブラウザ viewer に commentary、final answer、tool 出力、error を表示できる
- `codex app-server` への WebSocket bridge を提供する
- Codex は `--dangerously-bypass-approvals-and-sandbox` 付きで起動する
- Codex 専用構成とする
- Claude には対応しない
- worktree には対応しない

要件資料は `doc/references/1RD/features/f0001-browser-codex-bridge/` にあります。

## 起動方法

```shell
npm install
npm run build
npm start
```

[http://127.0.0.1:8765/](http://127.0.0.1:8765/) を開いてください。

新実装の viewer は [http://127.0.0.1:8765/viewer-next/](http://127.0.0.1:8765/viewer-next/) です。

完全新規実装の viewer は [http://127.0.0.1:8765/viewer-next2/](http://127.0.0.1:8765/viewer-next2/) です。

requirements-only の clean-room 再実装 viewer は [http://127.0.0.1:8765/viewer-next3/](http://127.0.0.1:8765/viewer-next3/) です。

既定では `::` で待ち受けるため、IPv4/IPv6 の両方からアクセスできます。待受先を固定したい場合は `HOST` または `BRIDGE_HOST` を指定してください。

viewer は既定で same-origin の WebSocket URL を使います。必要ならブラウザ UI から Bridge URL を上書きできます。

## 開発時の watch 再起動

ソース修正のたびに bridge を自動再起動したい場合は、開発用の watch 起動を使います。

```shell
npm install
npm run dev
```

`src/**/*.ts` を保存すると、`tsx watch` が bridge を再起動します。配布用の動作確認や本番相当の起動は従来どおり `npm run build && npm start` を使ってください。

ターミナルを占有せずに bridge をバックグラウンド起動したい場合は、次のシェルを使ってください。

```shell
./scripts/bridge.sh
./scripts/bridge.sh stop
```

`./scripts/bridge.sh` は引数なしなら起動、`stop` を付けると停止します。起動時は `npm run build` の後に bridge をバックグラウンド起動し、既に起動中なら自動で停止してから再起動します。起動ログは `.codex-browser-bridge/run/bridge.log`、PID は `.codex-browser-bridge/run/bridge.pid` に保存されます。

## 動作確認

```shell
npm test
curl http://127.0.0.1:8765/health
```
