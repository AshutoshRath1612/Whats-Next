import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { addFlowStep } from "../common/logging/request-flow-context";

type PrismaQueryEvent = {
  query: string;
  params: string;
  duration: number;
  target: string;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: [{ emit: "event", level: "query" }] });
    const prismaWithQueryEvents = this as unknown as {
      $on(event: "query", callback: (event: PrismaQueryEvent) => void): void;
    };
    prismaWithQueryEvents.$on("query", (event) => {
      addFlowStep({
        step: "database.query",
        layer: "database",
        event: "query",
        target: event.target,
        durationMs: event.duration,
        description: "Prisma executed a database query.",
        data: {
          query: event.query,
          params: safeParseJson(event.params)
        }
      });
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
