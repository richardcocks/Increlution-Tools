#!/bin/bash

# Show status of Red/Green deployment

STATE_FILE="/var/lib/increlution-editor/active-environment"

get_active() {
    cat "$STATE_FILE" 2>/dev/null || echo "red"
}

ACTIVE=$(get_active)

echo "=== Red/Green Deployment Status ==="
echo ""
echo "Active environment: $ACTIVE"
echo ""

echo "--- RED (port 5000) ---"
if systemctl is-active --quiet increlution-editor-red; then
    echo "Service: RUNNING"
    if curl -sf "http://localhost:5000/api/actions" > /dev/null 2>&1; then
        echo "Health:  HEALTHY"
    else
        echo "Health:  UNHEALTHY"
    fi
else
    echo "Service: STOPPED"
    echo "Health:  N/A"
fi
if [ "$ACTIVE" = "red" ]; then
    echo "Traffic: ACTIVE <--"
else
    echo "Traffic: standby"
fi
echo ""

echo "--- GREEN (port 5002) ---"
if systemctl is-active --quiet increlution-editor-green; then
    echo "Service: RUNNING"
    if curl -sf "http://localhost:5002/api/actions" > /dev/null 2>&1; then
        echo "Health:  HEALTHY"
    else
        echo "Health:  UNHEALTHY"
    fi
else
    echo "Service: STOPPED"
    echo "Health:  N/A"
fi
if [ "$ACTIVE" = "green" ]; then
    echo "Traffic: ACTIVE <--"
else
    echo "Traffic: standby"
fi
echo ""

echo "--- STAGING (port 5001) ---"
if systemctl is-active --quiet increlution-editor-staging; then
    echo "Service: RUNNING"
    if curl -sf "http://localhost:5001/api/actions" > /dev/null 2>&1; then
        echo "Health:  HEALTHY"
    else
        echo "Health:  UNHEALTHY"
    fi
else
    echo "Service: STOPPED"
fi
