# Worktree Local DB with Nix and Traefik

このリポジトリには、AI エージェントが worktree を作成した直後に、その worktree 専用 PostgreSQL を安全に起動し、`<worktree名>-db.localhost:5432` へ固定接続できる仕組みを追加しています。

## 目的

- clone 共通で Traefik を 1 つだけ起動する
- 各 worktree ごとに独立した PostgreSQL を起動する
- クライアントは常に `sslmode=require` で `<worktree名>-db.localhost:5432` へ接続する
- `/etc/hosts` や `/etc/resolver` は変更しない
- main checkout を起動しなくても、最初の worktree setup だけで利用開始できる

## 追加されたファイル

- `flake.nix`
- `nix-worktree/traefik/static.toml.tmpl`
- `nix-worktree/lib/common.sh`
- `nix-worktree/scripts/render-route.sh`
- `nix-worktree/scripts/ensure-traefik.sh`
- `nix-worktree/scripts/ensure-postgres.sh`
- `nix-worktree/scripts/ai-worktree-setup.sh`
- `.gitignore`

## 配置方針

- clone 共通 state: `$(git rev-parse --git-common-dir)/nix-worktree/`
- worktree ローカル state: `<worktree>/.local/`
- 接続情報出力:
  - `<worktree>/.local/db.env`
  - `<worktree>/.local/db-connection.txt`

`git common dir` を使うため、linked worktree から実行しても clone 共通の Traefik と route 群へ到達できます。main checkout 側で事前に何かを起動する必要はありません。

## 使い方

### 1. Nix shell に入る

```bash
nix --extra-experimental-features 'nix-command flakes' develop .#worktree-db
```

### 2. AI エージェントの worktree 作成 hook から setup script を呼ぶ

作成直後の worktree で、次を実行してください。

```bash
./nix-worktree/scripts/ai-worktree-setup.sh
```

worktree のパスを外から渡したい場合は、引数で指定できます。

```bash
./nix-worktree/scripts/ai-worktree-setup.sh /absolute/path/to/worktree
```

この setup script は次を idempotent に実行します。

1. clone 共通 Traefik の設定生成と起動保証
2. worktree 名の安全なホスト名への正規化
3. worktree 専用 PostgreSQL の初期化
4. backend port の確保
5. PostgreSQL の TLS 証明書生成
6. PostgreSQL の起動
7. Traefik route の追加または更新
8. `.local/db.env` と `.local/db-connection.txt` の出力
9. `WORKTREE_DB_MIGRATION_CMD` が設定されていれば migration の実行

## 接続方法

setup 完了後、各 worktree には次の 2 ファイルが出力されます。

### `.local/db.env`

環境変数をまとめたものです。次のように読み込めます。

```bash
set -a
. ./.local/db.env
set +a
```

主な値:

- `PGHOST=<worktree名>-db.localhost`
- `PGPORT=5432`
- `PGHOSTADDR=127.0.0.1`
- `PGSSLMODE=require`
- `DATABASE_URL=postgresql://app:...@<worktree名>-db.localhost:5432/app?sslmode=require`

### `.local/db-connection.txt`

人間向けの接続文字列と利用例です。backend の実ポート番号はここに出しません。

## clone 直後から最初の worktree task が成功する理由

- 初期化起点は Git hook ではなく `ai-worktree-setup.sh` です
- その script 自体が `git common dir` を見つけ、clone 共通 state を自前で用意します
- main checkout 側の常駐プロセスや共通 DB を前提にしていません
- Traefik は setup script の中で必要時だけ起動保証されます
- PostgreSQL も worktree ごとにその場で初期化されるため、先行起動が不要です

## `worktree-db.localhost:5432` が成立する理由

- `.localhost` は loopback 用の名前空間として解決されます
- Traefik は clone 共通で `127.0.0.1:5432` を listen します
- PostgreSQL クライアントは TLS を開始し、SNI に `<worktree名>-db.localhost` を載せます
- Traefik は `HostSNI(...)` でその host 名を見て、対応する worktree backend へ転送します
- backend 実ポートは worktree ごとに内部で管理され、クライアントからは常に隠蔽されます

## 排他と再実行性

- clone 共通 lock: `$(git rev-parse --git-common-dir)/nix-worktree/locks/common.lock`
- worktree lock: `<worktree>/.local/locks/postgres.lock`
- route 生成、worktree 名予約、backend port 割当、Traefik 起動には clone 共通 lock を使います
- PostgreSQL 初期化と起動には worktree lock を使います
- 何度再実行しても、既存 cluster・証明書・接続情報・route を上書き更新するだけで壊しません

## migration を入れたい場合

必要であれば setup 実行前に `WORKTREE_DB_MIGRATION_CMD` を設定してください。

```bash
export WORKTREE_DB_MIGRATION_CMD="pnpm prisma migrate deploy"
./nix-worktree/scripts/ai-worktree-setup.sh
```

command は worktree 直下で実行されます。

## clone 直後からの動作確認手順

1. clone する

```bash
git clone <repo-url> repo
cd repo
```

2. main checkout を起動せずに worktree を作る

```bash
git worktree add ../repo-feature feature
cd ../repo-feature
```

3. Nix shell に入る

```bash
nix --extra-experimental-features 'nix-command flakes' develop .#worktree-db
```

4. setup を実行する

```bash
./nix-worktree/scripts/ai-worktree-setup.sh
```

5. 接続情報を確認する

```bash
cat .local/db.env
cat .local/db-connection.txt
```

6. 実接続する

```bash
set -a
. ./.local/db.env
set +a
psql "$DATABASE_URL" -c 'select current_database(), inet_server_addr(), inet_server_port();'
```

7. 別 worktree を並列で作っても両方使えることを確認する

```bash
git worktree add ../repo-bugfix bugfix
cd ../repo-bugfix
nix --extra-experimental-features 'nix-command flakes' develop .#worktree-db
./nix-worktree/scripts/ai-worktree-setup.sh
```

その後、両 worktree でそれぞれ `.local/db.env` を読み込み、同時に `psql "$DATABASE_URL"` が成功すれば要件どおりです。

## 残る制約と注意点

- `sslmode=require` は暗号化のみを保証し、証明書名の検証はしません。`verify-full` に上げる場合は host ごとの証明書運用を追加してください。
- `HostSNI` routing は PostgreSQL の TLS 開始と SNI を前提にしています。平文接続は対象外です。
- clone 共通の `127.0.0.1:5432` が他プロセスに使われている場合、Traefik は起動できません。
- route の自動削除は実装していません。worktree 削除後に不要 route が残っても、setup の再実行は阻害しません。
