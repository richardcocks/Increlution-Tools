using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Loadouts",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Folders",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Backfill: set SortOrder = Id for existing rows to preserve insertion order
            migrationBuilder.Sql("UPDATE Loadouts SET SortOrder = Id");
            migrationBuilder.Sql("UPDATE Folders SET SortOrder = Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Loadouts");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Folders");
        }
    }
}
