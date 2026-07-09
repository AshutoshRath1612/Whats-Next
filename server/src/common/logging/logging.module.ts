import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { ApiFlowInterceptor } from "./api-flow.interceptor";
import { ApiLoggerService } from "./api-logger.service";
import { ErrorAlertService } from "./error-alert.service";
import { FlowInstrumentationService } from "./flow-instrumentation.service";
import { RequestIdMiddleware } from "./request-id.middleware";
import { StructuredLoggerService } from "./structured-logger.service";

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [ApiFlowInterceptor, ApiLoggerService, ErrorAlertService, FlowInstrumentationService, RequestIdMiddleware, StructuredLoggerService],
  exports: [ApiFlowInterceptor, ApiLoggerService, ErrorAlertService, RequestIdMiddleware, StructuredLoggerService]
})
export class LoggingModule {}
