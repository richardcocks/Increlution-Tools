using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFolderSharing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SavedShares_UserId_LoadoutShareId",
                table: "SavedShares");

            migrationBuilder.AlterColumn<int>(
                name: "LoadoutShareId",
                table: "SavedShares",
                type: "INTEGER",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AddColumn<int>(
                name: "FolderShareId",
                table: "SavedShares",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FolderShares",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FolderId = table.Column<int>(type: "INTEGER", nullable: false),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    ShareToken = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    ShowAttribution = table.Column<bool>(type: "INTEGER", nullable: false),
                    UnlockedChapters = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FolderShares", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FolderShares_Folders_FolderId",
                        column: x => x.FolderId,
                        principalTable: "Folders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_FolderShareId",
                table: "SavedShares",
                column: "FolderShareId");

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

            migrationBuilder.AddCheckConstraint(
                name: "CK_SavedShare_OneShareType",
                table: "SavedShares",
                sql: "([LoadoutShareId] IS NOT NULL AND [FolderShareId] IS NULL) OR ([LoadoutShareId] IS NULL AND [FolderShareId] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_FolderShares_FolderId",
                table: "FolderShares",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_FolderShares_ShareToken",
                table: "FolderShares",
                column: "ShareToken",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_SavedShares_FolderShares_FolderShareId",
                table: "SavedShares",
                column: "FolderShareId",
                principalTable: "FolderShares",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SavedShares_FolderShares_FolderShareId",
                table: "SavedShares");

            migrationBuilder.DropTable(
                name: "FolderShares");

            migrationBuilder.DropIndex(
                name: "IX_SavedShares_FolderShareId",
                table: "SavedShares");

            migrationBuilder.DropIndex(
                name: "IX_SavedShares_UserId_FolderShareId",
                table: "SavedShares");

            migrationBuilder.DropIndex(
                name: "IX_SavedShares_UserId_LoadoutShareId",
                table: "SavedShares");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SavedShare_OneShareType",
                table: "SavedShares");

            migrationBuilder.DropColumn(
                name: "FolderShareId",
                table: "SavedShares");

            migrationBuilder.AlterColumn<int>(
                name: "LoadoutShareId",
                table: "SavedShares",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedShares_UserId_LoadoutShareId",
                table: "SavedShares",
                columns: new[] { "UserId", "LoadoutShareId" },
                unique: true);
        }
    }
}
