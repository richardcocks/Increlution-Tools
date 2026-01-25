using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;
using IncrelutionAutomationEditor.Api.Utils;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Configure request body size limits (1MB max)
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 1_048_576; // 1 MB
});

// Add services to the container
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Add Identity DbContext (separate database)
builder.Services.AddDbContext<IdentityAppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("IdentityConnection")));

// Configure Discord OAuth
builder.Services.Configure<DiscordOptions>(
    builder.Configuration.GetSection(DiscordOptions.SectionName));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IOptions<DiscordOptions>>().Value);

// Add HttpClient for Discord API calls
builder.Services.AddHttpClient();

// Configure DataProtection to persist keys (for session cookies to survive restarts)
var keysDirectory = builder.Configuration["DataProtection:KeysDirectory"];
if (!string.IsNullOrEmpty(keysDirectory))
{
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(keysDirectory))
        .SetApplicationName("IncrelutionAutomationEditor");
}

// Configure cookie authentication (replaces Identity)
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.None;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromDays(30);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = 401;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = 403;
            return Task.CompletedTask;
        };
    });

// Add game data service (loads JSON files into memory)
builder.Services.AddSingleton<GameDataService>();

// Configure AppLimits
builder.Services.Configure<AppLimits>(
    builder.Configuration.GetSection(AppLimits.SectionName));
builder.Services.AddSingleton(sp =>
    sp.GetRequiredService<IOptions<AppLimits>>().Value);

// Configure rate limiting
var rateLimitConfig = builder.Configuration.GetSection(AppLimits.SectionName).Get<AppLimits>() ?? new AppLimits();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Auth endpoints - strict limit (login, register)
    options.AddFixedWindowLimiter("auth", limiterOptions =>
    {
        limiterOptions.PermitLimit = rateLimitConfig.AuthRateLimitPermitCount;
        limiterOptions.Window = TimeSpan.FromSeconds(rateLimitConfig.AuthRateLimitWindowSeconds);
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = rateLimitConfig.AuthRateLimitQueueLimit;
    });

    // General API - token bucket for burst tolerance (rapid wheel adjustments)
    options.AddTokenBucketLimiter("api", limiterOptions =>
    {
        limiterOptions.TokenLimit = rateLimitConfig.ApiRateLimitTokenLimit;
        limiterOptions.TokensPerPeriod = rateLimitConfig.ApiRateLimitTokensPerPeriod;
        limiterOptions.ReplenishmentPeriod = TimeSpan.FromSeconds(rateLimitConfig.ApiRateLimitReplenishSeconds);
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = rateLimitConfig.ApiRateLimitQueueLimit;
        limiterOptions.AutoReplenishment = true;
    });

    // Public endpoints - tighter limit for anonymous users only
    options.AddSlidingWindowLimiter("public", limiterOptions =>
    {
        limiterOptions.PermitLimit = rateLimitConfig.PublicRateLimitPermitCount;
        limiterOptions.Window = TimeSpan.FromSeconds(rateLimitConfig.PublicRateLimitWindowSeconds);
        limiterOptions.SegmentsPerWindow = 4;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        limiterOptions.QueueLimit = rateLimitConfig.PublicRateLimitQueueLimit;
    });

    // Public-or-API: Uses "api" limits for authenticated users, "public" limits for anonymous
    options.AddPolicy("public-or-api", context =>
    {
        var isAuthenticated = context.User?.Identity?.IsAuthenticated ?? false;
        if (isAuthenticated)
        {
            // Authenticated users get generous token bucket limits
            var userId = context.User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? "unknown";
            return RateLimitPartition.GetTokenBucketLimiter($"user:{userId}", _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = rateLimitConfig.ApiRateLimitTokenLimit,
                TokensPerPeriod = rateLimitConfig.ApiRateLimitTokensPerPeriod,
                ReplenishmentPeriod = TimeSpan.FromSeconds(rateLimitConfig.ApiRateLimitReplenishSeconds),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = rateLimitConfig.ApiRateLimitQueueLimit,
                AutoReplenishment = true
            });
        }
        else
        {
            // Anonymous users get tighter sliding window limits by IP
            var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            return RateLimitPartition.GetSlidingWindowLimiter($"anon:{clientIp}", _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = rateLimitConfig.PublicRateLimitPermitCount,
                Window = TimeSpan.FromSeconds(rateLimitConfig.PublicRateLimitWindowSeconds),
                SegmentsPerWindow = 4,
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = rateLimitConfig.PublicRateLimitQueueLimit
            });
        }
    });

    // Global fallback policy using client IP (token bucket for burst tolerance)
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    {
        var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetTokenBucketLimiter(clientIp, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = rateLimitConfig.ApiRateLimitTokenLimit,
            TokensPerPeriod = rateLimitConfig.ApiRateLimitTokensPerPeriod,
            ReplenishmentPeriod = TimeSpan.FromSeconds(rateLimitConfig.ApiRateLimitReplenishSeconds),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = rateLimitConfig.ApiRateLimitQueueLimit,
            AutoReplenishment = true
        });
    });

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";

        var retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfterValue)
            ? retryAfterValue.TotalSeconds
            : 60;

        context.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter).ToString();

        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Too many requests. Please try again later.",
            retryAfterSeconds = (int)retryAfter
        }, cancellationToken);
    };
});

// Configure JSON options to handle circular references
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});

// Add CORS for frontend
var frontendUrl = builder.Configuration.GetSection("Discord")["FrontendUrl"] ?? "http://localhost:5173";
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(frontendUrl)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

builder.Services.AddOpenApi();
builder.Services.AddAuthorization();

// Add output caching for static game data and shared loadouts
builder.Services.AddOutputCache(options =>
{
    // Cache game data for 1 hour (it never changes at runtime)
    options.AddPolicy("GameData", policy => policy
        .Expire(TimeSpan.FromHours(1))
        .Tag("gamedata"));

    // Cache shared loadouts for 5 minutes
    // Tagged with "shared-loadouts" for bulk eviction when loadouts are updated
    options.AddPolicy("SharedLoadout", policy => policy
        .Expire(TimeSpan.FromMinutes(5))
        .SetVaryByRouteValue("token")
        .Tag("shared-loadouts"));
});

var app = builder.Build();

// Apply pending migrations on startup
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var appDb = services.GetRequiredService<AppDbContext>();
        appDb.Database.Migrate();

        var identityDb = services.GetRequiredService<IdentityAppDbContext>();
        identityDb.Database.Migrate();
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while migrating the database.");
        throw;
    }
}

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Skip HTTPS redirect in production (Caddy handles TLS termination)
if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors("AllowFrontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();

// Serve static files (frontend) in production
if (!app.Environment.IsDevelopment())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// Helper to get current user ID
int GetUserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);

// === Auth Endpoints (Discord OAuth2) ===

// GET /api/auth/discord - Initiate Discord OAuth2 flow
app.MapGet("/api/auth/discord", (DiscordOptions discord, HttpContext httpContext) =>
{
    // Generate CSRF state token
    var state = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

    // Store state in HTTP-only cookie for validation
    httpContext.Response.Cookies.Append("oauth_state", state, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Lax,
        MaxAge = TimeSpan.FromMinutes(10)
    });

    var url = $"{discord.AuthorizationEndpoint}" +
              $"?client_id={discord.ClientId}" +
              $"&redirect_uri={Uri.EscapeDataString(discord.RedirectUri)}" +
              $"&response_type=code" +
              $"&scope=identify" +
              $"&state={Uri.EscapeDataString(state)}";

    return Results.Redirect(url);
})
.RequireRateLimiting("auth")
.WithName("DiscordLogin");

