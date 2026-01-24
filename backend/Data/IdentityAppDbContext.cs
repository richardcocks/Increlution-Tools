using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Data;

public class ApplicationUser : IdentityUser<int>
{
    /// <summary>
    /// Discord user ID (snowflake)
    /// </summary>
    public string DiscordId { get; set; } = string.Empty;

    /// <summary>
    /// Discord username for display
    /// </summary>
    public string? DiscordUsername { get; set; }

    /// <summary>
    /// JSON-serialized user settings
    /// </summary>
    public string? Settings { get; set; }
}

public class IdentityAppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<int>, int>
{
    public IdentityAppDbContext(DbContextOptions<IdentityAppDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Add unique index on DiscordId for fast lookups
        builder.Entity<ApplicationUser>()
            .HasIndex(u => u.DiscordId)
            .IsUnique();
    }
}
