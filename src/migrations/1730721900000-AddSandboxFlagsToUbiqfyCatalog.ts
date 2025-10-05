import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSandboxFlagsToUbiqfyCatalog1730721900000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add is_sandbox to ubiqfy_products
        await queryRunner.addColumn('ubiqfy_products', new TableColumn({
            name: 'is_sandbox',
            type: 'boolean',
            isNullable: false,
            default: false,
        }));

        // Add is_sandbox to ubiqfy_product_options
        await queryRunner.addColumn('ubiqfy_product_options', new TableColumn({
            name: 'is_sandbox',
            type: 'boolean',
            isNullable: false,
            default: false,
        }));

        // Optional: add index for faster filtering
        try {
            await queryRunner.query('CREATE INDEX IDX_ubiqfy_products_is_sandbox ON ubiqfy_products(is_sandbox)');
        } catch { /* ignore */ }
        try {
            await queryRunner.query('CREATE INDEX IDX_ubiqfy_product_options_is_sandbox ON ubiqfy_product_options(is_sandbox)');
        } catch { /* ignore */ }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        try { await queryRunner.query('DROP INDEX IDX_ubiqfy_product_options_is_sandbox ON ubiqfy_product_options'); } catch { /* ignore */ }
        try { await queryRunner.query('DROP INDEX IDX_ubiqfy_products_is_sandbox ON ubiqfy_products'); } catch { /* ignore */ }
        await queryRunner.dropColumn('ubiqfy_product_options', 'is_sandbox');
        await queryRunner.dropColumn('ubiqfy_products', 'is_sandbox');
    }
}