// GET /api/auth/discord/callback - Handle Discord OAuth2 callback
app.MapGet("/api/auth/discord/callback", async (
    string? code,
    string? state,
    string? error,
    DiscordOptions discord,
    IdentityAppDbContext identityDb,
    AppDbContext db,
    GameDataService gameData,
    IHttpClientFactory httpClientFactory,
    HttpContext httpContext) =>
{
    // Handle Discord errors
    if (!string.IsNullOrEmpty(error))
    {
        return Results.Redirect($"{discord.FrontendUrl}/login?error={Uri.EscapeDataString(error)}");
    }

    if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state))
    {
        return Results.Redirect($"{discord.FrontendUrl}/login?error=missing_params");
    }

    // Validate CSRF state
    var savedState = httpContext.Request.Cookies["oauth_state"];
    if (savedState != state)
    {
        return Results.Redirect($"{discord.FrontendUrl}/login?error=invalid_state");
    }

    // Clear the state cookie
    httpContext.Response.Cookies.Delete("oauth_state");

    try
    {
        var client = httpClientFactory.CreateClient();

        // Exchange code for access token
        var tokenResponse = await client.PostAsync(discord.TokenEndpoint,
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = discord.ClientId,
                ["client_secret"] = discord.ClientSecret,
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = discord.RedirectUri
            }));

        if (!tokenResponse.IsSuccessStatusCode)
        {
            return Results.Redirect($"{discord.FrontendUrl}/login?error=token_exchange_failed");
        }

        var tokenJson = await tokenResponse.Content.ReadFromJsonAsync<DiscordTokenResponse>();
        if (tokenJson == null)
        {
            return Results.Redirect($"{discord.FrontendUrl}/login?error=invalid_token_response");
        }

        // Fetch user info from Discord
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", tokenJson.AccessToken);
        var userResponse = await client.GetAsync(discord.UserInfoEndpoint);

        if (!userResponse.IsSuccessStatusCode)
        {
            return Results.Redirect($"{discord.FrontendUrl}/login?error=user_info_failed");
        }

        var discordUser = await userResponse.Content.ReadFromJsonAsync<DiscordUser>();
        if (discordUser == null)
        {
            return Results.Redirect($"{discord.FrontendUrl}/login?error=invalid_user_response");
        }

        // Find or create user
        var user = await identityDb.Users
            .FirstOrDefaultAsync(u => u.DiscordId == discordUser.Id);

        if (user == null)
        {
            // New user - create account
            var displayName = discordUser.GlobalName ?? discordUser.Username;
            user = new ApplicationUser
            {
                UserName = discordUser.Id,
                DiscordId = discordUser.Id,
                DiscordUsername = displayName,
                NormalizedUserName = discordUser.Id.ToUpperInvariant(),
                SecurityStamp = Guid.NewGuid().ToString()
            };

            // Initialize default settings
            var skills = gameData.GetAllSkills();
            var actionTypes = new[] { 0, 1, 2 };
            var defaultPriorities = new Dictionary<string, int>();
            foreach (var skillId in skills.Keys)
            {
                foreach (var actionType in actionTypes)
                {
                    defaultPriorities[$"{skillId}-{actionType}"] = 2;
                }
            }
            var defaultSettings = new UserSettings
            {
                DefaultSkillPriorities = defaultPriorities,
                SkillPrioritiesInitialized = true
            };
            user.Settings = System.Text.Json.JsonSerializer.Serialize(defaultSettings);

            identityDb.Users.Add(user);
            await identityDb.SaveChangesAsync();

            // Create root folder for the new user
            var rootFolder = new Folder
            {
                Name = "My Loadouts",
                ParentId = null,
                UserId = user.Id,
                CreatedAt = DateTime.UtcNow
            };
            db.Folders.Add(rootFolder);
            await db.SaveChangesAsync();
        }
        else
        {
            // Returning user - update Discord username if changed
            var displayName = discordUser.GlobalName ?? discordUser.Username;
            if (user.DiscordUsername != displayName)
            {
                user.DiscordUsername = displayName;
                await identityDb.SaveChangesAsync();
            }
        }

        // Create claims and sign in
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new("DiscordId", user.DiscordId),
            new("DiscordUsername", user.DiscordUsername ?? "")
        };

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await httpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties { IsPersistent = true });

        return Results.Redirect($"{discord.FrontendUrl}/loadouts");
    }
    catch (Exception)
    {
        return Results.Redirect($"{discord.FrontendUrl}/login?error=auth_failed");
    }
})
.RequireRateLimiting("auth")
.WithName("DiscordCallback");

// POST /api/auth/logout - Sign out
app.MapPost("/api/auth/logout", async (HttpContext httpContext) =>
{
    await httpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Ok(new AuthResponse(true));
})
.RequireAuthorization()
.WithName("Logout");

// GET /api/auth/me - Get current user info
app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
{
    var userId = int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    var username = user.FindFirstValue("DiscordUsername") ?? "Unknown";
    return Results.Ok(new UserInfo(userId, username));
})
.RequireAuthorization()
.WithName("GetCurrentUser");

// DELETE /api/auth/account - Delete user account and all data
app.MapDelete("/api/auth/account", async (
    ClaimsPrincipal user,
    IdentityAppDbContext identityDb,
    AppDbContext db,
    HttpContext httpContext) =>
{
    var userId = GetUserId(user);
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser == null)
        return Results.NotFound();

    // Delete in order to respect foreign key constraints
    // 1. Delete saved shares (references to other users' shares)
    var savedShares = await db.SavedShares.Where(s => s.UserId == userId).ToListAsync();
    db.SavedShares.RemoveRange(savedShares);

    // 2. Delete loadout shares created by user (and cascade deletes others' saved references)
    var shares = await db.LoadoutShares.Where(s => s.OwnerUserId == userId).ToListAsync();
    db.LoadoutShares.RemoveRange(shares);

    // 2b. Delete folder shares created by user
    var folderShares = await db.FolderShares.Where(s => s.OwnerUserId == userId).ToListAsync();
    db.FolderShares.RemoveRange(folderShares);

    // 3. Delete all loadouts
    var loadouts = await db.Loadouts.Where(l => l.UserId == userId).ToListAsync();
    db.Loadouts.RemoveRange(loadouts);

    // 4. Delete all folders
    var folders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
    db.Folders.RemoveRange(folders);

    await db.SaveChangesAsync();

    // 5. Sign out and delete user account
    await httpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    identityDb.Users.Remove(appUser);
    await identityDb.SaveChangesAsync();

    return Results.Ok(new AuthResponse(true));
})
.RequireAuthorization()
.WithName("DeleteAccount");

// === Settings Endpoints ===

// GET /api/settings - Get user settings
app.MapGet("/api/settings", async (ClaimsPrincipal user, IdentityAppDbContext identityDb) =>
{
    var userId = GetUserId(user);
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser == null)
        return Results.NotFound();

    if (string.IsNullOrEmpty(appUser.Settings))
        return Results.Ok(new UserSettings());

    try
    {
        var settings = System.Text.Json.JsonSerializer.Deserialize<UserSettings>(appUser.Settings);
        return Results.Ok(settings ?? new UserSettings());
    }
    catch
    {
        return Results.Ok(new UserSettings());
    }
})
.RequireAuthorization()
.WithName("GetSettings");

// PUT /api/settings - Update user settings
app.MapPut("/api/settings", async (UserSettings settings, ClaimsPrincipal user, IdentityAppDbContext identityDb) =>
{
    var userId = GetUserId(user);
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser == null)
        return Results.NotFound();

    var sanitizedSettings = settings.Sanitized();
    appUser.Settings = System.Text.Json.JsonSerializer.Serialize(sanitizedSettings);
    await identityDb.SaveChangesAsync();

    return Results.Ok(sanitizedSettings);
})
.RequireAuthorization()
.WithName("UpdateSettings");

// POST /api/settings/unlock-chapter - Attempt to unlock a chapter by providing the first exploration name
app.MapPost("/api/settings/unlock-chapter", async (
    UnlockChapterRequest request,
    ClaimsPrincipal user,
    IdentityAppDbContext identityDb,
    GameDataService gameData) =>
{
    var userId = GetUserId(user);
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser == null)
        return Results.NotFound();

    // Validate chapter number (1-10, chapter 0 is always unlocked)
    if (request.Chapter < 1 || request.Chapter > 10)
        return Results.BadRequest(new UnlockChapterResponse(false, "Invalid chapter number"));

    // Get the expected exploration name for this chapter
    var expectedName = gameData.GetFirstExplorationName(request.Chapter);
    if (expectedName == null)
        return Results.BadRequest(new UnlockChapterResponse(false, "Chapter not found"));

    // Validate the guess using fuzzy matching
    if (!StringUtils.FuzzyMatch(request.ExplorationName, expectedName))
        return Results.Ok(new UnlockChapterResponse(false, "Incorrect exploration name"));

    // Load current settings
    UserSettings settings;
    try
    {
        settings = string.IsNullOrEmpty(appUser.Settings)
            ? new UserSettings()
            : System.Text.Json.JsonSerializer.Deserialize<UserSettings>(appUser.Settings) ?? new UserSettings();
    }
    catch
    {
        settings = new UserSettings();
    }

    // Ensure unlocked chapters includes 0 and add new chapter + all previous
    var unlocked = new HashSet<int>(settings.UnlockedChapters) { 0 };
    for (var i = 0; i <= request.Chapter; i++)
    {
        unlocked.Add(i);
    }

    // Update settings with new unlocked chapters
    var newSettings = settings with { UnlockedChapters = unlocked.OrderBy(c => c).ToList() };
    appUser.Settings = System.Text.Json.JsonSerializer.Serialize(newSettings);
    await identityDb.SaveChangesAsync();

    return Results.Ok(new UnlockChapterResponse(true, "Chapter unlocked!", newSettings.UnlockedChapters));
})
.RequireAuthorization()
.RequireRateLimiting("auth")
.WithName("UnlockChapter");

