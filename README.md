# codex-browser-bridge

Podman コンテナ内で Codex をフル権限で動かし、ブラウザから利用するための bridge です。`ccpocket` に近い会話一覧 UI と、Codex セッション管理の最小実用セットを持ちます。

## 現在のスコープ

- Bridge 自身がブラウザ viewer を配信する
- ブラウザ viewer から Bridge WebSocket URL を指定して再接続できる
- ブラウザ viewer から project path / model / open mode を指定して Codex セッションを開始できる
- 複数会話の一覧を見られる
- 会話を pin できる
- 会話に完了フラグを付けられる
- 完了会話は一覧でグレー表示される
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

viewer は既定で same-origin の WebSocket URL を使います。必要ならブラウザ UI から Bridge URL を上書きできます。

## 動作確認

```shell
npm test
curl http://127.0.0.1:8765/health
```
