# タスク名でSandboxを開く

ホスト上のGo製HTTPプロキシが、ホスト名に応じてsbxの公開ポートへ転送します。DNSサーバーや`/etc/hosts`の変更、Docker Desktopは不要です。`.localhost`をループバックとして扱うブラウザーを使用してください。OSの名前解決に依存する一部のCLIでは、この名前を解決できない場合があります。

| URL | Sandbox | 転送先 |
| --- | --- | --- |
| http://notes.localhost | notes-codex-oauth（統合版） | 127.0.0.1:5173 |
| http://edit.localhost | notes-edit | 127.0.0.1:5175 |
| http://delete.localhost | notes-delete | 127.0.0.1:5176 |
| http://search.localhost | notes-search | 127.0.0.1:5177 |

## 起動

以下はすべてホストの`docker-sbx/`で実行します。並列実験の4つのSandboxが作成済みであることが前提です。

まず、ターミナルでSandboxへの接続を維持します。

```sh
bash scripts/preview-parallel.sh
```

別のターミナルでプロキシをビルドし、起動します。ビルドにはGoが必要です。miseがある場合はGo 1.26.5を使用します。

```sh
bash scripts/task-hosts.sh --build-only
sudo "$PWD/.local/task-router" -routes "$PWD/dev/task-hosts.json" -listen 127.0.0.1:80
```

このMacでは80番ポートで待ち受けるために管理者権限が必要です。パスワードはターミナルに入力してください。プロキシは前面で動作し、Ctrl+Cで停止します。自動起動サービスやシステム設定は追加しません。

管理者権限なしで試す場合は次を実行し、`http://edit.localhost:8080`のように開きます。

```sh
TASK_ROUTER_LISTEN=127.0.0.1:8080 bash scripts/task-hosts.sh
```

## タスクの追加・変更

`dev/task-hosts.json`のホスト名と転送先を編集し、プロキシを再起動してください。転送先はsbxで公開したホスト側ポートです。名前は小文字英数字とハイフンを使った`タスク名.localhost`形式にします。

プロキシはループバックでのみ待ち受け、転送先もループバックのHTTPに限定しています。未知のホストは404、起動していないSandboxへの転送は502です。HTTPSは提供しません。

HTTP APIとViteのWebSocketを同じ経路で転送します。ソースの自動反映には、各Sandbox内で`make sandbox-dev`を起動してください。Viteは既定で`.localhost`のHostを許可するため、`allowedHosts: true`は不要です。[Vite公式ドキュメント](https://vite.dev/config/server-options.html)

## 確認

```sh
curl --noproxy '*' -fsS http://edit.localhost/api/health
```

名前解決に対応していないcurlでは、`--resolve edit.localhost:80:127.0.0.1`を付けて確認できます。画面に接続できない場合はプロキシ、`preview-parallel.sh`、Sandbox内のサービスの順に起動状態を確認してください。

2026-09-17の検証では、8080番ポート経由で4つの`.localhost`名をcurlから使用し、各`/api/health`が200を返しました。Goの`go test -race ./...`も成功しています。80番ポートでの起動は利用者の管理者認証待ちです。実環境のVite WebSocket接続確認は自動承認レビューに拒否され、未実施です。ブラウザー上の表示・自動更新は未確認です。
