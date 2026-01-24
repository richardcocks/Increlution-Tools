namespace IncrelutionAutomationEditor.Api.Configuration;

public class AppLimits
{
    public const string SectionName = "AppLimits";

    // Resource count limits per user
    public int MaxFoldersPerUser { get; set; } = 100;
    public int MaxLoadoutsPerUser { get; set; } = 500;
    public int MaxSharesPerLoadout { get; set; } = 5;
    public int MaxSavedSharesPerUser { get; set; } = 50;

    // Folder structure limits
    public int MaxFolderDepth { get; set; } = 8;

    // String length limits
    public int MaxFolderNameLength { get; set; } = 100;
    public int MaxLoadoutNameLength { get; set; } = 100;
    public int MaxEmailLength { get; set; } = 256;
    public int MaxPasswordLength { get; set; } = 128;
    public int MaxExplorationNameLength { get; set; } = 100;

    // Automation level limits
    public int MinAutomationLevel { get; set; } = 0;
    public int MaxAutomationLevel { get; set; } = 4;

    // Share expiration limits (in hours)
    public int MaxShareExpirationHours { get; set; } = 8760; // 1 year

    // Request size limits
    public int MaxLoadoutDataSizeBytes { get; set; } = 1048576; // 1 MB

    // Rate limiting - Auth endpoints (login/register)
    public int AuthRateLimitPermitCount { get; set; } = 5;        // requests allowed
    public int AuthRateLimitWindowSeconds { get; set; } = 60;     // per time window
    public int AuthRateLimitQueueLimit { get; set; } = 0;         // no queuing

    // Rate limiting - General API (token bucket for burst tolerance)
    public int ApiRateLimitTokenLimit { get; set; } = 200;        // max burst capacity
    public int ApiRateLimitTokensPerPeriod { get; set; } = 20;    // tokens added per period
    public int ApiRateLimitReplenishSeconds { get; set; } = 10;   // replenish period (20 tokens per 10s = 120/min sustained)
    public int ApiRateLimitQueueLimit { get; set; } = 20;         // queue when bucket empty

    // Rate limiting - Public endpoints for anonymous users (shared loadouts)
    public int PublicRateLimitPermitCount { get; set; } = 30;     // requests allowed
    public int PublicRateLimitWindowSeconds { get; set; } = 60;   // per time window
    public int PublicRateLimitQueueLimit { get; set; } = 5;       // allow some queuing
}
