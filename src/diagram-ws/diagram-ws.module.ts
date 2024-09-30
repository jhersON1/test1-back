import { Module } from '@nestjs/common';
import { DiagramWsService } from './diagram-ws.service';
import { DiagramWsGateway } from './diagram-ws.gateway';
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";

@Module({
  providers: [DiagramWsGateway, DiagramWsService],
  imports: [AuthModule]
})
export class DiagramWsModule {}
