# このプロジェクトでの作業

- 敬語を使用してください。曖昧な省略や造語を避けてください。
- Go API、MySQL、React + TypeScript + Vite + pnpm + Tailwind CSSの実験用プロジェクトです。
- 最初にREADME.mdを確認してください。
- Sandbox内では`make sandbox-up`で起動してください。通常のDocker環境では`make up`を使用します。
- APIとDBはComposeの内部ネットワークで接続します。APIにアクセスする場合は`http://localhost:5173/api/health`など、フロントエンドのプロキシを経由してください。
- npmやyarnのロックファイルを追加せず、pnpm-lock.yamlを更新してください。
- APIや画面の変更後は`make check`を実行し、登録と一覧の動作も確認してください。
- MySQLのデータは名前付きボリュームにあります。データ削除を指示されていない場合、`docker compose down -v`を実行しないでください。
- 認証情報やホストの`~/.codex`をリポジトリにコピーしないでください。
- Codexからホスト側の他プロジェクトへアクセスする必要はありません。
