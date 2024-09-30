import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from './auth/auth.module';
import { DiagramWsModule } from './diagram-ws/diagram-ws.module';
import { DiagramModule } from './diagram/diagram.module';
import { DiagramSessionModule } from './diagram-session/diagram-session.module';
import { Diagram } from "./diagram/entities/diagram.entity";
import { DiagramSession } from "./diagram-session/entities/diagram-session.entity";
import { User } from "./auth/entities/user.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env`,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          database: configService.get<string>('DB_NAME'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          //entities: ['/**/*.entity{.ts,.js}'],
          entities: [User, Diagram, DiagramSession],
          autoLoadEntities: true,
          synchronize: true,
        }
      },
      inject: [ConfigService],
    }),
    AuthModule,
    DiagramWsModule,
    DiagramModule,
    DiagramSessionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
