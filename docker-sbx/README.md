# Docker Sandboxes + Go / MySQL / React

メモを登録・一覧表示・検索・編集・削除する実験用プロジェクトです。Go API、MySQL 8.4、React + TypeScript + Vite + pnpm + Tailwind CSSを使用します。

3つのCodexを並列実行して追加した機能と、PMが解消した競合の詳細は[並列開発実験](docs/parallel-experiment.md)に記録しています。

担当別3画面と統合版を同時に比較する場合は、ホストで`bash scripts/preview-parallel.sh`を実行し、そのプロセスを残してください。sbxが最後の接続終了後にVMを自動停止するため、比較中の接続を維持します。

ポート番号の代わりにタスク名で開く方法は[タスク名ホストの設定](docs/task-hosts.md)を参照してください。`notes.localhost`、`edit.localhost`、`delete.localhost`、`search.localhost`を各Sandboxへ転送できます。

```text
ホストのブラウザー
  → localhost:5173
  → sbxのポート転送
  → Sandbox内のfrontend:5173（Vite）
  → /apiのプロキシ → api:8080（Go）→ db:3306（MySQL）
```

APIとDBのポートはホストに公開しません。メモはMySQLの名前付きボリュームに保存します。認証を省略したローカル実験用で、DBの固定パスワードも開発用です。

## 1. sbxを準備する（ホスト）

現在のDocker SandboxesのCLIは`sbx`です。旧`docker sandbox`とはコマンドや認証が異なります。`docker sbx`というサブコマンドは使用しません。

