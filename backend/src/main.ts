import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { isIP } from 'node:net';
import { AppModule } from './app.module';
import { getAllowedOrigins } from './auth/auth-origin';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowedOrigins = getAllowedOrigins(frontendUrl, nodeEnv);
  const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (trustedProxyIps.some((ip) => !isIP(ip))) {
    throw new Error(
      'TRUSTED_PROXY_IPS must contain only comma-separated IP addresses.',
    );
  }

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  // Forwarded client addresses are trusted only from explicitly configured proxies.
  if (trustedProxyIps.length > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyIps);
  }

  // CORS configuration
  app.enableCors({
    origin: [...allowedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Documentation Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GoSwiftHR Intelligence API')
    .setDescription(
      'Production HR assessment, workforce analytics, ROI calculator, and lead generation API for GoSwiftHR.',
    )
    .setVersion('1.0.0')
    .addTag('Health', 'System health check and diagnostic endpoints')
    .addCookieAuth(
      'goswifthr_admin_session',
      { type: 'apiKey', in: 'cookie' },
      'admin-session',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');
  logger.log(`GoSwiftHR Intelligence Backend running on: http://localhost:${port}/api/v1`);
  logger.log(`Swagger OpenAPI Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
