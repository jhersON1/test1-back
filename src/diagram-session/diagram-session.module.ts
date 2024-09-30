import { Module } from '@nestjs/common';
import { DiagramSessionService } from './diagram-session.service';
import { DiagramSessionController } from './diagram-session.controller';
import { TypeOrmModule } from "@nestjs/typeorm";
import { DiagramSession } from "./entities/diagram-session.entity";
import { DiagramModule } from "../diagram/diagram.module";
import { DiagramService } from "../diagram/diagram.service";
import { Diagram } from "../diagram/entities/diagram.entity";


@Module({
  imports: [TypeOrmModule.forFeature([DiagramSession, Diagram]), DiagramModule],
  controllers: [DiagramSessionController],
  providers: [DiagramSessionService],
  exports: [DiagramSessionService],
})
export class DiagramSessionModule {}
