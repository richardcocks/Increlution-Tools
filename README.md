# Increlution Automation Editor

A visual editor for managing automation loadouts in the [Increlution](https://store.steampowered.com/app/1593350/Increlution/) incremental game. Configure automation priorities for Jobs, Construction, and Exploration actions across all chapters, then export directly to your game.

## Features

- **Visual Automation Wheel**: Click to increase, right-click to decrease automation levels (Off/Low/Regular/High/Top)
- **Lock Actions**: Ctrl+click to exclude actions from export (uses game defaults)
- **Chapter Tabs**: Quickly navigate between chapters
- **Folder Organization**: Organize loadouts in folders with drag-and-drop
- **Import/Export**:
  - Copy/paste loadouts directly (Ctrl+V to import)
  - Upload/download JSON files
- **Sharing**: Share loadouts via links with optional expiration and attribution
- **Chapter Progress**: Unlock chapters by proving you've reached them (prevents spoilers)
- **Favourites**: Save and quickly access favourite loadout configurations
- **Default Priorities**: Configure default skill priorities for new loadouts
- **Dark Mode**: Light, dark, or system theme preference
- **Multi-user Support**: Each user has their own isolated loadouts

## Quick Start

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- EF Core tools: `dotnet tool install --global dotnet-ef`

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/IncrelutionAutomationEditor.git
cd IncrelutionAutomationEditor

# Backend setup
cd backend
dotnet restore
dotnet ef database update
dotnet ef database update --context IdentityAppDbContext

# Frontend setup
cd ../frontend
npm install
```

### Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 and add redirect URI: `https://localhost:7145/api/auth/discord/callback`
4. Copy your Client ID into `backend/appsettings.json`
5. Set your Client Secret using user-secrets:
   ```bash
   cd backend
   dotnet user-secrets set "Discord:ClientSecret" "YOUR_SECRET"
   ```

### Running

Start both servers in separate terminals:

```bash
# Terminal 1: Backend (https://localhost:7145)
cd backend
dotnet watch run

# Terminal 2: Frontend (http://localhost:5173)
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

### Getting Started
1. Sign in with your Discord account
2. Create a new loadout in the sidebar
3. Click on the automation wheel next to each action to set the level:
   - **Click**: Increase level (Off -> Low -> Regular -> High -> Top)
   - **Right-click**: Decrease level
   - **Ctrl+click (wheel)**: Set to maximum/minimum
   - **Ctrl+click (row)**: Lock/unlock (locked actions are excluded from export)

### Import from Game
1. In Increlution, press F1 (or Esc -> Automations) to open the Automations screen
2. Click Export and copy the JSON
3. In the editor, press Ctrl+V anywhere on the loadout page
4. Alternatively, click "Import (Paste)" button and paste

### Export to Game
1. Click "Export (Clipboard)" to copy your loadout
2. In Increlution, press F1 (or Esc -> Automations) to open the Automations screen
3. Click Import (imports directly from clipboard)

### Organizing Loadouts
- Create folders using the folder+ button that appears on hover
- Drag and drop loadouts and folders to reorganize
- Use the action buttons that appear on hover to rename or delete

### Sharing Loadouts
1. Open a loadout and click the "Share" button
2. Configure options:
   - **Expiration**: 1 hour, 24 hours, 7 days, 30 days, or never
   - **Show Attribution**: Whether your username appears on the shared view
3. Copy the generated link and share it
4. Recipients can view the loadout read-only
5. Logged-in recipients can save it to their "Others' Loadouts" for quick access
6. Manage all your shares from the shares icon in the header

### Chapter Progress
To prevent spoilers, chapters 2-11 are locked by default. Unlock them in Settings by entering the name of the first exploration in each chapter. This affects what you can see and export.

## Project Structure

```
IncrelutionAutomationEditor/
├── backend/                 # ASP.NET Core API
│   ├── Data/               # Entity Framework contexts
│   ├── Models/             # Entity models (Folder, Loadout, LoadoutShare, etc.)
│   ├── Migrations/         # EF Core migrations
│   ├── Services/           # Business logic (GameDataService)
│   └── GameData/           # Static JSON game data files
├── frontend/               # React + TypeScript
│   ├── src/
│   │   ├── components/     # React components (Sidebar, LoadoutEditor, ShareModal, etc.)
│   │   ├── contexts/       # React contexts (Auth, Settings, SavedShares, GameData)
│   │   ├── pages/          # Full-page components (Login, Settings, Favourites, ManageShares)
│   │   ├── services/       # API client
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utilities (validation, filtering)
│   └── package.json
├── examples/               # Example loadout files
├── CLAUDE.md              # Development documentation
└── README.md              # This file
```

## Development

### Running Tests

```bash
cd frontend
npm run test        # Single run
npm run test:ui     # With Vitest UI
```

### Building for Production

```bash
# Frontend
cd frontend
npm run build       # Output in dist/

# Backend
cd backend
dotnet publish -c Release
```

## Tech Stack

- **Backend**: ASP.NET Core 10.0, Entity Framework Core, SQLite
- **Frontend**: React 19, TypeScript, Vite
- **Authentication**: Discord OAuth2 with cookie sessions
- **Testing**: Vitest

## License

MIT
