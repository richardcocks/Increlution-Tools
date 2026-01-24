using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IncrelutionAutomationEditor.Api.Migrations
{
    /// <inheritdoc />
    public partial class RefactorLoadoutStructure : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LoadoutActionSettings");

            migrationBuilder.AddColumn<string>(
                name: "Data",
                table: "Loadouts",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Data",
                table: "Loadouts");

            migrationBuilder.CreateTable(
                name: "LoadoutActionSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    LoadoutId = table.Column<int>(type: "INTEGER", nullable: false),
                    ActionId = table.Column<int>(type: "INTEGER", nullable: false),
                    AutomationLevel = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoadoutActionSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LoadoutActionSettings_Loadouts_LoadoutId",
                        column: x => x.LoadoutId,
                        principalTable: "Loadouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LoadoutActionSettings_LoadoutId",
                table: "LoadoutActionSettings",
                column: "LoadoutId");
        }
    }
}
