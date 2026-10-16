#!/data/data/com.termux/files/usr/bin/sh
# Runs MyWapi forever; restarts on crash. Used by Termux:Boot.
cd "$(dirname "$0")/.." || exit 1
termux-wake-lock 2>/dev/null

set -a
[ -f .env ] && . ./.env
set +a

mkdir -p logs
while true; do
  node src/index.js >> logs/stdout.log 2>&1
  echo "$(date) exited with $?, restarting in 10s" >> logs/stdout.log
  sleep 10
done
