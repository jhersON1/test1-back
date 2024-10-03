import { Module } from '@nestjs/common';
import { DiagramWsService } from './diagram-ws.service';
import { DiagramWsGateway } from './diagram-ws.gateway';
import { JwtModule, JwtService } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../auth/entities/user.entity";
import { DiagramSession } from "../diagram-session/entities/diagram-session.entity";
import { Diagram } from "../diagram/entities/diagram.entity";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DiagramService } from "../diagram/diagram.service";
import { AuthService } from "../auth/auth.service";
import { DiagramSessionService } from "../diagram-session/diagram-session.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([User, DiagramSession, Diagram]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [DiagramWsGateway, DiagramWsService, DiagramService, AuthService, DiagramSessionService],
  exports: [DiagramWsService],
})
export class DiagramWsModule {}
