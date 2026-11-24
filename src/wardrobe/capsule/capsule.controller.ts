import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ConditionalAuthGuard } from '../../auth/conditional-auth.guard';
import { Payload } from '../../auth/dto/payload.dto';
import { GarmentService } from '../garment.service';
import {
  CapsuleAnalysis,
  CapsuleGap,
  normalizeCategory,
} from './capsule-analysis';
import {
  CAPSULE_TEMPLATES,
  DEFAULT_CAPSULE_TEMPLATE,
} from './capsule-templates';
import { CapsuleService } from './capsule.service';

type Many = string | string[] | undefined;

const toArray = (v: Many): string[] =>
  Array.isArray(v) ? v : v !== undefined && v !== '' ? [v] : [];

@UseGuards(ConditionalAuthGuard)
@Controller('capsules')
export class CapsuleController {
  constructor(
    private readonly capsuleService: CapsuleService,
    private readonly garmentService: GarmentService,
  ) {}

  private userId(req: FastifyRequest): number | undefined {
    return (req['user'] as Payload | undefined)?.userId;
  }

  private gapMessage(gap: CapsuleGap, i18n: I18nContext): string {
    const category = (cat: string) =>
      this.garmentService.resolveCategoryLabel(cat, i18n);
    const key = `lang.CAPSULE_GAP_${gap.code}`;
    switch (gap.code) {
      case 'MISSING_CORE':
      case 'NO_NEUTRAL_IN':
        return i18n.t(key, { args: { category: category(gap.category) } });
      case 'SHORT':
      case 'OVER':
        return i18n.t(key, {
          args: { count: gap.count, category: category(gap.category) },
        });
      case 'OVER_TOTAL':
        return i18n.t(key, { args: { count: gap.count } });
      case 'NEEDS_NEUTRALS':
        return i18n.t(key, {
          args: { percent: gap.percent, target: gap.target },
        });
    }
  }

  private summary(analysis: CapsuleAnalysis) {
    return {
      total: analysis.total,
      targetSize: analysis.targetSize,
      progressPercent: Math.min(
        100,
        Math.round((analysis.total / Math.max(1, analysis.targetSize)) * 100),
      ),
      outfitCount: analysis.outfitCount,
      neutralPercent: analysis.colors.neutralPercent,
      accentPercent: analysis.colors.accentPercent,
    };
  }

  @Get()
  @Render('capsules/index')
  async index(@Req() req: FastifyRequest) {
    const capsules = await this.capsuleService.findAll(this.userId(req));
    return {
      capsules: capsules.map((c) => ({
        id: c.id,
        name: c.name,
        season: c.season,
        ...this.summary(this.capsuleService.analyze(c)),
      })),
    };
  }

  @Get('new')
  @Render('capsules/new')
  newForm(@I18n() i18n: I18nContext) {
    return {
      defaultTemplate: DEFAULT_CAPSULE_TEMPLATE,
      templates: Object.values(CAPSULE_TEMPLATES).map((t) => ({
        key: t.key,
        label: i18n.t(`lang.CAPSULE_TEMPLATE_${t.key.toUpperCase()}`),
        selected: t.key === DEFAULT_CAPSULE_TEMPLATE,
        pieces: t.targetSize,
        categories: Object.entries(t.quotas).map(([cat, n]) => ({
          label: this.garmentService.resolveCategoryLabel(cat, i18n),
          count: n,
        })),
      })),
    };
  }

  @Post()
  async create(
    @Body() body: { name?: string; season?: string; template?: string },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const capsule = await this.capsuleService.createFromTemplate(
      body.template,
      { name: body.name, season: body.season },
      this.userId(req),
    );
    return reply.redirect(`/capsules/${capsule.id}/pieces`, 302);
  }