// === Game Data Endpoints (public) ===

// GET /api/actions - Get all Increlution actions (from in-memory data)
app.MapGet("/api/actions", (GameDataService gameData) =>
{
    return gameData.GetAllActions();
})
.RequireRateLimiting("public-or-api")
.CacheOutput("GameData")
.WithName("GetActions");

// GET /api/skills - Get all skills (from in-memory data)
app.MapGet("/api/skills", (GameDataService gameData) =>
{
    return gameData.GetAllSkills();
})
.RequireRateLimiting("public-or-api")
.CacheOutput("GameData")
.WithName("GetSkills");

// === Protected Endpoints ===

// GET /api/folders/tree - Get folder tree with all folders and loadouts
app.MapGet("/api/folders/tree", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);

    var folders = await db.Folders
        .Where(f => f.UserId == userId)
        .Include(f => f.SubFolders)
        .Include(f => f.Loadouts)
        .ToListAsync();

    var loadouts = await db.Loadouts
        .Where(l => l.UserId == userId)
        .ToListAsync();

    // Find root folder (the one with ParentId == null for this user)
    var rootFolder = folders.FirstOrDefault(f => f.ParentId == null);
    if (rootFolder == null)
    {
        return Results.NotFound("Root folder not found");
    }

    FolderTreeNode BuildTree(int folderId)
    {
        var folder = folders.First(f => f.Id == folderId);

        return new FolderTreeNode(
            folder.Id,
            folder.Name,
            folder.ParentId,
            folders.Where(f => f.ParentId == folder.Id)
                .Select(f => BuildTree(f.Id))
                .ToList(),
            loadouts.Where(l => l.FolderId == folder.Id)
                .Select(l => new LoadoutSummary(l.Id, l.Name, l.UpdatedAt, l.IsProtected))
                .ToList()
        );
    }

    return Results.Ok(BuildTree(rootFolder.Id));
})
.RequireAuthorization()
.WithName("GetFolderTree");

// GET /api/loadout/{id} - Get specific loadout
app.MapGet("/api/loadout/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound();

    return Results.Ok(new
    {
        loadout.Id,
        loadout.Name,
        loadout.FolderId,
        loadout.CreatedAt,
        loadout.UpdatedAt,
        loadout.IsProtected,
        Data = loadout.GetData()
    });
})
.RequireAuthorization()
.WithName("GetLoadout");

// POST /api/folders - Create new folder
app.MapPost("/api/folders", async (CreateFolderRequest request, ClaimsPrincipal user, AppDbContext db, AppLimits limits) =>
{
    var userId = GetUserId(user);

    // Check folder count limit
    var folderCount = await db.Folders.CountAsync(f => f.UserId == userId);
    if (folderCount >= limits.MaxFoldersPerUser)
        return Results.BadRequest($"Maximum folder limit ({limits.MaxFoldersPerUser}) reached");

    // Verify parent folder belongs to user
    var parentFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.ParentId && f.UserId == userId);
    if (parentFolder == null)
        return Results.NotFound("Parent folder not found");

    // Check folder depth limit
    var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
    int GetDepth(int? parentId)
    {
        int depth = 0;
        while (parentId != null)
        {
            depth++;
            var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
            parentId = parent?.ParentId;
        }
        return depth;
    }
    var currentDepth = GetDepth(request.ParentId);
    if (currentDepth >= limits.MaxFolderDepth)
        return Results.BadRequest($"Maximum folder depth ({limits.MaxFolderDepth}) reached");

    var folder = new Folder
    {
        Name = request.Name.Trim(),
        ParentId = request.ParentId,
        UserId = userId,
        CreatedAt = DateTime.UtcNow
    };
    db.Folders.Add(folder);
    await db.SaveChangesAsync();

    return Results.Ok(folder);
})
.RequireAuthorization()
.WithName("CreateFolder");

// PUT /api/folders/{id} - Rename folder
app.MapPut("/api/folders/{id}", async (int id, RenameFolderRequest request, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
    if (folder == null)
        return Results.NotFound();

    // Prevent renaming root folder
    if (folder.ParentId == null)
        return Results.BadRequest("Cannot rename root folder");

    folder.Name = request.Name.Trim();
    await db.SaveChangesAsync();

    return Results.Ok(folder);
})
.RequireAuthorization()
.WithName("RenameFolder");

// DELETE /api/folders/{id} - Delete folder
app.MapDelete("/api/folders/{id}", async (int id, bool force, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders
        .Include(f => f.SubFolders)
        .Include(f => f.Loadouts)
        .FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);

    if (folder == null)
        return Results.NotFound();

    // Prevent deleting root folder
    if (folder.ParentId == null)
        return Results.BadRequest("Cannot delete root folder");

    var hasContents = folder.SubFolders.Any() || folder.Loadouts.Any();

    // If folder has contents and force is not set, reject
    if (hasContents && !force)
        return Results.BadRequest("Cannot delete folder with contents");

    var foldersDeleted = 0;
    var loadoutsDeleted = 0;
    var protectedLoadoutsMoved = 0;

    if (force && hasContents)
    {
        // Recursive delete - load all folders and loadouts for this user
        var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
        var allLoadouts = await db.Loadouts.Where(l => l.UserId == userId).ToListAsync();
        var allShares = await db.LoadoutShares.Where(s => s.OwnerUserId == userId).ToListAsync();

        // Find all folder IDs to delete (including nested)
        var folderIdsToDelete = new HashSet<int>();
        void CollectFolderIds(int folderId)
        {
            folderIdsToDelete.Add(folderId);
            foreach (var sub in allFolders.Where(f => f.ParentId == folderId))
            {
                CollectFolderIds(sub.Id);
            }
        }
        CollectFolderIds(id);

        // Find loadouts in these folders
        var loadoutsInFolders = allLoadouts.Where(l => folderIdsToDelete.Contains(l.FolderId)).ToList();
        var protectedLoadouts = loadoutsInFolders.Where(l => l.IsProtected).ToList();
        var unprotectedLoadouts = loadoutsInFolders.Where(l => !l.IsProtected).ToList();

        // Re-parent protected loadouts to the parent folder
        foreach (var protectedLoadout in protectedLoadouts)
        {
            protectedLoadout.FolderId = folder.ParentId!.Value;
            protectedLoadout.UpdatedAt = DateTime.UtcNow;
        }
        protectedLoadoutsMoved = protectedLoadouts.Count;

        // Delete shares for unprotected loadouts only
        var unprotectedLoadoutIds = unprotectedLoadouts.Select(l => l.Id).ToHashSet();
        var sharesToDelete = allShares.Where(s => unprotectedLoadoutIds.Contains(s.LoadoutId)).ToList();
        db.LoadoutShares.RemoveRange(sharesToDelete);

        // Delete unprotected loadouts
        db.Loadouts.RemoveRange(unprotectedLoadouts);
        loadoutsDeleted = unprotectedLoadouts.Count;

        // Delete all folders
        var foldersToDelete = allFolders.Where(f => folderIdsToDelete.Contains(f.Id)).ToList();
        db.Folders.RemoveRange(foldersToDelete);
        foldersDeleted = foldersToDelete.Count;
    }
    else
    {
        db.Folders.Remove(folder);
        foldersDeleted = 1;
    }

    await db.SaveChangesAsync();

    return Results.Ok(new DeleteFolderResponse(foldersDeleted, loadoutsDeleted, protectedLoadoutsMoved));
})
.RequireAuthorization()
.WithName("DeleteFolder");

