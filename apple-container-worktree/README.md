# apple/container × git worktree デモ

`apple/container` の DNS 機能と `git worktree` を組み合わせて、
ブランチごとに独立した **postgres / redis / api(Go)** 環境を立ち上げる最小構成です。

## できること

- 各サービスが DNS 名で相互接続できる
  - main worktree: `db.local` / `redis.local` / `api.local`
  - linked worktree `feat-x`: `feat-x.db.local` / `feat-x.redis.local` / `feat-x.api.local`
- worktree ごとに独立した名前付きボリューム（データは混ざらない）
- 複数 worktree を同時に立ち上げても名前/ポートが衝突しない
- API はホスト側にも `127.0.0.1:<port>` で公開（main=8080、linked=18xxx）

## 必要なもの

- macOS 26 + Apple silicon
- `container` (apple/container) インストール済み・`container system start` 済み
- ビルド・デバッグツール。Nix 推奨（`nix develop` で `go` / `dig` / `jq` が揃う）
  - Nix なしでも可: `go`, `jq`, `dig`(dnsutils) を各自インストール

## クイックスタート

```bash
# 0. Nix があるなら開発ツールを揃える（go / dig / jq が入る）
nix develop

# 1. .env にドメインを設定（.test なら sudo 不要・プロビジョン済み）
cp .env.example .env
# デフォルトで AC_DOMAIN=test

# 2. 起動（冪等）
./scripts/up.sh

# 3. 状態確認
./scripts/status.sh

# 4. API を叩く（main worktree の場合）
curl http://127.0.0.1:8080/ | jq

# 5. 片付け
./scripts/down.sh
```

## DNS セットアップ（`db.local` 形式にしたい場合）

`apple/container` はコンテナ名を DNS ホスト名として解決しますが、
ドット区切りの名前（`db.local` など）を名前解決させるには、
対応する DNS ドメインを 1 度だけプロビジョンする必要があります。

```bash
./scripts/setup-dns.sh          # = sudo container system dns create local
```

> [!IMPORTANT]
> macOS では `.local` は mDNS(Bonjour) 用に予約されています。
> apple container は `/etc/resolver/local` を登録して `*.local` を
> コンテナ用 DNS に向けるため、基本的にはコンテナ名が優先されますが、
> まれに mDNS と衝突する場合は `.test` ドメインを使ってください。
>
> ```bash
> AC_DOMAIN=test ./scripts/up.sh
> ```
>
> プロジェクト全体は `AC_DOMAIN` でドメイン非依存になっています。

## worktree 運用

```bash
# main 側で一度だけ初期コミットしておく（worktree は git リポジトリが必要）
git add -A && git commit -m "initial"

# 別ブランチ用の worktree を作る
git worktree add ../apple-container-worktree-feat feat-x

# worktree 側で up するだけで、feat-x.db.local / feat-x.redis.local / feat-x.api.local が立つ
cd ../apple-container-worktree-feat
./scripts/up.sh
```

main 側と feat 側は **別々のコンテナ・別々のボリューム・別々のポート** で同時実行できます。
両方立ち上げた様子:

```text
$ container ls
ID                   IMAGE                     STATE    IP
db.local             postgres:17               running  192.168.64.2
redis.local          redis:7-alpine            running  192.168.64.3
api.local            ac-worktree-api:local     running  192.168.64.4
feat-x.db.local      postgres:17               running  192.168.64.5
feat-x.redis.local   redis:7-alpine            running  192.168.64.6
feat-x.api.local     ac-worktree-api:local     running  192.168.64.7
```

## 仕組み

| 要素            | main worktree | linked worktree `feat-x`            |
| --------------- | ------------- | ----------------------------------- |
| postgres DNS 名 | `db.local`    | `feat-x.db.local`                   |
| redis DNS 名    | `redis.local` | `feat-x.redis.local`                |
| api DNS 名      | `api.local`   | `feat-x.api.local`                  |
| データボリューム| `main-pg-data`| `featx-pg-data`                     |
| ホスト側 API URL| `:8080`       | `:18xxx`（worktree 名のハッシュ）   |

### worktree 名の検出

`scripts/lib.sh` の `wt_name()` は `git rev-parse --absolute-git-dir` の結果から
`.git/worktrees/<name>` を抜き出して worktree 名とします。
main worktree の場合は `main` になります。

### DNS 名の組み立て

```bash
c_name db     # => "db.local"        (main)
c_name db     # => "feat-x.db.local" (linked worktree feat-x)
```

`apple/container` では、ドットを含むコンテナ名はそのまま FQDN 扱いになり、
`/etc/resolver/<domain>` 経由でコンテナ用 DNS（`127.0.0.1:2053`）に名前解決されます。

### API イメージ

`api/Dockerfile` は distroless static + nonroot の 2 段ビルドです。
stdlib しか使わないため `go.sum` / モジュール取得なしでビルドできます。
シェル・パッケージマネージャなしで UID 65532 で動きます。

### distroless コンテナの中でデバッグする（sh なし）

API コンテナは distroless なので `sh` がありません。DNS などを調べたいときは、
Nix でビルドした **Linux arm64 static busybox** をボリュームマウントして
`--entrypoint` で直接実行します（sh もデバッグ用コンテナも不要）。

```bash
BB=$(nix path-info .#busybox-static)/bin/busybox
container run --rm --network default -v "$BB:/busybox:ro" \
  --entrypoint /busybox alpine:latest nslookup db.test 192.168.64.1
```

ホストから apple container の DNS に直接 `dig` したい場合は `nix develop` で入る
`dig` を使います:

```bash
dig @127.0.0.1 -p 2053 db.test A +short   # apple container DNS 直叩き
dig db.test A +short                       # /etc/resolver/test 経由
```

## スクリプト

| スクリプト             | 説明                                                       |
| ---------------------- | ---------------------------------------------------------- |
| `scripts/setup-dns.sh` | DNS ドメインをプロビジョン（`AC_DOMAIN=local` 時に必要）  |
| `scripts/up.sh`        | 現在の worktree 用に db/redis/api を起動（冪等）           |
| `scripts/down.sh`      | 現在の worktree のコンテナとボリュームを停止・削除         |
| `scripts/status.sh`    | 現在の worktree の状態と API レスポンスを表示              |
| `scripts/lib.sh`       | 共通ヘルパ（直接実行しない）                               |

## 設定（`.env`）

`.env.example` を `.env` にコピーして上書きできます。

```bash
AC_DOMAIN=test                          # local / test など
AC_POSTGRES_IMAGE=docker.io/library/postgres:17
AC_REDIS_IMAGE=docker.io/library/redis:7-alpine
AC_API_PORT=9000                        # 公開ポートを固定したい場合
```
