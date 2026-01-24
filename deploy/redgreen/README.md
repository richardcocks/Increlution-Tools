# Red/Green Deployment System

Zero-downtime deployment using two identical production environments that share a database.

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                    Caddy                         │
                    │         automations.eterm.uk                     │
                    └───────────────────┬─────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
              ┌─────▼─────┐       ┌─────▼─────┐       ┌─────▼─────┐
              │    RED    │       │   GREEN   │       │  STAGING  │
              │ :5000     │       │ :5002     │       │ :5001     │
              └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
                    │                   │                   │
                    └─────────┬─────────┘                   │
                              │                             │
                    ┌─────────▼─────────┐         ┌────────▼────────┐
                    │  Production DB    │         │   Staging DB    │
                    │  (shared)         │         │   (isolated)    │
                    └───────────────────┘         └─────────────────┘
```

## Environments

| Environment | Port | Database | Purpose |
|-------------|------|----------|---------|
| Red | 5000 | Shared production | Production slot A |
| Green | 5002 | Shared production | Production slot B |
| Staging | 5001 | Separate | Test migrations, new features |

## Scripts

| Script | Purpose |
|--------|---------|
| `setup.sh` | Initial server setup (run once) |
| `deploy.sh [red\|green\|inactive]` | Deploy to an environment |
| `switch.sh [red\|green]` | Switch traffic between environments |
| `status.sh` | Show status of all environments |
| `copy-db-to-staging.sh` | Copy production DB to staging for testing |

## Typical Workflow

### Code-only deployment (zero downtime)

```bash
# 1. Build locally
cd frontend && npm run build
cd ../backend && dotnet publish -c Release -o ./publish

# 2. Upload publish folder to server

# 3. On server: deploy to inactive environment
./deploy.sh inactive

# 4. Verify the inactive environment
curl http://localhost:5002/api/actions  # or 5000, depending on which is inactive

# 5. Switch traffic
./switch.sh
```

### Deployment with migrations

```bash
# 1. Copy production DB to staging
./copy-db-to-staging.sh

# 2. Deploy to staging
./deploy.sh staging  # (use the staging deploy script)

# 3. Verify migrations worked on staging
# Test at https://staging.automations.eterm.uk

# 4. If migrations are additive (no breaking changes):
#    Deploy to inactive prod, switch traffic
./deploy.sh inactive
./switch.sh

# 5. If migrations are breaking:
#    Schedule brief maintenance window, switch, apply migration
```

### Rollback

```bash
# Instant rollback - just switch back
./switch.sh
```

## Initial Setup

1. Run `setup.sh` on the server
2. Set Discord secret for both services:
   ```bash
   sudo systemctl edit increlution-editor-red
   sudo systemctl edit increlution-editor-green
   # Add: [Service]
   #      Environment=Discord__ClientSecret=your_secret
   ```
3. Deploy to red: `./deploy.sh red`
4. Enable and start: `sudo systemctl enable --now increlution-editor-red`
5. Configure Caddy with the provided Caddyfile

## Files

```
deploy/redgreen/
├── setup.sh              # One-time server setup
├── deploy.sh             # Deploy to environment
├── switch.sh             # Switch active environment
├── status.sh             # Show status
├── copy-db-to-staging.sh # Copy prod DB to staging
├── Caddyfile             # Caddy configuration
└── README.md             # This file

backend/
├── appsettings.Red.json    # Red environment config
├── appsettings.Green.json  # Green environment config
└── appsettings.Staging.json # Staging environment config
```
