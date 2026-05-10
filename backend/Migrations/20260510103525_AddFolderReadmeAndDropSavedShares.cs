using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFolderReadmeAndDropSavedShares : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SavedShares");

            migrationBuilder.AddColumn<string>(
                name: "Readme",
                table: "Folders",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Readme",
                table: "Folders");

            migrationBuilder.CreateTable(
                name: "SavedShares",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FolderShareId = table.Column<int>(type: "INTEGER", nullable: true),
                    LoadoutShareId = table.Column<int>(type: "INTEGER", nullable: true),
                    SavedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UserId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedShares", x => x.Id);
                    table.CheckConstraint("CK_SavedShare_OneShareType", "([LoadoutShareId] IS NOT NULL AND [FolderShareId] IS NULL) OR ([LoadoutShareId] IS NULL AND [FolderShareId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_SavedShares_FolderShares_FolderShareId",
                        column: x => x.FolderShareId,
                        principalTable: "FolderShares",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SavedShares_LoadoutShares_LoadoutShareId",
                        column: x => x.LoadoutShareId,
                        principalTable: "LoadoutShares",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_FolderShareId",
                table: "SavedShares",
                column: "FolderShareId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_LoadoutShareId",
                table: "SavedShares",
                column: "LoadoutShareId");

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_UserId_FolderShareId",
                table: "SavedShares",
                columns: new[] { "UserId", "FolderShareId" },
                unique: true,
                filter: "[FolderShareId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_UserId_LoadoutShareId",
                table: "SavedShares",
                columns: new[] { "UserId", "LoadoutShareId" },
                unique: true,
                filter: "[LoadoutShareId] IS NOT NULL");
        }
    }
}
