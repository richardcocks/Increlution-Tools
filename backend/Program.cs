using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.Endpoints;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
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

// Add application services
builder.Services.AddSingleton<SettingsService>();
builder.Services.AddSingleton<ShareService>();
builder.Services.AddSingleton<FolderService>();
builder.Services.AddSingleton<LoadoutService>();

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
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();  // Must be after auth so we can check if user is authenticated
app.UseOutputCache();

// Serve static files (frontend) in production
if (!app.Environment.IsDevelopment())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// Map endpoint groups
app.MapAuthEndpoints();
app.MapFolderEndpoints();
app.MapLoadoutEndpoints();
app.MapSettingsEndpoints();
app.MapShareEndpoints();
app.MapGameDataEndpoints();

// SPA fallback for client-side routing (production only)
if (!app.Environment.IsDevelopment())
{
    app.MapFallbackToFile("index.html");
}

app.Run();
