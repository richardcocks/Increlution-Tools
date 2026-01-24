using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFolderStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FolderId",
                table: "Loadouts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "UserId",
                table: "Loadouts",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Folders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    ParentId = table.Column<int>(type: "INTEGER", nullable: true),
                    UserId = table.Column<int>(type: "INTEGER", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Folders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Folders_Folders_ParentId",
                        column: x => x.ParentId,
                        principalTable: "Folders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Folders",
                columns: new[] { "Id", "CreatedAt", "Name", "ParentId", "UserId" },
                values: new object[] { 1, new DateTime(2026, 1, 18, 0, 0, 0, 0, DateTimeKind.Utc), "My Loadouts", null, null });

            // Update existing loadouts to point to the root folder
            migrationBuilder.Sql("UPDATE Loadouts SET FolderId = 1 WHERE FolderId = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Loadouts_FolderId",
                table: "Loadouts",
                column: "FolderId");

            migrationBuilder.CreateIndex(
                name: "IX_Folders_ParentId",
                table: "Folders",
                column: "ParentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Loadouts_Folders_FolderId",
                table: "Loadouts",
                column: "FolderId",
                principalTable: "Folders",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Loadouts_Folders_FolderId",
                table: "Loadouts");

            migrationBuilder.DropTable(
                name: "Folders");

            migrationBuilder.DropIndex(
                name: "IX_Loadouts_FolderId",
                table: "Loadouts");

            migrationBuilder.DropColumn(
                name: "FolderId",
                table: "Loadouts");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "Loadouts");
        }
    }
}
