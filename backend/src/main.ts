import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody: true` lets us read the unparsed body for Stripe webhook
  // signature verification while every other route still gets JSON parsing.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const config = app.get(ConfigService);

  app.use(helmet());

  const origins = config.get<string>('CORS_ORIGINS', '');
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  app.enableCors({
    // Dev: allow any origin so Metro IP changes never block the app.
    origin: isProduction
      ? origins
        ? origins.split(',').map((o) => o.trim())
        : false
      : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(config.get<string>('PORT', '4000'));
  const host = config.get<string>('HOST', '0.0.0.0');
  await app.listen(port, host);
   
  console.log(`AI-Concierge backend listening on http://${host}:${port}`);
}

void bootstrap();
