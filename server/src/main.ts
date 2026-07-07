import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get(ConfigService);
  const requestBodyLimit = config.get<string>("REQUEST_BODY_LIMIT", "100mb");

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: parseCorsOrigins(config.get<string>("CORS_ORIGINS") ?? config.get<string>("CLIENT_URL", "http://localhost:3000")),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 86_400
  });
  app.use(helmet());
  app.use(compression({ threshold: 1024 }));
  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ limit: requestBodyLimit, extended: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  await app.listen(config.get<number>("PORT", 4000));
}

void bootstrap();

function parseCorsOrigins(value: string) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}
