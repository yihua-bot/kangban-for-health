import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCreatorRoleToHealthTasks1773917600000 implements MigrationInterface {
  name = 'AddCreatorRoleToHealthTasks1773917600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_tasks"
      ADD COLUMN IF NOT EXISTS "creator_role" character varying(20) NOT NULL DEFAULT 'self'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "health_tasks"
      DROP COLUMN IF EXISTS "creator_role"
    `);
  }
}
