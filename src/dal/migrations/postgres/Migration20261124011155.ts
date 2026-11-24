import { Migration } from '@mikro-orm/migrations';

export class Migration20261124011155 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "capsule" ("id" serial primary key, "name" varchar(255) not null, "season" varchar(255) null, "target_size" int not null default 30, "neutral_target" int not null default 70, "quotas" jsonb not null, "owner_id" int null);`);

    this.addSql(`create table "capsule_garments" ("capsule_id" int not null, "garment_id" int not null, constraint "capsule_garments_pkey" primary key ("capsule_id", "garment_id"));`);

    this.addSql(`alter table "capsule" add constraint "capsule_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "capsule_garments" add constraint "capsule_garments_capsule_id_foreign" foreign key ("capsule_id") references "capsule" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "capsule_garments" add constraint "capsule_garments_garment_id_foreign" foreign key ("garment_id") references "garment" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "capsule_garments" cascade;`);
    this.addSql(`drop table if exists "capsule" cascade;`);
  }

}