// PUT /api/folders/{id}/parent - Move folder to a different parent
app.MapPut("/api/folders/{id}/parent", async (int id, MoveFolderRequest request, ClaimsPrincipal user, AppDbContext db, AppLimits limits) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
    if (folder == null)
        return Results.NotFound("Folder not found");

    // Cannot move root folder
    if (folder.ParentId == null)
        return Results.BadRequest("Cannot move root folder");

    var targetFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.ParentId && f.UserId == userId);
    if (targetFolder == null)
        return Results.NotFound("Target folder not found");

    // Cannot move to same parent
    if (folder.ParentId == request.ParentId)
        return Results.Ok();

    // Cannot move folder into itself
    if (id == request.ParentId)
        return Results.BadRequest("Cannot move folder into itself");

    // Check if target is a descendant of the folder being moved (would create cycle)
    var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
    bool IsDescendant(int? parentId, int ancestorId)
    {
        while (parentId != null)
        {
            if (parentId == ancestorId) return true;
            var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
            parentId = parent?.ParentId;
        }
        return false;
    }

    if (IsDescendant(request.ParentId, id))
        return Results.BadRequest("Cannot move folder into its own descendant");

    // Check folder depth limit after move
    int GetDepth(int? parentId)
    {
        int depth = 0;
        while (parentId != null)
        {
            depth++;
            var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
            parentId = parent?.ParentId;
        }
        return depth;
    }

    int GetMaxSubfolderDepth(int folderId)
    {
        int maxDepth = 0;
        var subfolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        foreach (var sub in subfolders)
        {
            var subDepth = 1 + GetMaxSubfolderDepth(sub.Id);
            if (subDepth > maxDepth) maxDepth = subDepth;
        }
        return maxDepth;
    }

    var targetDepth = GetDepth(request.ParentId);
    var folderSubDepth = GetMaxSubfolderDepth(id);
    var newTotalDepth = targetDepth + 1 + folderSubDepth;

    if (newTotalDepth > limits.MaxFolderDepth)
        return Results.BadRequest($"Move would exceed maximum folder depth ({limits.MaxFolderDepth})");

    folder.ParentId = request.ParentId;
    await db.SaveChangesAsync();
    return Results.Ok();
})
.RequireAuthorization()
.WithName("MoveFolder");

// POST /api/loadouts - Create new loadout
app.MapPost("/api/loadouts", async (
    CreateLoadoutRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    GameDataService gameData,
    AppLimits limits) =>
{
    var userId = GetUserId(user);

    // Check loadout count limit
    var loadoutCount = await db.Loadouts.CountAsync(l => l.UserId == userId);
    if (loadoutCount >= limits.MaxLoadoutsPerUser)
        return Results.BadRequest($"Maximum loadout limit ({limits.MaxLoadoutsPerUser}) reached");

    // Verify folder belongs to user
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.FolderId && f.UserId == userId);
    if (folder == null)
        return Results.NotFound("Folder not found");

    // Get user's default skill priorities and unlocked chapters
    var data = new Dictionary<string, Dictionary<string, int>>();
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser?.Settings != null)
    {
        try
        {
            var settings = System.Text.Json.JsonSerializer.Deserialize<UserSettings>(appUser.Settings);
            if (settings?.DefaultSkillPriorities?.Count > 0)
            {
                // Get unlocked chapters (default to just chapter 0)
                var unlockedChapters = new HashSet<int>(settings.UnlockedChapters ?? new List<int> { 0 });

                // Apply default priorities based on skill and action type, but only for unlocked chapters
                var allActions = gameData.GetAllActions();
                foreach (var action in allActions)
                {
                    // Skip actions from locked chapters
                    if (!unlockedChapters.Contains(action.Chapter))
                        continue;

                    var key = $"{action.SkillId}-{action.Type}";
                    if (settings.DefaultSkillPriorities.TryGetValue(key, out var priority))
                    {
                        var typeKey = action.Type.ToString();
                        if (!data.ContainsKey(typeKey))
                            data[typeKey] = new Dictionary<string, int>();
                        data[typeKey][action.OriginalId.ToString()] = priority;
                    }
                }
            }
        }
        catch
        {
            // Ignore settings parse errors
        }
    }

    var loadout = new Loadout
    {
        Name = request.Name.Trim(),
        FolderId = request.FolderId,
        UserId = userId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        Data = System.Text.Json.JsonSerializer.Serialize(data)
    };
    db.Loadouts.Add(loadout);
    await db.SaveChangesAsync();

    return Results.Ok(loadout);
})
.RequireAuthorization()
.WithName("CreateLoadout");

// DELETE /api/loadouts/{id} - Delete loadout
app.MapDelete("/api/loadouts/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound();

    if (loadout.IsProtected)
        return Results.BadRequest("Cannot delete a protected loadout");

    db.Loadouts.Remove(loadout);
    await db.SaveChangesAsync();

    return Results.Ok();
})
.RequireAuthorization()
.WithName("DeleteLoadout");

// PUT /api/loadout/action - Update automation level for an action
app.MapPut("/api/loadout/action", async (
    UpdateActionRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IOutputCacheStore cacheStore,
    AppLimits limits) =>
{
    var userId = GetUserId(user);

    // Validate action type
    if (request.ActionType < 0 || request.ActionType > 2)
        return Results.BadRequest("Action type must be 0, 1, or 2");

    // Validate automation level
    if (request.AutomationLevel.HasValue &&
        (request.AutomationLevel.Value < limits.MinAutomationLevel ||
         request.AutomationLevel.Value > limits.MaxAutomationLevel))
        return Results.BadRequest($"Automation level must be between {limits.MinAutomationLevel} and {limits.MaxAutomationLevel}");

    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == request.LoadoutId && l.UserId == userId);

    if (loadout == null)
        return Results.NotFound("Loadout not found");

    if (loadout.IsProtected)
        return Results.BadRequest("Cannot modify a protected loadout");

    var data = loadout.GetData();

    // Ensure the action type dictionary exists
    if (!data.ContainsKey(request.ActionType))
    {
        data[request.ActionType] = new Dictionary<int, int?>();
    }

    // Update or remove the automation level
    if (request.AutomationLevel == null)
    {
        data[request.ActionType].Remove(request.ActionId);
    }
    else
    {
        data[request.ActionType][request.ActionId] = request.AutomationLevel;
    }

    loadout.SetData(data);
    loadout.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    // Invalidate all cached shared loadouts (since we can't tag by individual loadout ID)
    await cacheStore.EvictByTagAsync("shared-loadouts", default);

    return Results.Ok();
})
.RequireAuthorization()
.WithName("UpdateActionAutomationLevel");

// PUT /api/loadouts/{id}/name - Update loadout name
app.MapPut("/api/loadouts/{id}/name", async (
    int id,
    UpdateLoadoutNameRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IOutputCacheStore cacheStore) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    if (loadout.IsProtected)
        return Results.BadRequest("Cannot modify a protected loadout");

    loadout.Name = request.Name.Trim();
    loadout.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    // Invalidate all cached shared loadouts
    await cacheStore.EvictByTagAsync("shared-loadouts", default);

    return Results.Ok(loadout);
})
.RequireAuthorization()
.WithName("UpdateLoadoutName");

// PUT /api/loadouts/{id}/protection - Toggle loadout protection
app.MapPut("/api/loadouts/{id}/protection", async (
    int id,
    UpdateLoadoutProtectionRequest request,
    ClaimsPrincipal user,
    AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    loadout.IsProtected = request.IsProtected;
    await db.SaveChangesAsync();

    return Results.Ok(new { loadout.IsProtected });
})
.RequireAuthorization()
.WithName("UpdateLoadoutProtection");

// POST /api/loadouts/{id}/import - Import loadout data
app.MapPost("/api/loadouts/{id}/import", async (
    int id,
    ImportLoadoutRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IOutputCacheStore cacheStore,
    AppLimits limits) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    if (loadout.IsProtected)
        return Results.BadRequest("Cannot modify a protected loadout");

    // Validate imported data
    if (request.Data != null)
    {
        foreach (var (actionType, actions) in request.Data)
        {
            // Validate action type
            if (actionType < 0 || actionType > 2)
                return Results.BadRequest("Invalid action type in import data");

            // Validate automation levels
            foreach (var (actionId, level) in actions)
            {
                if (level.HasValue &&
                    (level.Value < limits.MinAutomationLevel || level.Value > limits.MaxAutomationLevel))
                    return Results.BadRequest($"Invalid automation level in import data (must be {limits.MinAutomationLevel}-{limits.MaxAutomationLevel})");
            }
        }
    }

    loadout.SetData(request.Data);
    loadout.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    // Invalidate all cached shared loadouts
    await cacheStore.EvictByTagAsync("shared-loadouts", default);

    return Results.Ok();
})
.RequireAuthorization()
.WithName("ImportLoadout");

