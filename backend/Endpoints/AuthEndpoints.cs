using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class AuthEndpoints
{
    public static WebApplication MapAuthEndpoints(this WebApplication app)
    {
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
                    user = CreateNewUser(discordUser.Id, displayName, gameData);

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

        // POST /api/auth/dev/login - Development-only test user login
        // Requires both IsDevelopment() AND EnableDevLogin setting to be true
        if (app.Environment.IsDevelopment() && app.Configuration.GetValue<bool>("EnableDevLogin"))
        {
            app.MapPost("/api/auth/dev/login", async (
                DevLoginRequest request,
                IdentityAppDbContext identityDb,
                AppDbContext db,
                GameDataService gameData,
                HttpContext httpContext) =>
            {
                var username = request.Username?.Trim();
                if (string.IsNullOrEmpty(username))
                {
                    return Results.BadRequest("Username is required");
                }

                // Create a fake Discord ID from the username (deterministic so same user returns)
                var fakeDiscordId = $"dev_{username.ToLowerInvariant()}";

                // Find or create user
                var user = await identityDb.Users
                    .FirstOrDefaultAsync(u => u.DiscordId == fakeDiscordId);

                if (user == null)
                {
                    // New user - create account
                    user = CreateNewUser(fakeDiscordId, $"{username} (Dev)", gameData);

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

                return Results.Ok(new UserInfo(user.Id, user.DiscordUsername ?? username));
            })
            .WithName("DevLogin");
        }

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
            var userId = EndpointHelpers.GetUserId(user);
            var appUser = await identityDb.Users.FindAsync(userId);
            if (appUser == null)
                return Results.NotFound("User not found");

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

        return app;
    }

    /// <summary>
    /// Creates a new ApplicationUser with default settings initialized.
    /// Shared by Discord OAuth callback and dev login to avoid duplicate logic.
    /// </summary>
    private static ApplicationUser CreateNewUser(string discordId, string displayName, GameDataService gameData)
    {
        var user = new ApplicationUser
        {
            UserName = discordId,
            DiscordId = discordId,
            DiscordUsername = displayName,
            NormalizedUserName = discordId.ToUpperInvariant(),
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

        return user;
    }
}
