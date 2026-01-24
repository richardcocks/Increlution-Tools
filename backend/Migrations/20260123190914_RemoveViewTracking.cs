using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveViewTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ViewCount",
                table: "LoadoutShares");

            migrationBuilder.DropColumn(
                name: "ViewLimit",
                table: "LoadoutShares");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ViewCount",
                table: "LoadoutShares",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ViewLimit",
                table: "LoadoutShares",
                type: "INTEGER",
                nullable: true);
        }
    }
}