// GET /api/loadouts/{id}/export - Export loadout data
app.MapGet("/api/loadouts/{id}/export", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    return Results.Ok(loadout.GetData());
})
.RequireAuthorization()
.WithName("ExportLoadout");

// PUT /api/loadouts/{id}/folder - Move loadout to a different folder
app.MapPut("/api/loadouts/{id}/folder", async (int id, MoveLoadoutRequest request, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    var targetFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.FolderId && f.UserId == userId);
    if (targetFolder == null)
        return Results.NotFound("Target folder not found");

    if (loadout.FolderId == request.FolderId)
        return Results.Ok();

    loadout.FolderId = request.FolderId;
    loadout.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok();
})
.RequireAuthorization()
.WithName("MoveLoadout");

// POST /api/loadouts/{id}/duplicate - Duplicate a loadout
app.MapPost("/api/loadouts/{id}/duplicate", async (int id, ClaimsPrincipal user, AppDbContext db, AppLimits limits) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    // Check loadout count limit
    var loadoutCount = await db.Loadouts.CountAsync(l => l.UserId == userId);
    if (loadoutCount >= limits.MaxLoadoutsPerUser)
        return Results.BadRequest($"Maximum loadout limit ({limits.MaxLoadoutsPerUser}) reached");

    var newLoadout = new Loadout
    {
        Name = GenerateCopyName(loadout.Name),
        FolderId = loadout.FolderId,
        UserId = userId,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        Data = loadout.Data, // Copy the JSON data as-is
        IsProtected = false  // New duplicates are unprotected
    };
    db.Loadouts.Add(newLoadout);
    await db.SaveChangesAsync();

    return Results.Ok(new DuplicateLoadoutResponse(
        newLoadout.Id,
        newLoadout.Name,
        newLoadout.FolderId,
        newLoadout.UpdatedAt,
        newLoadout.IsProtected
    ));
})
.RequireAuthorization()
.WithName("DuplicateLoadout");

// POST /api/folders/{id}/duplicate - Duplicate a folder and all its contents
app.MapPost("/api/folders/{id}/duplicate", async (int id, ClaimsPrincipal user, AppDbContext db, AppLimits limits) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
    if (folder == null)
        return Results.NotFound("Folder not found");

    // Cannot duplicate root folder
    if (folder.ParentId == null)
        return Results.BadRequest("Cannot duplicate root folder");

    // Load all user's folders and loadouts to check limits and calculate depth
    var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
    var allLoadouts = await db.Loadouts.Where(l => l.UserId == userId).ToListAsync();

    // Count subfolders and loadouts in the folder to duplicate
    int CountFoldersRecursive(int folderId)
    {
        var subFolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        return 1 + subFolders.Sum(f => CountFoldersRecursive(f.Id));
    }

    int CountLoadoutsRecursive(int folderId)
    {
        var folderLoadouts = allLoadouts.Count(l => l.FolderId == folderId);
        var subFolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        return folderLoadouts + subFolders.Sum(f => CountLoadoutsRecursive(f.Id));
    }

    var foldersToCreate = CountFoldersRecursive(id);
    var loadoutsToCreate = CountLoadoutsRecursive(id);

    // Check folder limit
    if (allFolders.Count + foldersToCreate > limits.MaxFoldersPerUser)
        return Results.BadRequest($"Duplicating would exceed maximum folder limit ({limits.MaxFoldersPerUser})");

    // Check loadout limit
    if (allLoadouts.Count + loadoutsToCreate > limits.MaxLoadoutsPerUser)
        return Results.BadRequest($"Duplicating would exceed maximum loadout limit ({limits.MaxLoadoutsPerUser})");

    // Check depth limit
    int GetDepth(int? parentId)
    {
        int depth = 0;
        while (parentId != null)
        {
            depth++;
            var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
            parentId = parent?.ParentId;
        }
        return depth;
    }

    int GetMaxSubfolderDepth(int folderId)
    {
        int maxDepth = 0;
        var subfolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        foreach (var sub in subfolders)
        {
            var subDepth = 1 + GetMaxSubfolderDepth(sub.Id);
            if (subDepth > maxDepth) maxDepth = subDepth;
        }
        return maxDepth;
    }

    var parentDepth = GetDepth(folder.ParentId);
    var subfolderDepth = GetMaxSubfolderDepth(id);
    // New folder will be at parentDepth + 1, plus its subfolders
    var newTotalDepth = parentDepth + 1 + subfolderDepth;
    if (newTotalDepth > limits.MaxFolderDepth)
        return Results.BadRequest($"Duplicating would exceed maximum folder depth ({limits.MaxFolderDepth})");

    // Recursively duplicate the folder structure
    var totalFoldersCopied = 0;
    var totalLoadoutsCopied = 0;

    async Task<Folder> DuplicateFolderRecursive(int sourceFolderId, int? targetParentId, bool isTopLevel)
    {
        var sourceFolder = allFolders.First(f => f.Id == sourceFolderId);

        var newFolder = new Folder
        {
            Name = isTopLevel ? GenerateCopyName(sourceFolder.Name) : sourceFolder.Name,
            ParentId = targetParentId,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        };
        db.Folders.Add(newFolder);
        await db.SaveChangesAsync();
        totalFoldersCopied++;

        // Duplicate loadouts in this folder
        var folderLoadouts = allLoadouts.Where(l => l.FolderId == sourceFolderId).ToList();
        foreach (var loadout in folderLoadouts)
        {
            var newLoadout = new Loadout
            {
                Name = loadout.Name, // Keep original name for child loadouts
                FolderId = newFolder.Id,
                UserId = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Data = loadout.Data,
                IsProtected = false
            };
            db.Loadouts.Add(newLoadout);
            totalLoadoutsCopied++;
        }
        await db.SaveChangesAsync();

        // Duplicate subfolders
        var subFolders = allFolders.Where(f => f.ParentId == sourceFolderId).ToList();
        foreach (var subFolder in subFolders)
        {
            await DuplicateFolderRecursive(subFolder.Id, newFolder.Id, false);
        }

        return newFolder;
    }

    var newRootFolder = await DuplicateFolderRecursive(id, folder.ParentId, true);

    return Results.Ok(new DuplicateFolderResponse(
        newRootFolder.Id,
        newRootFolder.Name,
        newRootFolder.ParentId,
        totalFoldersCopied,
        totalLoadoutsCopied
    ));
})
.RequireAuthorization()
.WithName("DuplicateFolder");

// === Sharing Endpoints ===

// Helper function to generate share token
string GenerateShareToken()
{
    const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var data = new byte[16];
    RandomNumberGenerator.Fill(data);
    var result = new char[16];
    for (int i = 0; i < 16; i++)
    {
        result[i] = chars[data[i] % chars.Length];
    }
    return new string(result);
}

// Helper function to generate copy name
string GenerateCopyName(string originalName, int maxLength = 100)
{
    const string copySuffix = " (copy)";
    const string copyPattern = " (copy) (";

    // Check if name already ends with " (copy)" or " (copy) (N)"
    if (originalName.EndsWith(copySuffix))
    {
        // Convert "Name (copy)" to "Name (copy) (2)"
        var baseName = originalName;
        var newName = $"{baseName} (2)";
        if (newName.Length > maxLength)
        {
            var excess = newName.Length - maxLength;
            baseName = baseName[..^excess];
            newName = $"{baseName} (2)";
        }
        return newName;
    }

    var copyIndex = originalName.LastIndexOf(copyPattern);
    if (copyIndex >= 0)
    {
        // Extract the number and increment
        var afterPattern = originalName[(copyIndex + copyPattern.Length)..];
        var closeParenIndex = afterPattern.IndexOf(')');
        if (closeParenIndex > 0 && closeParenIndex == afterPattern.Length - 1)
        {
            var numberStr = afterPattern[..closeParenIndex];
            if (int.TryParse(numberStr, out var num))
            {
                var baseName = originalName[..(copyIndex + copySuffix.Length)];
                var newName = $"{baseName} ({num + 1})";
                if (newName.Length > maxLength)
                {
                    var excess = newName.Length - maxLength;
                    baseName = baseName[..^excess];
                    newName = $"{baseName} ({num + 1})";
                }
                return newName;
            }
        }
    }

    // Just append " (copy)"
    var result = originalName + copySuffix;
    if (result.Length > maxLength)
    {
        var excess = result.Length - maxLength;
        result = originalName[..^excess] + copySuffix;
    }
    return result;
}

