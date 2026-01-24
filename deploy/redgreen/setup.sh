#!/bin/bash
set -e

# Red/Green Deployment Setup Script
# Run this ONCE on your server to set up the infrastructure

SERVICE_USER="www-data"
DATA_DIR="/var/lib/increlution-editor"
STATE_FILE="$DATA_DIR/active-environment"

echo "=== Setting up Red/Green Deployment Infrastructure ==="

# Create directories
echo "Creating directories..."
sudo mkdir -p /opt/increlution-editor-red
sudo mkdir -p /opt/increlution-editor-green
sudo mkdir -p "$DATA_DIR"

# Set permissions
sudo chown -R "$SERVICE_USER:$SERVICE_USER" /opt/increlution-editor-red
sudo chown -R "$SERVICE_USER:$SERVICE_USER" /opt/increlution-editor-green
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"

# Initialize state file (default to red as active)
if [ ! -f "$STATE_FILE" ]; then
    echo "red" | sudo tee "$STATE_FILE" > /dev/null
    sudo chown "$SERVICE_USER:$SERVICE_USER" "$STATE_FILE"
fi

# Create RED systemd service
echo "Creating RED systemd service..."
sudo tee /etc/systemd/system/increlution-editor-red.service > /dev/null << 'EOF'
[Unit]
Description=Loadout Manager for Increlution (RED)
After=network.target

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/opt/increlution-editor-red
ExecStart=/opt/increlution-editor-red/IncrelutionAutomationEditor.Api
Restart=always
RestartSec=10

Environment=ASPNETCORE_ENVIRONMENT=Red
Environment=ASPNETCORE_URLS=http://localhost:5000
Environment=Discord__ClientSecret=SET_VIA_SYSTEMCTL_EDIT

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/increlution-editor

[Install]
WantedBy=multi-user.target
EOF

# Create GREEN systemd service
echo "Creating GREEN systemd service..."
sudo tee /etc/systemd/system/increlution-editor-green.service > /dev/null << 'EOF'
[Unit]
Description=Loadout Manager for Increlution (GREEN)
After=network.target

[Service]
Type=exec
User=www-data
Group=www-data
WorkingDirectory=/opt/increlution-editor-green
ExecStart=/opt/increlution-editor-green/IncrelutionAutomationEditor.Api
Restart=always
RestartSec=10

Environment=ASPNETCORE_ENVIRONMENT=Green
Environment=ASPNETCORE_URLS=http://localhost:5002
Environment=Discord__ClientSecret=SET_VIA_SYSTEMCTL_EDIT

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/increlution-editor

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Set Discord secret for BOTH services:"
echo "   sudo systemctl edit increlution-editor-red"
echo "   sudo systemctl edit increlution-editor-green"
echo "   Add: [Service]"
echo "        Environment=Discord__ClientSecret=your_secret"
echo ""
echo "2. Deploy your first version using: ./deploy.sh red"
echo "3. Enable and start the active service:"
echo "   sudo systemctl enable increlution-editor-red"
echo "   sudo systemctl start increlution-editor-red"
echo ""
echo "Current active environment: $(cat $STATE_FILE)"
