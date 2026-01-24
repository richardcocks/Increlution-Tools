#!/bin/bash
set -e

# Red/Green Deployment Script
# Usage: ./deploy.sh [red|green|inactive]
#   red/green: Deploy to specific environment
#   inactive:  Deploy to whichever environment is NOT currently active (default)

STATE_FILE="/var/lib/increlution-editor/active-environment"
PUBLISH_DIR="${PUBLISH_DIR:-./publish}"

# Determine target environment
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

TARGET="${1:-inactive}"
if [ "$TARGET" = "inactive" ]; then
    TARGET=$(get_inactive)
fi

if [ "$TARGET" != "red" ] && [ "$TARGET" != "green" ]; then
    echo "Error: Target must be 'red', 'green', or 'inactive'"
    exit 1
fi

APP_DIR="/opt/increlution-editor-$TARGET"
SERVICE="increlution-editor-$TARGET"
ACTIVE=$(get_active)

echo "=== Deploying to $TARGET environment ==="
echo "Currently active: $ACTIVE"
echo "Deploying to: $TARGET"
echo ""

# Check if publish directory exists
if [ ! -d "$PUBLISH_DIR" ]; then
    echo "Error: Publish directory not found: $PUBLISH_DIR"
    echo "Build first with: dotnet publish -c Release -o ./publish"
    exit 1
fi

# Stop the target service if running
echo "Stopping $SERVICE service..."
sudo systemctl stop "$SERVICE" 2>/dev/null || true

# Clear and copy new files
echo "Deploying files to $APP_DIR..."
sudo rm -rf "$APP_DIR"/*
sudo cp -r "$PUBLISH_DIR"/* "$APP_DIR/"
sudo chown -R www-data:www-data "$APP_DIR"
sudo chmod +x "$APP_DIR/IncrelutionAutomationEditor.Api"

# Start the service
echo "Starting $SERVICE service..."
sudo systemctl start "$SERVICE"

# Wait for startup
echo "Waiting for service to start..."
sleep 3

# Health check
echo "Performing health check..."
if [ "$TARGET" = "red" ]; then
    PORT=5000
else
    PORT=5002
fi

if curl -sf "http://localhost:$PORT/api/actions" > /dev/null; then
    echo "Health check passed!"
else
    echo "Warning: Health check failed. Service may still be starting."
    echo "Check logs: sudo journalctl -u $SERVICE -f"
fi

echo ""
echo "=== Deployment Complete ==="
echo "Deployed to: $TARGET (port $PORT)"
echo "Active environment: $ACTIVE"
echo ""

if [ "$TARGET" != "$ACTIVE" ]; then
    echo "To switch traffic to $TARGET, run: ./switch.sh"
else
    echo "Deployed to active environment - traffic already flowing here."
fi