// Helper function to filter loadout data by unlocked chapters
LoadoutData FilterLoadoutByChapters(LoadoutData data, IEnumerable<IncrelutionAction> actions, HashSet<int> unlockedChapters)
{
    // Build lookup: type -> originalId -> chapter
    var chapterLookup = new Dictionary<int, Dictionary<int, int>>();
    foreach (var action in actions)
    {
        if (!chapterLookup.ContainsKey(action.Type))
            chapterLookup[action.Type] = new Dictionary<int, int>();
        chapterLookup[action.Type][action.OriginalId] = action.Chapter;
    }

    var result = new LoadoutData();
    foreach (var (actionType, typeData) in data)
    {
        result[actionType] = new Dictionary<int, int?>();
        if (!chapterLookup.TryGetValue(actionType, out var typeLookup))
        {
            // No actions for this type, include all
            foreach (var (originalId, level) in typeData)
                result[actionType][originalId] = level;
            continue;
        }

        foreach (var (originalId, level) in typeData)
        {
            // Only include if chapter is unlocked (or if we can't find chapter info)
            if (!typeLookup.TryGetValue(originalId, out var chapter) || unlockedChapters.Contains(chapter))
            {
                result[actionType][originalId] = level;
            }
        }
    }
    return result;
}

// POST /api/loadouts/{id}/share - Create share link
app.MapPost("/api/loadouts/{id}/share", async (
    int id,
    CreateShareRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    AppLimits limits) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    // Check share count limit per loadout
    var shareCount = await db.LoadoutShares.CountAsync(s => s.LoadoutId == id);
    if (shareCount >= limits.MaxSharesPerLoadout)
        return Results.BadRequest($"Maximum shares per loadout ({limits.MaxSharesPerLoadout}) reached");

    // Validate expiration hours
    if (request.ExpiresInHours.HasValue &&
        (request.ExpiresInHours.Value < 1 || request.ExpiresInHours.Value > limits.MaxShareExpirationHours))
        return Results.BadRequest($"Expiration must be between 1 and {limits.MaxShareExpirationHours} hours");

    // Get user's unlocked chapters
    var unlockedChapters = new List<int> { 0 };
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser?.Settings != null)
    {
        try
        {
            var settings = System.Text.Json.JsonSerializer.Deserialize<UserSettings>(appUser.Settings);
            if (settings?.UnlockedChapters?.Count > 0)
            {
                unlockedChapters = settings.UnlockedChapters;
            }
        }
        catch
        {
            // Use default
        }
    }

    // Generate unique token (retry on collision)
    string token;
    do
    {
        token = GenerateShareToken();
    } while (await db.LoadoutShares.AnyAsync(s => s.ShareToken == token));

    var share = new LoadoutShare
    {
        LoadoutId = id,
        OwnerUserId = userId,
        ShareToken = token,
        CreatedAt = DateTime.UtcNow,
        ExpiresAt = request.ExpiresInHours.HasValue
            ? DateTime.UtcNow.AddHours(request.ExpiresInHours.Value)
            : null,
        ShowAttribution = request.ShowAttribution
    };
    share.SetUnlockedChapters(unlockedChapters);

    db.LoadoutShares.Add(share);
    await db.SaveChangesAsync();

    return Results.Ok(new LoadoutShareResponse(
        share.Id,
        share.ShareToken,
        share.CreatedAt,
        share.ExpiresAt,
        share.ShowAttribution
    ));
})
.RequireAuthorization()
.WithName("CreateShare");

// GET /api/loadouts/{id}/shares - List active shares for loadout
app.MapGet("/api/loadouts/{id}/shares", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
    if (loadout == null)
        return Results.NotFound("Loadout not found");

    var shares = await db.LoadoutShares
        .Where(s => s.LoadoutId == id && s.OwnerUserId == userId)
        .Select(s => new LoadoutShareResponse(
            s.Id,
            s.ShareToken,
            s.CreatedAt,
            s.ExpiresAt,
            s.ShowAttribution
        ))
        .ToListAsync();

    return Results.Ok(shares);
})
.RequireAuthorization()
.WithName("GetLoadoutShares");

// GET /api/shares - List all shares for current user
app.MapGet("/api/shares", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);

    var shares = await db.LoadoutShares
        .Where(s => s.OwnerUserId == userId)
        .Include(s => s.Loadout)
        .Select(s => new UserShareResponse(
            s.Id,
            s.ShareToken,
            s.LoadoutId,
            s.Loadout.Name,
            s.CreatedAt,
            s.ExpiresAt,
            s.ShowAttribution
        ))
        .ToListAsync();

    return Results.Ok(shares);
})
.RequireAuthorization()
.WithName("GetAllUserShares");

// DELETE /api/shares/{shareId} - Revoke share link
app.MapDelete("/api/shares/{shareId}", async (int shareId, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var share = await db.LoadoutShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
    if (share == null)
        return Results.NotFound("Share not found");

    db.LoadoutShares.Remove(share);
    await db.SaveChangesAsync();

    return Results.Ok();
})
.RequireAuthorization()
.WithName("RevokeShare");

// GET /api/share/{token} - View shared loadout (public, cached)
app.MapGet("/api/share/{token}", async (
    string token,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    GameDataService gameData) =>
{
    var share = await db.LoadoutShares
        .Include(s => s.Loadout)
        .FirstOrDefaultAsync(s => s.ShareToken == token);

    if (share == null)
        return Results.NotFound(new SharedLoadoutErrorResponse("Share not found"));

    // Check expiration
    if (share.ExpiresAt.HasValue && share.ExpiresAt.Value < DateTime.UtcNow)
        return Results.BadRequest(new SharedLoadoutErrorResponse("This share link has expired"));

    // Get owner name if attribution is enabled
    string? ownerName = null;
    if (share.ShowAttribution)
    {
        var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
        ownerName = owner?.DiscordUsername;
    }

    // Filter loadout data by sharer's unlocked chapters
    var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
    var allActions = gameData.GetAllActions();
    var loadoutData = share.Loadout.GetData();
    var filteredData = FilterLoadoutByChapters(loadoutData, allActions, unlockedChapters);

    return Results.Ok(new SharedLoadoutResponse(
        share.Loadout.Name,
        filteredData,
        share.Loadout.UpdatedAt,
        ownerName
    ));
})
.RequireRateLimiting("public-or-api")
.CacheOutput("SharedLoadout")
.WithName("GetSharedLoadout");

// POST /api/share/{token}/save - Save to "Others' Loadouts"
app.MapPost("/api/share/{token}/save", async (
    string token,
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    AppLimits limits) =>
{
    var userId = GetUserId(user);

    // Check saved share limit
    var savedCount = await db.SavedShares.CountAsync(s => s.UserId == userId);
    if (savedCount >= limits.MaxSavedSharesPerUser)
        return Results.BadRequest($"Maximum saved shares ({limits.MaxSavedSharesPerUser}) reached");

    var share = await db.LoadoutShares
        .Include(s => s.Loadout)
        .FirstOrDefaultAsync(s => s.ShareToken == token);

    if (share == null)
        return Results.NotFound("Share not found");

    // Check expiration
    if (share.ExpiresAt.HasValue && share.ExpiresAt.Value < DateTime.UtcNow)
        return Results.BadRequest("This share link has expired");

    // Check if already saved
    var existing = await db.SavedShares
        .FirstOrDefaultAsync(s => s.UserId == userId && s.LoadoutShareId == share.Id);

    if (existing != null)
        return Results.BadRequest("Already saved to your collection");

    // Can't save your own loadout
    if (share.OwnerUserId == userId)
        return Results.BadRequest("Cannot save your own loadout");

    var savedShare = new SavedShare
    {
        UserId = userId,
        LoadoutShareId = share.Id,
        SavedAt = DateTime.UtcNow
    };

    db.SavedShares.Add(savedShare);
    await db.SaveChangesAsync();

    // Get owner name if attribution is enabled
    string? ownerName = null;
    if (share.ShowAttribution)
    {
        var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
        ownerName = owner?.DiscordUsername;
    }

    return Results.Ok(new SavedShareResponse(
        savedShare.Id,
        share.ShareToken,
        share.Loadout.Name,
        ownerName,
        savedShare.SavedAt
    ));
})
.RequireAuthorization()
.WithName("SaveShare");

