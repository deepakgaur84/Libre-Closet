import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Capsule } from '../../dal/entity/capsule.entity';
import { Garment } from '../../dal/entity/garment.entity';
import { User } from '../../dal/entity/user.entity';
import { GarmentService } from '../garment.service';
import { OutfitService } from '../outfit.service';
import {
  analyzeCapsule,
  CapsuleAnalysis,
  enumerateOutfits,
  outfitKey,
  pickDiverseOutfits,
} from './capsule-analysis';
import { getCapsuleTemplate } from './capsule-templates';

export interface CapsuleInput {
  name?: string;
  season?: string;
  targetSize?: number;
  neutralTarget?: number;
  quotas?: Record<string, number>;
}

@Injectable()
export class CapsuleService {
  constructor(
    @InjectRepository(Capsule)
    private readonly capsuleRepository: EntityRepository<Capsule>,
    @InjectRepository(User)
    private readonly userRepository: EntityRepository<User>,
    private readonly garmentService: GarmentService,
    private readonly outfitService: OutfitService,
  ) {}

  async findAll(userId?: number): Promise<Capsule[]> {
    const where = userId != null ? { owner: { id: userId } } : { owner: null };
    return this.capsuleRepository.find(where, {
      populate: ['garments', 'garments.photo'],
      orderBy: { id: 'DESC' },
    });
  }

  async findOne(id: number, userId?: number): Promise<Capsule> {
    const capsule = await this.capsuleRepository.findOne(id, {
      populate: ['garments', 'garments.photo'],
    });
    if (!capsule) throw new NotFoundException('Capsule not found');
    if (userId != null) {
      if (capsule.owner?.id !== userId) throw new ForbiddenException();
    } else if (capsule.owner != null) {
      throw new ForbiddenException();
    }
    return capsule;
  }

  async createFromTemplate(
    templateKey: string | undefined,
    input: CapsuleInput,
    userId?: number,
  ): Promise<Capsule> {
    const template = getCapsuleTemplate(templateKey);
    const capsule = this.capsuleRepository.create({
      name: input.name?.trim() || 'My capsule',
      season: input.season?.trim() || undefined,
      targetSize: template.targetSize,
      neutralTarget: template.neutralTarget,
      quotas: { ...template.quotas },
    });
    if (userId != null) {
      capsule.owner = (await this.userRepository.findOneOrFail(userId)) as any;
    }
    await this.capsuleRepository.getEntityManager().persistAndFlush(capsule);
    return capsule;
  }

  async update(
    id: number,
    input: CapsuleInput,
    userId?: number,
  ): Promise<Capsule> {
    const capsule = await this.findOne(id, userId);
    if (input.name !== undefined && input.name.trim()) {
      capsule.name = input.name.trim();
    }
    if (input.season !== undefined) {
      capsule.season = input.season.trim() || undefined;
    }
    if (input.targetSize !== undefined) {
      capsule.targetSize = clampInt(
        input.targetSize,
        1,
        500,
        capsule.targetSize,
      );
    }
    if (input.neutralTarget !== undefined) {
      capsule.neutralTarget = clampInt(
        input.neutralTarget,
        0,
        100,
        capsule.neutralTarget,
      );
    }
    if (input.quotas !== undefined) {
      capsule.quotas = input.quotas;
    }
    await this.capsuleRepository.getEntityManager().flush();
    return capsule;
  }

  async remove(id: number, userId?: number): Promise<void> {
    const capsule = await this.findOne(id, userId);
    await this.capsuleRepository.getEntityManager().removeAndFlush(capsule);
  }

  /** Replace the capsule's pieces with the given garment ids. */
  async setGarments(
    id: number,
    garmentIds: number[],
    userId?: number,
  ): Promise<Capsule> {
    const capsule = await this.findOne(id, userId);
    // only garments the user actually owns can be chosen
    const owned = await this.garmentService.findAll(userId);
    const allowed = new Set(garmentIds);
    capsule.garments.set(owned.filter((g) => allowed.has(g.id)));
    await this.capsuleRepository.getEntityManager().flush();
    return capsule;
  }

  analyze(capsule: Capsule): CapsuleAnalysis {
    return analyzeCapsule(capsule.garments.getItems().map(toAnalysisGarment), {
      quotas: capsule.quotas ?? {},
      targetSize: capsule.targetSize,
      neutralTarget: capsule.neutralTarget,
    });
  }

  /**
   * Saves up to `count` varied, wearable outfits from the capsule as normal
   * outfits. Combinations that already exist as an outfit are skipped.
   * Returns how many new outfits were created.
   */
  async generateOutfits(
    id: number,
    count: number,
    userId?: number,
  ): Promise<number> {
    const capsule = await this.findOne(id, userId);
    const garments = capsule.garments.getItems();
    const byId = new Map<number, Garment>(garments.map((g) => [g.id, g]));

    const existing = new Set(
      (await this.outfitService.findAll(userId)).map((o) =>
        outfitKey(o.garments.getItems().map((g) => g.id)),
      ),
    );
    const candidates = enumerateOutfits(garments.map(toAnalysisGarment)).filter(
      (ids) => !existing.has(outfitKey(ids)),
    );
    const chosen = pickDiverseOutfits(candidates, clampInt(count, 1, 50, 10));

    let created = 0;
    for (const ids of chosen) {
      const slots = ids.map((gid) => ({
        category: byId.get(gid)!.category,
        garmentId: gid,
      }));
      await this.outfitService.create(
        {
          name: `${capsule.name} #${existing.size + created + 1}`,
          slots,
        },
        userId,
      );
      created++;
    }
    return created;
  }
}

function toAnalysisGarment(g: Garment) {
  return {
    id: g.id,
    category: g.category,
    color: g.color as string | undefined,
  };
}

function clampInt(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
