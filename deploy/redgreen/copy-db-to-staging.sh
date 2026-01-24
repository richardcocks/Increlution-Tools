#!/bin/bash
set -e

# Copy production database to staging for migration testing
# This allows you to test migrations against real production data

PROD_DIR="/var/lib/increlution-editor"
STAGING_DIR="/var/lib/increlution-editor-staging"
STAGING_SERVICE="increlution-editor-staging"

echo "=== Copying Production Database to Staging ==="
echo ""
echo "This will:"
echo "  1. Stop the staging service"
echo "  2. Copy production databases to staging"
echo "  3. Start the staging service (which will run any pending migrations)"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Stop staging
echo "Stopping staging service..."
sudo systemctl stop "$STAGING_SERVICE" 2>/dev/null || true

# Backup existing staging databases
if [ -f "$STAGING_DIR/increlution.db" ]; then
    echo "Backing up existing staging databases..."
    sudo cp "$STAGING_DIR/increlution.db" "$STAGING_DIR/increlution.db.backup.$(date +%Y%m%d_%H%M%S)"
    sudo cp "$STAGING_DIR/identity.db" "$STAGING_DIR/identity.db.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Copy production databases
echo "Copying production databases..."
sudo cp "$PROD_DIR/increlution.db" "$STAGING_DIR/increlution.db"
sudo cp "$PROD_DIR/identity.db" "$STAGING_DIR/identity.db"
sudo chown www-data:www-data "$STAGING_DIR"/*.db

# Start staging (will auto-migrate)
echo "Starting staging service..."
sudo systemctl start "$STAGING_SERVICE"

echo ""
echo "=== Copy Complete ==="
echo "Staging now has a copy of production data."
echo "Any pending migrations will be applied on startup."
echo ""
echo "Test at: https://staging.automations.eterm.uk"
echo "Check logs: sudo journalctl -u $STAGING_SERVICE -f"
