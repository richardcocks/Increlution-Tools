using IncrelutionAutomationEditor.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace IncrelutionAutomationEditor.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<Loadout> Loadouts => Set<Loadout>();
    public DbSet<LoadoutShare> LoadoutShares => Set<LoadoutShare>();
    public DbSet<FolderShare> FolderShares => Set<FolderShare>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // SQLite doesn't preserve DateTimeKind, so all DateTime values lose their UTC kind
        // when read back. This ensures they are always treated as UTC.
        configurationBuilder.Properties<DateTime>()
            .HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>()
            .HaveConversion<UtcNullableDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Folder relationships
        modelBuilder.Entity<Folder>()
            .HasOne(f => f.Parent)
            .WithMany(f => f.SubFolders)
            .HasForeignKey(f => f.ParentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Folder>()
            .HasMany(f => f.Loadouts)
            .WithOne(l => l.Folder)
            .HasForeignKey(l => l.FolderId)
            .OnDelete(DeleteBehavior.Cascade);

        // Loadout data stored as JSON text
        modelBuilder.Entity<Loadout>()
            .Property(l => l.Data)
            .HasColumnType("TEXT");

        // LoadoutShare relationships
        modelBuilder.Entity<LoadoutShare>()
            .HasOne(s => s.Loadout)
            .WithMany()
            .HasForeignKey(s => s.LoadoutId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<LoadoutShare>()
            .HasIndex(s => s.ShareToken)
            .IsUnique();

        // FolderShare relationships
        modelBuilder.Entity<FolderShare>()
            .HasOne(s => s.Folder)
            .WithMany()
            .HasForeignKey(s => s.FolderId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<FolderShare>()
            .HasIndex(s => s.ShareToken)
            .IsUnique();
    }
}

internal class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v,
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

internal class UtcNullableDateTimeConverter() : ValueConverter<DateTime?, DateTime?>(
    v => v,
    v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);
