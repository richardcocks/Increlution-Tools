using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLoadoutProtection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsProtected",
                table: "Loadouts",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsProtected",
                table: "Loadouts");
        }
    }
}
