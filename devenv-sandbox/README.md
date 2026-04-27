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

`devenv up` は Drizzle Studio も起動します。アプリは `https://echodeck.localhost:1355` で開けます。Drizzle Studio は studio process のログに表示される `https://local.drizzle.studio?...` を開きます。Web の実体ポートは portless が自動割り当てします。Drizzle Studio の実体ポートは devenv の自動ポート割り当てで決まり、`local.drizzle.studio` に渡されます。Git worktree では portless と devenv のポート割り当てにより、複数の worktree を同時起動しても URL と実体ポートは衝突しません。

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
