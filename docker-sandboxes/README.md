# Go API + MySQL Docker Sandbox Sample

Docker Compose で Go API と MySQL を起動し、複数のジョブを並列実行して状態を観測するためのサンプルです。

## Docker Sandboxes 前提での位置づけ

このサンプルは Docker Sandboxes 上で動かすことを意識した構成です。

- Docker Sandboxes では各 sandbox が軽量 microVM と private Docker daemon を持ちます
- sandbox 内で実行した `docker build` や `docker compose up` は、その sandbox 専用の Docker daemon で動きます
- sandbox は host の Docker daemon や host の `localhost` へ直接アクセスできません
- sandbox 同士も相互通信できません

そのため、検証用の依存サービスを host に置くのではなく、`app` と `mysql` を同じ `docker-compose.yml` に含めています。Docker Sandboxes 上でも、この Compose 一式だけで完結して動作確認できます。

Docker Sandboxes の概要とセットアップは公式ドキュメントを参照してください。

- [Get started with Docker Sandboxes](https://docs.docker.com/ai/sandboxes/get-started/)
- [Docker Sandboxes Architecture](https://docs.docker.com/ai/sandboxes/architecture/)

## 構成

- `app`: Go 製の HTTP API
- `mysql`: タスク状態を保存する MySQL

## 起動

### 通常の Docker 環境で起動

```bash
docker compose up --build
```

API は `http://localhost:8080` で待ち受けます。

### Docker Sandboxes 内で起動

たとえば Codex sandbox を使う場合は、このリポジトリで次を実行します。

```bash
docker sandbox run codex .
```

sandbox の中では、ワークスペースは host と同じ絶対パスで同期されます。そのままこのリポジトリで次を実行します。

```bash
docker compose up --build
```

補足:

- Compose のコンテナは sandbox 内の private Docker daemon に作られます
- host 側の `docker ps` には出ません
- 確認は sandbox 内で `docker compose ps` や `docker compose logs` を使います
- この README の `localhost:8080` は、sandbox 内からアクセスする前提です

## エンドポイント

### ヘルスチェック

```bash
curl http://localhost:8080/healthz
```

### 単一タスク作成

```bash
curl -X POST http://localhost:8080/tasks \
  -H 'Content-Type: application/json' \
  -d '{"name":"single-task","duration_ms":3000}'
```

### 複数タスクを並列実行

```bash
curl -X POST http://localhost:8080/tasks/run-batch \
  -H 'Content-Type: application/json' \
  -d '{"count":5,"min_duration_ms":2000,"max_duration_ms":6000,"concurrency_limit":5}'
```

`concurrency_limit` を `1` にすると直列実行に近い挙動になり、`count` と同じ値にすると一気に並列実行できます。

### タスク一覧

```bash
curl http://localhost:8080/tasks
```

### タスク詳細

```bash
curl http://localhost:8080/tasks/1
```

## 並列実行の検証ポイント

1. `POST /tasks/run-batch` で複数タスクを投入する
2. すぐに `GET /tasks` を叩いて `running` のタスクが複数あることを確認する
3. 完了後に `started_at` と `completed_at` を比較し、複数タスクの実行時間帯が重なっていることを確認する

## MySQL を直接確認する

```bash
docker compose exec mysql mysql -uapp -papp sandbox -e "SELECT id, name, status, duration_ms, worker, started_at, completed_at FROM tasks ORDER BY id DESC;"
```

## 停止

```bash
docker compose down
```

ボリュームも削除する場合:

```bash
docker compose down -v
```