  @Get(':id')
  @Render('capsules/show')
  async show(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const capsule = await this.capsuleService.findOne(id, this.userId(req));
    const analysis = this.capsuleService.analyze(capsule);
    const weak = new Set(analysis.weakGarmentIds);

    const groups = new Map<string, any[]>();
    for (const g of capsule.garments.getItems()) {
      const key = normalizeCategory(g.category);
      const list = groups.get(key) ?? [];
      list.push({
        id: g.id,
        name: g.name,
        photo: g.photo,
        colors: g.color,
        outfits: analysis.usage[g.id] ?? 0,
        weak: weak.has(g.id),
      });
      groups.set(key, list);
    }

    return {
      capsule: {
        id: capsule.id,
        name: capsule.name,
        season: capsule.season,
        neutralTarget: capsule.neutralTarget,
      },
      summary: this.summary(analysis),
      hasOutfits: analysis.outfitCount > 0,
      categories: analysis.categories.map((c) => ({
        ...c,
        label: this.garmentService.resolveCategoryLabel(c.category, i18n),
        ok: c.status === 'ok',
        short: c.status === 'short',
        over: c.status === 'over',
        unplanned: c.status === 'unplanned',
        percent:
          c.quota > 0
            ? Math.min(100, Math.round((c.count / c.quota) * 100))
            : 100,
      })),
      gaps: analysis.gaps.map((g) => this.gapMessage(g, i18n)),
      groups: [...groups.entries()].map(([category, garments]) => ({
        label: this.garmentService.resolveCategoryLabel(category, i18n),
        garments,
      })),
      colorCounts: analysis.colors,
      hasPieces: analysis.total > 0,
    };
  }

  @Get(':id/edit')
  @Render('capsules/edit')
  async editForm(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const capsule = await this.capsuleService.findOne(id, this.userId(req));
    const analysis = this.capsuleService.analyze(capsule);
    // every planned category plus any category the pieces already use
    const rows = analysis.categories.map((c) => ({
      category: c.category,
      label: this.garmentService.resolveCategoryLabel(c.category, i18n),
      quota: capsule.quotas?.[c.category] ?? c.quota,
    }));
    return {
      capsule: {
        id: capsule.id,
        name: capsule.name,
        season: capsule.season,
        targetSize: capsule.targetSize,
        neutralTarget: capsule.neutralTarget,
      },
      rows,
    };
  }

  @Post(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      season?: string;
      targetSize?: string;
      neutralTarget?: string;
      quotaCategory?: Many;
      quotaCount?: Many;
    },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const categories = toArray(body.quotaCategory);
    const counts = toArray(body.quotaCount);
    const quotas: Record<string, number> = {};
    categories.forEach((cat, i) => {
      const key = normalizeCategory(cat);
      const n = Math.max(0, Math.floor(Number(counts[i])));
      if (key && Number.isFinite(n) && n > 0) {
        quotas[key] = (quotas[key] ?? 0) + n;
      }
    });
    await this.capsuleService.update(
      id,
      {
        name: body.name,
        season: body.season,
        targetSize:
          body.targetSize !== undefined ? Number(body.targetSize) : undefined,
        neutralTarget:
          body.neutralTarget !== undefined
            ? Number(body.neutralTarget)
            : undefined,
        quotas,
      },
      this.userId(req),
    );
    return reply.redirect(`/capsules/${id}`, 302);
  }

  @Get(':id/pieces')
  @Render('capsules/pieces')
  async pieces(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @I18n() i18n: I18nContext,
  ) {
    const capsule = await this.capsuleService.findOne(id, this.userId(req));
    const garments = await this.garmentService.findAll(this.userId(req));
    const inCapsule = new Set(capsule.garments.getItems().map((g) => g.id));

    const groups = new Map<string, any[]>();
    for (const g of garments) {
      const key = normalizeCategory(g.category);
      const list = groups.get(key) ?? [];
      list.push({
        id: g.id,
        name: g.name,
        photo: g.photo,
        colors: g.color,
        selected: inCapsule.has(g.id),
      });
      groups.set(key, list);
    }
    return {
      capsule: { id: capsule.id, name: capsule.name },
      empty: garments.length === 0,
      groups: [...groups.entries()].map(([category, items]) => ({
        label: this.garmentService.resolveCategoryLabel(category, i18n),
        garments: items,
      })),
    };
  }

  @Post(':id/pieces')
  async savePieces(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { garmentId?: Many },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const ids = toArray(body.garmentId)
      .map(Number)
      .filter((n) => Number.isInteger(n));
    await this.capsuleService.setGarments(id, ids, this.userId(req));
    return reply.redirect(`/capsules/${id}`, 302);
  }

  @Post(':id/generate')
  async generate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { count?: string },
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.capsuleService.generateOutfits(
      id,
      Number(body.count ?? 10),
      this.userId(req),
    );
    return reply.redirect('/outfits', 302);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.capsuleService.remove(id, this.userId(req));
    reply.header('HX-Redirect', '/capsules');
    return reply.send();
  }
}
