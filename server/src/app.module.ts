import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AiModule } from "./ai/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ArticlesModule } from "./articles/articles.module";
import { AuthModule } from "./auth/auth.module";
import { CalendarModule } from "./calendar/calendar.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ApiFlowInterceptor } from "./common/logging/api-flow.interceptor";
import { LoggingModule } from "./common/logging/logging.module";
import { RequestIdMiddleware } from "./common/logging/request-id.middleware";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { NotesModule } from "./notes/notes.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { SearchModule } from "./search/search.module";
import { SqlModule } from "./sql/sql.module";
import { TasksModule } from "./tasks/tasks.module";
import { TicketsModule } from "./tickets/tickets.module";
import { TimeModule } from "./time/time.module";
import { TemplatesModule } from "./templates/templates.module";
import { UsersModule } from "./users/users.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    LoggingModule,
    UsersModule,
    AuthModule,
    HealthModule,
    CalendarModule,
    FilesModule,
    WorkspacesModule,
    ProjectsModule,
    ArticlesModule,
    NotesModule,
    NotificationsModule,
    TasksModule,
    TicketsModule,
    TimeModule,
    TemplatesModule,
    SqlModule,
    SearchModule,
    AnalyticsModule,
    AiModule
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiFlowInterceptor }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
