using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShareUnlockedChapters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "UnlockedChapters",
                table: "LoadoutShares",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "UnlockedChapters",
                table: "LoadoutShares");
        }
    }
}
