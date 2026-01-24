# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Increlution Automation Editor is a visual editor for Increlution automation loadouts. It's a web application with a .NET backend and React frontend that allows users to configure automation priorities for all actions in the Increlution incremental game.

## Tech Stack

- **Backend**: ASP.NET Core 10.0 Web API (minimal API pattern)
- **Frontend**: React 19 with TypeScript, built with Vite
- **Database**: SQLite with Entity Framework Core 10.0
  - `automation.db` - Folders and loadouts (AppDbContext)
  - `identity.db` - User authentication (IdentityAppDbContext)
- **Authentication**: Discord OAuth2 with cookie-based sessions
- **Routing**: React Router DOM
- **Testing**: Vitest for frontend unit tests
- **Architecture**: Monorepo with separate `backend/` and `frontend/` folders

## Commands

### Backend (run from `backend/` directory)
```bash
dotnet watch run                            # Dev server with hot reload (https://localhost:7145)
dotnet build                                # Build
dotnet ef migrations add <Name>             # Create migration (AppDbContext)
dotnet ef database update                   # Apply migrations (AppDbContext)
dotnet ef migrations add <Name> --context IdentityAppDbContext --output-dir Migrations/Identity
dotnet ef database update --context IdentityAppDbContext
```

### Frontend (run from `frontend/` directory)
```bash
npm run dev                                 # Dev server (http://localhost:5173)
npm run build                               # Build (runs tsc then vite build)
npm run lint                                # ESLint
npm run test                                # Run Vitest tests
npm run test:ui                             # Run tests with UI
```

### First-Time Setup
```bash
cd backend && dotnet restore && dotnet ef database update && dotnet ef database update --context IdentityAppDbContext
cd ../frontend && npm install
```

### Discord OAuth Setup
1. Create app at https://discord.com/developers/applications
2. OAuth2 → Add redirect: `https://localhost:7145/api/auth/discord/callback`
3. Set Client ID in `appsettings.json`, Client Secret via user-secrets:
   ```bash
   cd backend && dotnet user-secrets set "Discord:ClientSecret" "YOUR_SECRET"
   ```

## Architecture

### Authentication
Discord OAuth2 with cookie-based sessions. The frontend includes credentials with all API requests (`credentials: 'include'`). Users sign in via Discord OAuth to get a session cookie, and all folder/loadout operations are scoped to the authenticated user. No email or password is stored - only Discord ID and username.

- **AuthContext**: React context providing auth state and `loginWithDiscord`/`logout` functions
- **ProtectedRoute**: Redirects to /login if not authenticated
- Routes:
  - `/` - Landing page (public)
  - `/login` - Discord OAuth login (public)
  - `/register` - Redirects to /login
  - `/about`, `/privacy` - Info pages (public)
  - `/share/:token` - View shared loadout (public, limited features for anonymous)
  - `/loadouts` - Main editor (protected)
  - `/settings` - User settings (protected)
  - `/favourites` - Saved favourites (protected)
  - `/shares` - Manage share links (protected)

### Data Flow
Game data (actions, skills, thresholds) is loaded at runtime from JSON files in `backend/GameData/`, **not stored in the database**. The `GameDataService` singleton reads these files on startup and serves them via `/api/actions` and `/api/skills`.

The database stores user data: **Folders** and **Loadouts**. Loadout automation settings are stored as a JSON blob in the `Data` column, matching Increlution's export format.

### Loadout Data Format
```json
{
  "0": { "actionId": automationLevel, ... },  // Type 0 = Jobs
  "1": { "actionId": automationLevel, ... },  // Type 1 = Construction
  "2": { "actionId": automationLevel, ... }   // Type 2 = Exploration
}
```
- Keys are action types (0/1/2)
- Values are dictionaries mapping `originalId` to automation level (0-4) or `null`
- `null` means "locked" - excluded from export, action uses game default

### Action ID Scheme
To prevent collisions, the backend generates offset IDs:
- **Jobs (Type 0)**: IDs 0-999 (originalId = id)
- **Construction (Type 1)**: IDs 10000+ (originalId = id - 10000)
- **Exploration (Type 2)**: IDs 20000+ (originalId = id - 20000)

The `originalId` matches Increlution's native 0-based ID per type, used for import/export compatibility.

### Frontend Component Structure
```
BrowserRouter
├── AuthProvider
│   ├── SettingsProvider
│   │   ├── SavedSharesProvider
│   │   │   ├── / → LandingPage
│   │   │   ├── /login → LoginPage (Discord OAuth)
│   │   │   ├── /register → Redirects to /login
│   │   │   ├── /share/:token → SharedLoadoutView (anonymous) or EmbeddedSharedLoadout (logged in)
│   │   │   └── /loadouts, /settings, /favourites, /shares → ProtectedRoute
│   │   │       └── App
│   │   │           ├── Header (Discord username, favourites, shares, settings, logout)
│   │   │           ├── Sidebar (folder tree, loadout selection, "Others' Loadouts")
│   │   │           └── Main content (based on route):
│   │   │               ├── LoadoutEditor (default)
│   │   │               ├── SettingsPage
│   │   │               ├── FavouritesPage
│   │   │               └── ManageSharesPage
```

### AutomationWheel Component
Visual gauge replacing dropdown for setting automation levels:
- **Click**: Increase level (Off → Low → Regular → High → Top)
- **Right-click**: Decrease level
- **Ctrl+Click (wheel)**: Set to maximum (Top) or minimum (Off)
- **Ctrl+Click (row)**: Toggle lock (null) - excludes from export

