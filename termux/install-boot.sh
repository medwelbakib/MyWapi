#!/data/data/com.termux/files/usr/bin/sh
# Installs the Termux:Boot hook so MyWapi starts after phone reboot.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/mywapi.sh" <<EOF
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sh "$DIR/termux/start.sh" &
EOF
chmod +x "$HOME/.termux/boot/mywapi.sh" "$DIR/termux/start.sh"
echo "Boot hook installed at ~/.termux/boot/mywapi.sh"
