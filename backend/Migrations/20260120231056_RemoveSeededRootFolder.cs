using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveSeededRootFolder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Delete all anonymous loadouts (those with null UserId)
            migrationBuilder.Sql("DELETE FROM Loadouts WHERE UserId IS NULL;");

            // Delete all anonymous folders (those with null UserId)
            migrationBuilder.Sql("DELETE FROM Folders WHERE UserId IS NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Folders",
                columns: new[] { "Id", "CreatedAt", "Name", "ParentId", "UserId" },
                values: new object[] { 1, new DateTime(2026, 1, 18, 0, 0, 0, 0, DateTimeKind.Utc), "My Loadouts", null, null });
        }
    }
}
