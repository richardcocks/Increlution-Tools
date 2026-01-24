#!/bin/bash
set -e

# Switch active environment for Red/Green deployment
# Usage: ./switch.sh [red|green]
#   No argument: switch to the inactive environment
#   red/green:   switch to specific environment

STATE_FILE="/var/lib/increlution-editor/active-environment"
CADDY_CONFIG="/etc/caddy/Caddyfile"

get_active() {
    cat "$STATE_FILE" 2>/dev/null || echo "red"
}

get_inactive() {
    if [ "$(get_active)" = "red" ]; then
        echo "green"
    else
        echo "red"
    fi
}

CURRENT=$(get_active)
TARGET="${1:-$(get_inactive)}"

if [ "$TARGET" != "red" ] && [ "$TARGET" != "green" ]; then
    echo "Error: Target must be 'red' or 'green'"
    exit 1
fi

if [ "$TARGET" = "$CURRENT" ]; then
    echo "Already on $TARGET environment. Nothing to switch."
    exit 0
fi

# Get ports
if [ "$TARGET" = "red" ]; then
    NEW_PORT=5000
    OLD_PORT=5002
else
    NEW_PORT=5002
    OLD_PORT=5000
fi

echo "=== Switching from $CURRENT to $TARGET ==="
echo ""

# Health check the target before switching
echo "Verifying $TARGET environment is healthy..."
if ! curl -sf "http://localhost:$NEW_PORT/api/actions" > /dev/null; then
    echo "Error: $TARGET environment is not responding on port $NEW_PORT"
    echo "Aborting switch. Deploy to $TARGET first: ./deploy.sh $TARGET"
    exit 1
fi
echo "Health check passed!"

# Update Caddy configuration
echo "Updating Caddy configuration..."
sudo sed -i "s/localhost:$OLD_PORT/localhost:$NEW_PORT/g" "$CADDY_CONFIG"

# Reload Caddy
echo "Reloading Caddy..."
sudo systemctl reload caddy

# Update state file
echo "$TARGET" | sudo tee "$STATE_FILE" > /dev/null

echo ""
echo "=== Switch Complete ==="
echo "Active environment: $TARGET (port $NEW_PORT)"
echo "Standby environment: $CURRENT (port $OLD_PORT)"
echo ""
echo "To rollback, run: ./switch.sh $CURRENT"
