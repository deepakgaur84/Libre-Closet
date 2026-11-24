import { Migration } from '@mikro-orm/migrations';

export class Migration20261124011154 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`capsule\` (\`id\` integer not null primary key autoincrement, \`name\` text not null, \`season\` text null, \`target_size\` integer not null default 30, \`neutral_target\` integer not null default 70, \`quotas\` json not null, \`owner_id\` integer null, constraint \`capsule_owner_id_foreign\` foreign key(\`owner_id\`) references \`user\`(\`id\`) on delete cascade on update cascade);`);
    this.addSql(`create index \`capsule_owner_id_index\` on \`capsule\` (\`owner_id\`);`);

    this.addSql(`create table \`capsule_garments\` (\`capsule_id\` integer not null, \`garment_id\` integer not null, constraint \`capsule_garments_capsule_id_foreign\` foreign key(\`capsule_id\`) references \`capsule\`(\`id\`) on delete cascade on update cascade, constraint \`capsule_garments_garment_id_foreign\` foreign key(\`garment_id\`) references \`garment\`(\`id\`) on delete cascade on update cascade, primary key (\`capsule_id\`, \`garment_id\`));`);
    this.addSql(`create index \`capsule_garments_capsule_id_index\` on \`capsule_garments\` (\`capsule_id\`);`);
    this.addSql(`create index \`capsule_garments_garment_id_index\` on \`capsule_garments\` (\`garment_id\`);`);
  }

}
