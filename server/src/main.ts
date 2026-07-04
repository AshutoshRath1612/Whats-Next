import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  const config = app.get(ConfigService);
  const requestBodyLimit = config.get<string>("REQUEST_BODY_LIMIT", "100mb");

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.get<string>("CLIENT_URL", "http://localhost:3000"),
    credentials: true
  });
  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ limit: requestBodyLimit, extended: true }));
  app.use(helmet());
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
