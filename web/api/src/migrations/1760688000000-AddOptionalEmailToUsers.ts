import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOptionalEmailToUsers1760688000000 implements MigrationInterface {
  name = 'AddOptionalEmailToUsers1760688000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "email" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email_unique"
      ON "users" ("email")
      WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "email"
    `);
  }
}
