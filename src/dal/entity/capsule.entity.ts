import {
  Collection,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryKey,
  Property,
  type Ref,
} from '@mikro-orm/core';
import { Garment } from './garment.entity';
import { User } from './user.entity';

/**
 * A capsule wardrobe: a small, deliberately chosen subset of the user's
 * garments that are meant to be mixed and matched.
 *
 * `quotas` maps a (lower-cased) garment category to the number of pieces the
 * user wants in the capsule, e.g. `{ "tops": 12, "bottoms": 7 }`.
 */
@Entity()
export class Capsule {
  @PrimaryKey()
  public id!: number;

  @Property()
  public name!: string;

  /** Free text such as "Winter", "Work" or "Travel". */
  @Property({ nullable: true })
  public season?: string;

  @Property({ default: 30 })
  public targetSize: number = 30;

  /** Desired share (0-100) of neutral-coloured pieces. */
  @Property({ default: 70 })
  public neutralTarget: number = 70;

  @Property({ type: 'json' })
  public quotas: Record<string, number> = {};

  @ManyToMany(() => Garment)
  public garments = new Collection<Garment>(this);

  @ManyToOne({
    entity: () => User,
    deleteRule: 'cascade',
    ref: true,
    nullable: true,
  })
  public owner?: Ref<User>;
}
