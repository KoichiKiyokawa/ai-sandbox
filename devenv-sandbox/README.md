# EchoDeck

TanStack Start、pnpm、PostgreSQL、Drizzle、Tailwind CSS、TypeScript 6 で作る Twitter ライクなサンプルアプリです。

## 起動

```sh
pnpm install
pnpm db:push
pnpm dev
```

devenv を使う場合は次の流れです。

```sh
devenv up
```

`devenv up` は devenv の process/task 依存関係で Postgres の起動を待ち、`pnpm db:push` を実行してから Web サーバーを起動します。

`DATABASE_URL` は devenv が自動割り当てした Postgres ポートを使って設定します。

## 機能

- タイムライン表示
- メールアドレスとパスワードでログイン
- 280 文字投稿
- いいね
- リポスト
- トレンド欄
- おすすめユーザー欄

タイムラインはログインなしで閲覧できます。投稿、いいね、リポストなどの操作時にログインしていない場合はログインモーダルを表示します。

## DB

スキーマは [src/db/schema.ts](/Users/koichi/workspace/ai-sandbox/devenv-sandbox/src/db/schema.ts) にあります。マイグレーションは `pnpm db:generate` で生成し、`pnpm db:push` でローカル DB に反映します。
