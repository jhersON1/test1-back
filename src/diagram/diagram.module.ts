import { Module } from '@nestjs/common';
import { DiagramService } from './diagram.service';
import { DiagramController } from './diagram.controller';
import { TypeOrmModule } from "@nestjs/typeorm";
import { Diagram } from "./entities/diagram.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Diagram])],
  controllers: [DiagramController],
  providers: [DiagramService],
  exports: [DiagramService, TypeOrmModule],
})
export class DiagramModule {}
