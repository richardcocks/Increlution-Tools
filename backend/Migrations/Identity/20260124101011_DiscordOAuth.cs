using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations.Identity
{
    /// <inheritdoc />
    public partial class DiscordOAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DiscordId",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "DiscordUsername",
                table: "AspNetUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_DiscordId",
                table: "AspNetUsers",
                column: "DiscordId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_DiscordId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DiscordId",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DiscordUsername",
                table: "AspNetUsers");
        }
    }
}
