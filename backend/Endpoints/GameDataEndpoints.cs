using IncrelutionAutomationEditor.Api.Services;

namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class GameDataEndpoints
{
    public static WebApplication MapGameDataEndpoints(this WebApplication app)
    {
        // GET /api/actions - Get all Increlution actions (from in-memory data)
        app.MapGet("/api/actions", (HttpContext ctx, GameDataService gameData) =>
        {
            var ifNoneMatch = ctx.Request.Headers.IfNoneMatch.ToString();
            if (ifNoneMatch == gameData.ETag)
            {
                ctx.Response.Headers.ETag = gameData.ETag;
                ctx.Response.Headers.CacheControl = "public, max-age=86400";
                return Results.StatusCode(304);
            }
            ctx.Response.Headers.ETag = gameData.ETag;
            ctx.Response.Headers.CacheControl = "public, max-age=86400";
            return Results.Ok(gameData.GetAllActions());
        })
        .RequireRateLimiting("public-or-api")
        .WithName("GetActions");

        // GET /api/skills - Get all skills (from in-memory data)
        app.MapGet("/api/skills", (HttpContext ctx, GameDataService gameData) =>
        {
            var ifNoneMatch = ctx.Request.Headers.IfNoneMatch.ToString();
            if (ifNoneMatch == gameData.ETag)
            {
                ctx.Response.Headers.ETag = gameData.ETag;
                ctx.Response.Headers.CacheControl = "public, max-age=86400";
                return Results.StatusCode(304);
            }
            ctx.Response.Headers.ETag = gameData.ETag;
            ctx.Response.Headers.CacheControl = "public, max-age=86400";
            return Results.Ok(gameData.GetAllSkills());
        })
        .RequireRateLimiting("public-or-api")
        .WithName("GetSkills");

        return app;
    }
}