// GET /api/saved-shares - List user's saved shares
app.MapGet("/api/saved-shares", async (
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb) =>
{
    var userId = GetUserId(user);

    var savedShares = await db.SavedShares
        .Where(s => s.UserId == userId)
        .Include(s => s.LoadoutShare)
        .ThenInclude(ls => ls.Loadout)
        .ToListAsync();

    var results = new List<SavedShareResponse>();
    foreach (var saved in savedShares)
    {
        string? ownerName = null;
        if (saved.LoadoutShare.ShowAttribution)
        {
            var owner = await identityDb.Users.FindAsync(saved.LoadoutShare.OwnerUserId);
            ownerName = owner?.DiscordUsername;
        }

        results.Add(new SavedShareResponse(
            saved.Id,
            saved.LoadoutShare.ShareToken,
            saved.LoadoutShare.Loadout.Name,
            ownerName,
            saved.SavedAt
        ));
    }

    return Results.Ok(results);
})
.RequireAuthorization()
.WithName("GetSavedShares");

// DELETE /api/saved-shares/{id} - Remove from saved
app.MapDelete("/api/saved-shares/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var savedShare = await db.SavedShares.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
    if (savedShare == null)
        return Results.NotFound("Saved share not found");

    db.SavedShares.Remove(savedShare);
    await db.SaveChangesAsync();

    return Results.Ok();
})
.RequireAuthorization()
.WithName("RemoveSavedShare");

// === Folder Sharing Endpoints ===

// POST /api/folders/{id}/share - Create folder share link
app.MapPost("/api/folders/{id}/share", async (
    int id,
    CreateShareRequest request,
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    AppLimits limits) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
    if (folder == null)
        return Results.NotFound("Folder not found");

    // Cannot share root folder
    if (folder.ParentId == null)
        return Results.BadRequest("Cannot share root folder");

    // Check share count limit per folder
    var shareCount = await db.FolderShares.CountAsync(s => s.FolderId == id);
    if (shareCount >= limits.MaxSharesPerLoadout)
        return Results.BadRequest($"Maximum shares per folder ({limits.MaxSharesPerLoadout}) reached");

    // Validate expiration hours
    if (request.ExpiresInHours.HasValue &&
        (request.ExpiresInHours.Value < 1 || request.ExpiresInHours.Value > limits.MaxShareExpirationHours))
        return Results.BadRequest($"Expiration must be between 1 and {limits.MaxShareExpirationHours} hours");

    // Get user's unlocked chapters
    var unlockedChapters = new List<int> { 0 };
    var appUser = await identityDb.Users.FindAsync(userId);
    if (appUser?.Settings != null)
    {
        try
        {
            var settings = System.Text.Json.JsonSerializer.Deserialize<UserSettings>(appUser.Settings);
            if (settings?.UnlockedChapters?.Count > 0)
            {
                unlockedChapters = settings.UnlockedChapters;
            }
        }
        catch
        {
            // Use default
        }
    }

    // Generate unique token (retry on collision)
    string token;
    do
    {
        token = GenerateShareToken();
    } while (await db.FolderShares.AnyAsync(s => s.ShareToken == token) ||
             await db.LoadoutShares.AnyAsync(s => s.ShareToken == token));

    var share = new FolderShare
    {
        FolderId = id,
        OwnerUserId = userId,
        ShareToken = token,
        CreatedAt = DateTime.UtcNow,
        ExpiresAt = request.ExpiresInHours.HasValue
            ? DateTime.UtcNow.AddHours(request.ExpiresInHours.Value)
            : null,
        ShowAttribution = request.ShowAttribution
    };
    share.SetUnlockedChapters(unlockedChapters);

    db.FolderShares.Add(share);
    await db.SaveChangesAsync();

    return Results.Ok(new FolderShareResponse(
        share.Id,
        share.ShareToken,
        share.CreatedAt,
        share.ExpiresAt,
        share.ShowAttribution
    ));
})
.RequireAuthorization()
.WithName("CreateFolderShare");

// GET /api/folders/{id}/shares - List active shares for folder
app.MapGet("/api/folders/{id}/shares", async (int id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
    if (folder == null)
        return Results.NotFound("Folder not found");

    var shares = await db.FolderShares
        .Where(s => s.FolderId == id && s.OwnerUserId == userId)
        .Select(s => new FolderShareResponse(
            s.Id,
            s.ShareToken,
            s.CreatedAt,
            s.ExpiresAt,
            s.ShowAttribution
        ))
        .ToListAsync();

    return Results.Ok(shares);
})
.RequireAuthorization()
.WithName("GetFolderShares");

// GET /api/folder-shares - List all folder shares for current user
app.MapGet("/api/folder-shares", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);

    var shares = await db.FolderShares
        .Where(s => s.OwnerUserId == userId)
        .Include(s => s.Folder)
        .Select(s => new UserFolderShareResponse(
            s.Id,
            s.ShareToken,
            s.FolderId,
            s.Folder.Name,
            s.CreatedAt,
            s.ExpiresAt,
            s.ShowAttribution
        ))
        .ToListAsync();

    return Results.Ok(shares);
})
.RequireAuthorization()
.WithName("GetAllUserFolderShares");

// DELETE /api/folder-shares/{shareId} - Revoke folder share link
app.MapDelete("/api/folder-shares/{shareId}", async (int shareId, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    var share = await db.FolderShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
    if (share == null)
        return Results.NotFound("Share not found");

    db.FolderShares.Remove(share);
    await db.SaveChangesAsync();

    return Results.Ok();
})
.RequireAuthorization()
.WithName("RevokeFolderShare");

// Helper function to build folder tree for shared folder
SharedFolderNode BuildSharedFolderTree(
    Folder folder,
    List<Folder> allFolders,
    List<Loadout> allLoadouts,
    HashSet<int> unlockedChapters,
    IEnumerable<IncrelutionAction> allActions)
{
    // Build chapter lookup for filtering loadout data
    var chapterLookup = new Dictionary<int, Dictionary<int, int>>();
    foreach (var action in allActions)
    {
        if (!chapterLookup.ContainsKey(action.Type))
            chapterLookup[action.Type] = new Dictionary<int, int>();
        chapterLookup[action.Type][action.OriginalId] = action.Chapter;
    }

    var subFolders = allFolders
        .Where(f => f.ParentId == folder.Id)
        .Select(f => BuildSharedFolderTree(f, allFolders, allLoadouts, unlockedChapters, allActions))
        .ToList();

    var loadouts = allLoadouts
        .Where(l => l.FolderId == folder.Id)
        .Select(l => new SharedLoadoutSummary(l.Id, l.Name, l.UpdatedAt))
        .ToList();

    return new SharedFolderNode(folder.Id, folder.Name, subFolders, loadouts);
}

// GET /api/share/folder/{token} - View shared folder (public, cached)
app.MapGet("/api/share/folder/{token}", async (
    string token,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    GameDataService gameData) =>
{
    var share = await db.FolderShares
        .Include(s => s.Folder)
        .FirstOrDefaultAsync(s => s.ShareToken == token);

    if (share == null)
        return Results.NotFound(new SharedFolderErrorResponse("Share not found"));

    // Check expiration
    if (share.ExpiresAt.HasValue && share.ExpiresAt.Value < DateTime.UtcNow)
        return Results.BadRequest(new SharedFolderErrorResponse("This share link has expired"));

    // Get owner name if attribution is enabled
    string? ownerName = null;
    if (share.ShowAttribution)
    {
        var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
        ownerName = owner?.DiscordUsername;
    }

    // Load all folders and loadouts recursively under this folder
    var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
    var allLoadouts = await db.Loadouts.Where(l => l.UserId == share.OwnerUserId).ToListAsync();

    // Collect all folder IDs including the shared folder and its descendants
    var folderIds = new HashSet<int>();
    void CollectFolderIds(int folderId)
    {
        folderIds.Add(folderId);
        foreach (var sub in allFolders.Where(f => f.ParentId == folderId))
        {
            CollectFolderIds(sub.Id);
        }
    }
    CollectFolderIds(share.FolderId);

    // Filter to only folders in the shared tree
    var foldersInTree = allFolders.Where(f => folderIds.Contains(f.Id)).ToList();
    var loadoutsInTree = allLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();

    // Build the tree
    var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
    var allActions = gameData.GetAllActions();
    var folderTree = BuildSharedFolderTree(share.Folder, foldersInTree, loadoutsInTree, unlockedChapters, allActions);

    // Find the most recent update time among all loadouts
    var latestUpdate = loadoutsInTree.Any()
        ? loadoutsInTree.Max(l => l.UpdatedAt)
        : share.CreatedAt;

    return Results.Ok(new SharedFolderResponse(
        share.Folder.Name,
        folderTree,
        latestUpdate,
        ownerName
    ));
})
.RequireRateLimiting("public-or-api")
.CacheOutput("SharedLoadout")
.WithName("GetSharedFolder");

