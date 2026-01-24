using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLoadoutSharing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LoadoutShares",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    LoadoutId = table.Column<int>(type: "INTEGER", nullable: false),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    ShareToken = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    ViewLimit = table.Column<int>(type: "INTEGER", nullable: true),
                    ViewCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ShowAttribution = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoadoutShares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LoadoutShares_Loadouts_LoadoutId",
                        column: x => x.LoadoutId,
                        principalTable: "Loadouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SavedShares",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    LoadoutShareId = table.Column<int>(type: "INTEGER", nullable: false),
                    SavedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedShares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SavedShares_LoadoutShares_LoadoutShareId",
                        column: x => x.LoadoutShareId,
                        principalTable: "LoadoutShares",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LoadoutShares_LoadoutId",
                table: "LoadoutShares",
                column: "LoadoutId");

            migrationBuilder.CreateIndex(
                name: "IX_LoadoutShares_ShareToken",
                table: "LoadoutShares",
                column: "ShareToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_LoadoutShareId",
                table: "SavedShares",
                column: "LoadoutShareId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_UserId_LoadoutShareId",
                table: "SavedShares",
                columns: new[] { "UserId", "LoadoutShareId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedShares");

            migrationBuilder.DropTable(
                name: "LoadoutShares");
        }
    }
}
