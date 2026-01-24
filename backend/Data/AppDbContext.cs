using IncrelutionAutomationEditor.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<Loadout> Loadouts => Set<Loadout>();
    public DbSet<LoadoutShare> LoadoutShares => Set<LoadoutShare>();
    public DbSet<SavedShare> SavedShares => Set<SavedShare>();

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

        // SavedShare relationships
        modelBuilder.Entity<SavedShare>()
            .HasOne(s => s.LoadoutShare)
            .WithMany()
            .HasForeignKey(s => s.LoadoutShareId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SavedShare>()
            .HasIndex(s => new { s.UserId, s.LoadoutShareId })
            .IsUnique();
    }
}