State uses React `useState` with optimistic updates - UI updates immediately, API calls in background, reverts on error.

### Import/Export
- **Export (Clipboard)**: Copies loadout JSON to clipboard (filtered by user's unlocked chapters)
- **Import (Paste)**: Ctrl+V anywhere on editor imports from clipboard
- **Download**: Saves loadout as .json file
- **Upload**: Loads loadout from .json file
- Validation in `loadoutData.ts` with descriptive error messages
- Chapter filtering: exports/imports only include actions from unlocked chapters

### Sharing System
Users can share loadouts via tokenized links:
- **Create share**: Set expiration (1h, 24h, 7d, 30d, never) and attribution visibility
- **Share links**: `/share/:token` - viewable by anyone, read-only
- **Live references**: Shared loadouts always show current data (not snapshots)
- **Saved shares**: Logged-in viewers can save to "Others' Loadouts" in sidebar
- **Chapter filtering**: Shares are filtered by the sharer's unlocked chapters at creation time

Key components:
- `ShareModal` - Create/manage shares for a loadout
- `SharedLoadoutView` - Anonymous viewing experience
- `EmbeddedSharedLoadout` - Logged-in viewing within the app
- `ManageSharesPage` - View/revoke all user's shares

### Chapter Unlock System
Chapters 2-11 are locked by default to prevent spoilers. Users unlock chapters by entering the name of the first exploration in that chapter (verified server-side). Settings stored in `UserSettings`.

- **SettingsContext**: Provides `unlockedChaptersSet` to all components
- Chapter filtering applied to: exports, imports, new loadout defaults, share creation

## API Endpoints

### Authentication (Discord OAuth2)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/discord` | Initiate Discord OAuth flow |
| GET | `/api/auth/discord/callback` | Handle Discord callback, create/sign in user |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Get current user (id, username) |
| DELETE | `/api/auth/account` | Delete account and all data |

### Game Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/actions` | All actions (from GameDataService) |
| GET | `/api/skills` | All skills |

### Folders & Loadouts (require authentication)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/folders/tree` | Folder hierarchy with loadout summaries |
| GET | `/api/loadout/{id}` | Single loadout with data |
| POST | `/api/folders` | Create folder |
| PUT | `/api/folders/{id}` | Rename folder |
| PUT | `/api/folders/{id}/parent` | Move folder |
| DELETE | `/api/folders/{id}` | Delete folder (must be empty) |
| POST | `/api/loadouts` | Create loadout |
| DELETE | `/api/loadouts/{id}` | Delete loadout |
| PUT | `/api/loadout/action` | Update single action automation level |
| PUT | `/api/loadouts/{id}/name` | Update loadout name |
| PUT | `/api/loadouts/{id}/folder` | Move loadout to folder |
| PUT | `/api/loadouts/{id}/protection` | Toggle loadout protection |
| POST | `/api/loadouts/{id}/import` | Import loadout data |
| GET | `/api/loadouts/{id}/export` | Export loadout data |

### Settings (require authentication)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update user settings |
| POST | `/api/settings/unlock-chapter` | Unlock a chapter |

### Sharing
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/loadouts/{id}/share` | Yes | Create share link |
| GET | `/api/loadouts/{id}/shares` | Yes | List shares for loadout |
| GET | `/api/shares` | Yes | List all user's shares |
| DELETE | `/api/shares/{shareId}` | Yes | Revoke share link |
| GET | `/api/share/{token}` | No | View shared loadout (public) |
| POST | `/api/share/{token}/save` | Yes | Save to "Others' Loadouts" |
| GET | `/api/saved-shares` | Yes | List saved shares |
| DELETE | `/api/saved-shares/{id}` | Yes | Remove saved share |

## Database Schema

### AppDbContext (automation.db)
**Folders**: `Id`, `Name`, `ParentId` (null=root), `UserId`, `CreatedAt`

**Loadouts**: `Id`, `Name`, `FolderId` (FK), `UserId`, `CreatedAt`, `UpdatedAt`, `Data` (JSON string), `IsProtected`

**LoadoutShares**: `Id`, `LoadoutId` (FK), `OwnerUserId`, `ShareToken` (unique), `CreatedAt`, `ExpiresAt`, `ShowAttribution`, `UnlockedChapters` (JSON array of chapter numbers at share creation time)

**SavedShares**: `Id`, `UserId`, `LoadoutShareId` (FK), `SavedAt` - tracks which shares a user has saved to "Others' Loadouts"

**UserSettings**: `Id`, `UserId`, `InvertMouse`, `ApplyDefaultsOnImport`, `DefaultSkillPriorities` (JSON), `UnlockedChapters` (JSON array)

Each user gets their own root folder on first login.

### IdentityAppDbContext (identity.db)
Standard ASP.NET Identity tables with `ApplicationUser` extended for Discord OAuth:
- `Id` (int) - Local user ID, used as foreign key in AppDbContext
- `DiscordId` (string, unique) - Discord user snowflake ID
- `DiscordUsername` (string, nullable) - Display name from Discord
- `Settings` (JSON string) - User settings (same as UserSettings record)

## Testing

Frontend tests use Vitest. Test files are colocated with source:
- `frontend/src/utils/loadoutData.test.ts` - Import/export validation tests

Run tests:
```bash
cd frontend
npm run test        # Single run
npm run test:ui     # With Vitest UI
```

## Code Style

### TypeScript
- Use type-only imports: `import type { Type } from './types'`
- Avoid enums, use const objects with `as const`
- Avoid `as any`

### C#
- Nullable reference types enabled
- Minimal API pattern for endpoints
- Use `record` for DTOs
