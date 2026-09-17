# 検証記録

## 確認済み

- ホストのGo 1.26.5で`go test -race ./...`に成功しました。
- Compose内で`make check`に成功しました（Goテスト、go vet、TypeScript型チェック、Vite本番ビルド）。
- `docker compose config --quiet`に成功しました。
- Composeでdb、api、frontendの3サービスがhealthyになりました。
- Viteの`/api`プロキシ経由でヘルスチェック200、メモ登録201、一覧取得200、不正入力400を確認しました。
- MySQLコンテナの再起動後も、登録したメモがAPIから取得できました。
- frontendのHTML配信200とReactエントリーポイントの参照を確認しました。
- sbx v0.43.0を導入し、CLIの起動とREADMEに記載したフラグの存在を確認しました。
- Dockerへのログイン完了後、`notes-codex` Sandboxを作成しました。
- Sandbox内で`make sandbox-up`と`make check`に成功しました。Goテスト、go vet、TypeScript型チェック、Vite本番ビルドが通りました。
- ホストの`127.0.0.1:5173`からSandboxの5173番ポートへの転送を確認しました。`node scripts/smoke.mjs http://localhost:5173`でHTML配信、DB疎通、メモ登録・一覧取得、不正入力の拒否を確認しました。
- Sandbox内で`codex --version`を実行し、Codex CLI 0.149.1の起動を確認しました。
- OpenAI OAuthの登録を確認しました。登録前に作成したnotes-codexでの直接実行は401で失敗し、sbx run経由でも解消しませんでした。
- 認証登録後に作成したnotes-codex-oauthでは接続先providerがsandboxdになり、Codex CLIからモデルへの接続に成功しました。プロジェクト外の/tmpでツールとファイル参照を使わず、「接続確認OKです。」という応答を取得しました。
- notes-codex-oauthでもmake checkとHTTP接続テストに成功しました。Composeの3サービスにrestart: unless-stoppedを設定し、sbx stop後にsbx execで再開すると、Composeの手動起動なしで3サービスが復帰することを確認しました。再開後の接続テストにも成功しています。

- 初回の接続確認時はREADME送信が自動承認レビューに拒否されたため、固定メッセージだけで確認しました。その後ユーザーから並列開発の指示を受け、3つのCodexがソースを読んで編集・削除・検索を実装し、PMが統合して検証しました。詳細は[並列開発実験](parallel-experiment.md)に記載しています。

## 未確認

- Browserツールに接続可能なブラウザーがなく、画面の目視確認とフォーム操作は未実施です。ビルドとHTTP配信の検証は完了しています。

## 環境への変更

- Docker Desktopを起動しました。
- ユーザーの承認を受けて`sbx policy init balanced`を適用しました。今後作成するSandboxにも適用されるグローバルなネットワーク設定です。
- OAuth登録前の`notes-codex`は、DBと検証用メモ1件を保持して停止しました。5173番ポートの公開先は認証登録後の`notes-codex-oauth`に変更しました。アプリの停止は`sbx stop notes-codex-oauth`です。各SandboxのDBは独立しており、旧DBのデータ移行は行っていません。
- 認証の切り分けに作成した一時Sandboxのnotes-auth-checkは削除しました。notes-codex-oauthのDBには接続確認用メモを2件保存しています。
- `sbx`は公式DMGから`~/.local/share/docker-sbx/0.43.0/`に配置し、`~/.local/bin/sbx`をリンクしました。Homebrewで管理されるインストールではありません。
- DockerのHomebrew tapを追加・信頼済みにしました。Caskの読み込みエラーでHomebrewによるsbxのインストールは完了していません。
- Sandbox用の5173番ポートと衝突しないよう、通常のComposeでのプレビューは5174番ポートを使用します。停止は`docker-sbx/`で`make down`を実行してください。
- 検証用メモ1件をホスト側ComposeのMySQLに保存しました。DBボリュームは保持しています。
- 並列実験ではnotes-edit・notes-delete・notes-searchを追加しました。モデル実行終了後にVMが自動停止するため、比較中はscripts/preview-parallel.shで4つの接続を維持しています。停止方法と作業ブランチは[並列開発実験](parallel-experiment.md)を参照してください。
