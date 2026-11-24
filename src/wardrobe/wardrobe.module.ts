import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { Garment } from '../dal/entity/garment.entity';
import { Capsule } from '../dal/entity/capsule.entity';
import { Outfit } from '../dal/entity/outfit.entity';
import { OutfitCalendar } from '../dal/entity/outfit-calendar.entity';
import { User } from '../dal/entity/user.entity';
import { FileModule } from '../file/file.module';
import { AuthModule } from '../auth/auth.module';
import { WardrobeShareModule } from '../wardrobe-share/wardrobe-share.module';
import { GarmentService } from './garment.service';
import { OutfitService } from './outfit.service';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { WardrobeController } from './wardrobe.controller';
import { OutfitController } from './outfit.controller';
import { WeatherModule } from '../weather/weather.module';
import { CapsuleController } from './capsule/capsule.controller';
import { CapsuleService } from './capsule/capsule.service';

@Module({
  imports: [
    AuthModule,
    FileModule,
    WardrobeShareModule,
    MikroOrmModule.forFeature([Garment, Outfit, OutfitCalendar, Capsule, User]),
    WeatherModule,
  ],
  controllers: [
    WardrobeController,
    OutfitController,
    CalendarController,
    CapsuleController,
  ],
  providers: [GarmentService, OutfitService, CalendarService, CapsuleService],
  exports: [GarmentService, OutfitService, CalendarService, CapsuleService],
})
export class WardrobeModule {}