// GET /api/share/folder/{token}/loadout/{loadoutId} - Get specific loadout data from shared folder
app.MapGet("/api/share/folder/{token}/loadout/{loadoutId}", async (
    string token,
    int loadoutId,
    AppDbContext db,
    GameDataService gameData) =>
{
    var share = await db.FolderShares
        .Include(s => s.Folder)
        .FirstOrDefaultAsync(s => s.ShareToken == token);

    if (share == null)
        return Results.NotFound(new SharedFolderErrorResponse("Share not found"));

    // Check expiration
    if (share.ExpiresAt.HasValue && share.ExpiresAt.Value < DateTime.UtcNow)
        return Results.BadRequest(new SharedFolderErrorResponse("This share link has expired"));

    // Verify loadout is in the shared folder tree
    var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
    var folderIds = new HashSet<int>();
    void CollectFolderIds(int folderId)
    {
        folderIds.Add(folderId);
        foreach (var sub in allFolders.Where(f => f.ParentId == folderId))
        {
            CollectFolderIds(sub.Id);
        }
    }
    CollectFolderIds(share.FolderId);

    var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == loadoutId && folderIds.Contains(l.FolderId));
    if (loadout == null)
        return Results.NotFound(new SharedFolderErrorResponse("Loadout not found in shared folder"));

    // Filter loadout data by sharer's unlocked chapters
    var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
    var allActions = gameData.GetAllActions();
    var loadoutData = loadout.GetData();
    var filteredData = FilterLoadoutByChapters(loadoutData, allActions, unlockedChapters);

    return Results.Ok(new SharedFolderLoadoutResponse(
        loadout.Name,
        filteredData,
        loadout.UpdatedAt
    ));
})
.RequireRateLimiting("public-or-api")
.CacheOutput("SharedLoadout")
.WithName("GetSharedFolderLoadout");

// POST /api/share/folder/{token}/save - Save folder to "Others' Loadouts"
app.MapPost("/api/share/folder/{token}/save", async (
    string token,
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    AppLimits limits) =>
{
    var userId = GetUserId(user);

    // Check saved share limit
    var savedCount = await db.SavedShares.CountAsync(s => s.UserId == userId);
    if (savedCount >= limits.MaxSavedSharesPerUser)
        return Results.BadRequest($"Maximum saved shares ({limits.MaxSavedSharesPerUser}) reached");

    var share = await db.FolderShares
        .Include(s => s.Folder)
        .FirstOrDefaultAsync(s => s.ShareToken == token);

    if (share == null)
        return Results.NotFound("Share not found");

    // Check expiration
    if (share.ExpiresAt.HasValue && share.ExpiresAt.Value < DateTime.UtcNow)
        return Results.BadRequest("This share link has expired");

    // Check if already saved
    var existing = await db.SavedShares
        .FirstOrDefaultAsync(s => s.UserId == userId && s.FolderShareId == share.Id);

    if (existing != null)
        return Results.BadRequest("Already saved to your collection");

    // Can't save your own folder
    if (share.OwnerUserId == userId)
        return Results.BadRequest("Cannot save your own folder");

    var savedShare = new SavedShare
    {
        UserId = userId,
        FolderShareId = share.Id,
        SavedAt = DateTime.UtcNow
    };

    db.SavedShares.Add(savedShare);
    await db.SaveChangesAsync();

    // Get owner name if attribution is enabled
    string? ownerName = null;
    if (share.ShowAttribution)
    {
        var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
        ownerName = owner?.DiscordUsername;
    }

    // Build folder tree for response
    var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
    var allLoadouts = await db.Loadouts.Where(l => l.UserId == share.OwnerUserId).ToListAsync();
    var folderIds = new HashSet<int>();
    void CollectFolderIds(int folderId)
    {
        folderIds.Add(folderId);
        foreach (var sub in allFolders.Where(f => f.ParentId == folderId))
        {
            CollectFolderIds(sub.Id);
        }
    }
    CollectFolderIds(share.FolderId);
    var foldersInTree = allFolders.Where(f => folderIds.Contains(f.Id)).ToList();
    var loadoutsInTree = allLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();
    var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());

    return Results.Ok(new SavedShareUnifiedResponse(
        savedShare.Id,
        share.ShareToken,
        "folder",
        share.Folder.Name,
        ownerName,
        savedShare.SavedAt,
        BuildSharedFolderTree(share.Folder, foldersInTree, loadoutsInTree, unlockedChapters, Array.Empty<IncrelutionAction>())
    ));
})
.RequireAuthorization()
.WithName("SaveFolderShare");

// GET /api/saved-shares/unified - List user's saved shares (both loadouts and folders)
app.MapGet("/api/saved-shares/unified", async (
    ClaimsPrincipal user,
    AppDbContext db,
    IdentityAppDbContext identityDb,
    GameDataService gameData) =>
{
    var userId = GetUserId(user);

    var savedShares = await db.SavedShares
        .Where(s => s.UserId == userId)
        .Include(s => s.LoadoutShare)
        .ThenInclude(ls => ls != null ? ls.Loadout : null)
        .Include(s => s.FolderShare)
        .ThenInclude(fs => fs != null ? fs.Folder : null)
        .ToListAsync();

    var results = new List<SavedShareUnifiedResponse>();
    var allActions = gameData.GetAllActions();

    foreach (var saved in savedShares)
    {
        string? ownerName = null;
        var showAttribution = saved.LoadoutShare?.ShowAttribution ?? saved.FolderShare?.ShowAttribution ?? true;
        var ownerUserId = saved.LoadoutShare?.OwnerUserId ?? saved.FolderShare?.OwnerUserId;

        if (showAttribution && ownerUserId.HasValue)
        {
            var owner = await identityDb.Users.FindAsync(ownerUserId.Value);
            ownerName = owner?.DiscordUsername;
        }

        if (saved.LoadoutShareId != null && saved.LoadoutShare != null)
        {
            results.Add(new SavedShareUnifiedResponse(
                saved.Id,
                saved.LoadoutShare.ShareToken,
                "loadout",
                saved.LoadoutShare.Loadout.Name,
                ownerName,
                saved.SavedAt,
                null
            ));
        }
        else if (saved.FolderShareId != null && saved.FolderShare != null)
        {
            // Build folder tree
            var allFolders = await db.Folders.Where(f => f.UserId == saved.FolderShare.OwnerUserId).ToListAsync();
            var allLoadouts = await db.Loadouts.Where(l => l.UserId == saved.FolderShare.OwnerUserId).ToListAsync();
            var folderIds = new HashSet<int>();
            void CollectFolderIds(int folderId)
            {
                folderIds.Add(folderId);
                foreach (var sub in allFolders.Where(f => f.ParentId == folderId))
                {
                    CollectFolderIds(sub.Id);
                }
            }
            CollectFolderIds(saved.FolderShare.FolderId);
            var foldersInTree = allFolders.Where(f => folderIds.Contains(f.Id)).ToList();
            var loadoutsInTree = allLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();
            var unlockedChapters = new HashSet<int>(saved.FolderShare.GetUnlockedChapters());

            results.Add(new SavedShareUnifiedResponse(
                saved.Id,
                saved.FolderShare.ShareToken,
                "folder",
                saved.FolderShare.Folder.Name,
                ownerName,
                saved.SavedAt,
                BuildSharedFolderTree(saved.FolderShare.Folder, foldersInTree, loadoutsInTree, unlockedChapters, allActions)
            ));
        }
    }

    return Results.Ok(results);
})
.RequireAuthorization()
.WithName("GetSavedSharesUnified");

// SPA fallback for client-side routing (production only)
if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();
