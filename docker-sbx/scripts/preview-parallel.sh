#!/usr/bin/env bash
set -eu

# sbx v0.43.0は最後の接続が閉じるとVMを自動停止します。
# ブラウザーで比較する間だけ、各Sandboxへの接続を維持します。
command -v sbx >/dev/null || { echo 'sbxがPATHにありません。' >&2; exit 1; }
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for sandbox in notes-codex-oauth notes-edit notes-delete notes-search; do
  sbx exec "$sandbox" sleep infinity &
  pids+=("$!")
done

echo '4つのSandboxへ接続しています。起動完了後に次のURLを開いてください。'
echo '統合: http://localhost:5173'
echo '編集: http://localhost:5175'
echo '削除: http://localhost:5176'
echo '検索: http://localhost:5177'
echo '比較中はこのプロセスを残してください。終了はCtrl+Cです。'
wait
