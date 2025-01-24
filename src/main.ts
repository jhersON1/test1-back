import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService>(ConfigService);

  app.enableCors({
    origin: 'https://partial1.netlify.app', // Dominio del frontend
    methods: 'GET,POST,PUT,DELETE,OPTIONS', // Métodos HTTP permitidos
    credentials: true, // Si necesitas enviar cookies o cabeceras autorizadas
  });
  
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = configService.get<number>('PORT');
  await app.listen(port || 3000);
}

bootstrap();
