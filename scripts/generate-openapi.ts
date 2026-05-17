import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder().setTitle('Stargate API').setVersion('1.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('docs/openapi.yaml', JSON.stringify(document, null, 2));
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
