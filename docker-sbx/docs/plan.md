# Docker Sandboxes 実験用プロジェクト

## 設計

React + TypeScript + Vite + pnpm + Tailwind CSSの画面からメモを登録し、GoのHTTP API経由でMySQL 8.4に保存します。認証は実装せず、ローカル実験用とします。

Composeでfrontend、api、dbを起動します。Viteの`/api`プロキシを使用し、ブラウザーからのアクセスは5173番ポートに集約します。APIとDBのポートはホストに公開しません。DBは名前付きボリュームで永続化します。

APIは`GET /api/health`、`GET /api/notes`、`POST /api/notes`を提供します。登録本文は1〜500文字、空白のみ・不正JSON・余分なJSON・未定義フィールドを拒否します。DBエラーの詳細はサーバーログだけに出します。

## 実装・検証手順

- [x] Go API: 入力検証・登録・一覧・DB障害のHTTPテストを作成し、未実装による失敗を確認後に実装しました。
- [x] React: 登録フォーム、読み込み中表示、通信エラー表示、一覧を実装しました。型チェックと本番ビルドが通りました。
- [x] Docker: 開発用Dockerfile、Compose、DBの初期化SQLを作成しました。全サービスのヘルスチェックが通りました。
- [x] 実機検証: Composeで起動し、API経由の登録・一覧、DB再起動後の保持を確認しました。
- [x] Sandbox手順: sbx v0.43.0を導入し、Codexの認証、ポート公開、停止・再開の手順をREADMEに記載しました。
- [x] Sandbox実機検証: notes-codex内での起動・テスト・ビルドと、ホストへのポート転送を確認しました。
- [x] Codexのモデル接続: OAuth登録後に作成したnotes-codex-oauthで、固定メッセージへのモデル応答を確認しました。プロジェクトファイルを読ませる検証は行っていません。

## ファイルの役割

- `api/main.go`: DB接続、HTTPサーバー、終了処理。
- `api/handler.go`, `api/handler_test.go`: HTTPハンドラー、入力検証、そのテスト。
- `api/store.go`: MySQLへの登録・一覧取得。
- `frontend/src/App.tsx`, `frontend/src/index.css`: メモ画面とスタイル。
- `compose.yaml`, `api/Dockerfile`, `frontend/Dockerfile`: 開発サービスの起動。
- `db/init.sql`: 初回起動時のテーブル作成。
- `README.md`: 実験の開始・検証・終了手順。
