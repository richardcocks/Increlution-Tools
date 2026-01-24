#!/bin/bash
set -e

# Loadout Manager for Increlution - Staging Deployment Script
# Run this script on your Linux server

APP_NAME="increlution-editor-staging"
APP_DIR="/opt/$APP_NAME"
DATA_DIR="/var/lib/$APP_NAME"
SERVICE_USER="www-data"

echo "=== Deploying Loadout Manager for Increlution (STAGING) ==="

# Create directories
echo "Creating directories..."
sudo mkdir -p "$APP_DIR"
sudo mkdir -p "$DATA_DIR"

# Copy application files (assumes you've uploaded the publish folder contents)
echo "Copying application files..."
# Uncomment and run after uploading:
# sudo cp -r ./publish/* "$APP_DIR/"

# Set permissions
echo "Setting permissions..."
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
sudo chmod +x "$APP_DIR/IncrelutionAutomationEditor.Api"

# Create systemd service
echo "Creating systemd service..."
sudo tee /etc/systemd/system/$APP_NAME.service > /dev/null << 'EOF'
[Unit]
Description=Loadout Manager for Increlution (Staging)
After=network.target

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/opt/increlution-editor-staging
ExecStart=/opt/increlution-editor-staging/IncrelutionAutomationEditor.Api
Restart=always
RestartSec=10

# Environment - STAGING
Environment=ASPNETCORE_ENVIRONMENT=Staging
Environment=ASPNETCORE_URLS=http://localhost:5001
Environment=Discord__ClientSecret=YOUR_DISCORD_CLIENT_SECRET_HERE

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/increlution-editor-staging

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "=== IMPORTANT: Manual Steps Required ==="
echo ""
echo "1. Upload the contents of the 'publish' folder to $APP_DIR"
echo ""
echo "2. Set the Discord client secret in the service file:"
echo "   sudo systemctl edit $APP_NAME"
echo "   Add:"
echo "   [Service]"
echo "   Environment=Discord__ClientSecret=your_actual_secret"
echo ""
echo "3. Update Discord Developer Portal:"
echo "   - Add redirect URI: https://staging.automations.eterm.uk/api/auth/discord/callback"
echo ""
echo "4. Enable and start the service:"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable $APP_NAME"
echo "   sudo systemctl start $APP_NAME"
echo ""
echo "5. Add staging block to Caddy config (see Caddyfile.staging in deploy folder):"
echo "   sudo nano /etc/caddy/Caddyfile"
echo "   sudo systemctl reload caddy"
echo ""
echo "6. Check service status:"
echo "   sudo systemctl status $APP_NAME"
echo "   sudo journalctl -u $APP_NAME -f"
echo ""
echo "=== Staging URLs ==="
echo "Frontend: https://staging.automations.eterm.uk"
echo "API: https://staging.automations.eterm.uk/api"