macOSではApple siliconとmacOS 14以降が必要です。`sbx`自体にDocker Desktopは不要です。[Docker公式の導入手順](https://docs.docker.com/ai/sandboxes/install/)

```sh
brew trust docker/tap
brew install docker/tap/sbx
sbx version
sbx login
```

`sbx login`でブラウザーが開いたら、Dockerへのログインを完了してください。初回のネットワーク設定は、開発用サイトを許可する`Balanced`から開始できます。非対話のコマンドで`global network policy has not been initialized`が表示された場合は、次を実行します。この設定は今後作成するSandboxにも適用されます。この作業環境では承認をいただいて適用済みです。

```sh
sbx policy init balanced
```

この作業環境ではHomebrewがsbxのCask定義を読み込めなかったため、公式v0.43.0のDMGを取得し、SHA-256を照合して手動導入しました。実体は`~/.local/share/docker-sbx/0.43.0/`、実行用リンクは`~/.local/bin/sbx`です。PATHに含まれない場合は`~/.local/bin/sbx`を直接使用してください。

## 2. Codexと連携する（ホスト）

DockerへのログインとOpenAIへの認証は別です。CodexはChatGPTアカウントまたはAPIキーで利用できます。[OpenAI公式の認証説明](https://developers.openai.com/codex/auth/)

ChatGPTアカウントで認証する場合:

```sh
sbx secret set openai --oauth
```

APIキーを使用する場合は、次の対話入力で登録してください。

```sh
sbx secret set openai
```

認証はホスト側で行います。ホストの`~/.codex/auth.json`をSandboxやプロジェクトにコピーする必要はありません。[Docker公式のCodex連携説明](https://docs.docker.com/ai/sandboxes/agents/codex/)

リポジトリのルートから次を実行します。

```sh
cd docker-sbx
sbx run --name notes-codex-oauth --publish 5173:5173 codex .
```

この`docker-sbx/`だけを作業ディレクトリとして共有します。Sandbox内の編集はホスト側の同じファイルに反映されます。ホスト側のユーザー設定は自動では共有されないため、このプロジェクトには作業手順を記載した`AGENTS.md`を含めています。

この環境では、OpenAI認証を登録する前に作成した`notes-codex`にはOAuth用の接続設定が入りませんでした。認証登録後に`notes-codex-oauth`を新規作成し、モデル応答を確認しています。旧`notes-codex`はDBを保持して停止しています。新しいSandboxのDBは別のボリュームです。認証はSandbox作成前に登録してください。

起動したCodexへの指示例:

```text
README.mdとAGENTS.mdを読んでください。
make sandbox-upで起動し、make checkを実行してください。
http://localhost:5173/api/notesでメモの登録と一覧取得を確認してください。
DBの既存データは削除しないでください。
最後に変更ファイルと検証結果を報告してください。
```

DockerのCodexテンプレートは既定でCodexの承認待ちと内部Sandboxを無効化し、Docker SandboxesのVMを隔離境界として使用します。上のコマンドで共有するディレクトリは書き込み可能です。[起動時の既定設定](https://docs.docker.com/ai/sandboxes/agents/codex/)

ホストで動いているCodex AppやCLIの既存セッションが、この操作によってSandboxへ移動するわけではありません。`sbx run`でSandbox内に別のCodex CLIセッションを起動します。変更はホスト側のGitで確認できます。

```sh
# ホスト側で実行
git diff -- .
git status --short
```

## 3. アプリを起動する（Sandbox内）

Codexに実行させるか、ホストの別ターミナルからシェルを開きます。

```sh
# ホスト側。docker-sbx/にいる状態で実行
sbx exec -it -w "$PWD" notes-codex-oauth bash
```

Sandbox内で:

```sh
make sandbox-up
make check
```

ホストのブラウザーで <http://localhost:5173> を開いてください。`make sandbox-up`はComposeの公開先をSandbox内の`0.0.0.0`に設定します。Sandboxのポートをホストに転送するには、この設定が必要です。ホスト側の公開はsbxによってループバックに限定されます。[ポート転送の説明](https://docs.docker.com/ai/sandboxes/workflows/development/)

ソース変更を反映しながら開発する場合:

```sh
# Sandbox内で実行。前面で動作します。
make sandbox-dev
```

ReactのソースはCompose Watchで同期し、Viteが更新します。Goの変更はAPIイメージを再ビルドします。`make sandbox-up`だけではファイル変更を監視しないため、変更後は再実行してください。

## 4. 再接続・状態確認・終了（ホスト）

```sh
sbx ls
sbx run --name notes-codex-oauth
sbx ports notes-codex-oauth

# 既存Sandboxに公開ポートを追加する場合
sbx ports notes-codex-oauth --publish 5173:5173

# docker-sbx/にいる状態で、Sandbox内のサービスを確認
sbx exec -w "$PWD" notes-codex-oauth docker compose ps
sbx exec -w "$PWD" notes-codex-oauth docker compose logs --tail=100

# アプリのコンテナだけを停止・削除。DBボリュームは保持します。
sbx exec -w "$PWD" notes-codex-oauth docker compose down

# Sandboxを停止。再開時はsbx runまたはsbx execを使用します。
sbx stop notes-codex-oauth
```

3サービスには`restart: unless-stopped`を設定しています。Sandboxを再開するとサービスも復帰します。`docker compose down`でアプリを停止・削除した場合は、Sandbox内で`make sandbox-up`を再実行してください。

Sandboxを削除する場合は`sbx rm notes-codex-oauth`です。Sandbox内のMySQLボリュームも削除されます。共有したホスト側ソースは残ります。

## 通常のDocker Composeで試す場合

Docker Desktopなど、ホストのDockerエンジンを起動してください。`sbx`へのログイン前にもアプリだけを検証できます。

```sh
cd docker-sbx
make up
make check
```

<http://localhost:5173> を開きます。変更を監視する場合は`make dev`、停止は`make down`です。

ホスト側ComposeとSandbox側ComposeのDBは別です。両方を同時に起動する場合はホストのポートを分けてください。

```sh
# 通常のComposeを別ポートで起動
FRONTEND_PORT=5174 make up
```

## API

Node.jsがあるホストから、Sandboxへの接続をまとめて確認できます。実行ごとに検証用メモを1件保存します。

```sh
# docker-sbx/で実行
node scripts/smoke.mjs http://localhost:5173
```

| メソッド | パス | 動作 |
| --- | --- | --- |
| GET | `/api/health` | DB疎通確認。正常時200、接続不可時503 |
| GET | `/api/notes?q=検索文字列` | 本文を部分一致で検索し、最新100件をIDの降順で取得。q省略時は全件対象 |
| POST | `/api/notes` | `{"body":"メモ"}`を保存。成功時201 |
| PATCH | `/api/notes/{id}` | 本文を更新。成功時200、存在しないIDは404 |
| DELETE | `/api/notes/{id}` | メモを削除。成功時204で本文なし、存在しないIDは404 |

```sh
curl -fsS http://localhost:5173/api/health
curl -fsS http://localhost:5173/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"body":"はじめての実験メモ"}'
curl -fsS http://localhost:5173/api/notes
```

本文の前後の空白を除き、1〜500文字を受け付けます。不正なJSON・空本文・500文字超過は400です。時刻はUTCで保存し、画面ではブラウザーのタイムゾーンで表示します。

編集時も同じ本文検証を行い、作成日時は保持します。編集・削除のIDが正の整数でなければ400です。検索の`%`と`_`は通常の文字として扱います。画面では編集中や通信中の別操作を止め、編集・削除後も検索条件を維持します。

3機能を組み合わせた結合テストは次で実行できます。テストが作成したメモだけを最後に削除します。

```sh
node scripts/workflow.mjs http://localhost:5173
```

## DBとトラブルシューティング

DBを起動している環境（ホストまたはSandbox）内で実行してください。

```sh
docker compose ps
docker compose logs --tail=100 api db frontend
docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 10"'
```

- `Not authenticated to Docker`: ホストで`sbx login`を完了してください。
- 画面に接続できない: `sbx ports notes-codex-oauth`とSandbox内の`docker compose ps`を確認し、`make sandbox-up`で起動してください。
- Sandbox内のコンテナは、ホストの`docker ps`には表示されません。
- 初回起動はイメージ取得・Goビルド・MySQL初期化に時間がかかります。
- `db/init.sql`はDBの初回作成時のみ実行されます。既存DBへの変更はSQLで適用してください。
- データを含めて初期化する場合のみ、`docker compose down -v`の後で再起動してください。
- 通信制限により依存パッケージを取得できない場合は`sbx policy ls`で確認してください。npmレジストリ、Goのモジュールプロキシ、Docker Hubへの通信が必要です。

## 構成と検証

```text
api/         Go APIとHTTPテスト
db/          MySQL初期化SQL
frontend/    React画面とVite設定
compose.yaml 開発環境
AGENTS.md    Codex用の作業指示
docs/        設計・検証記録
```

実行した検証と未確認項目は[検証記録](docs/verification.md)に記載します。
