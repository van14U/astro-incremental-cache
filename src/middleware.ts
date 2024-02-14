import type { MiddlewareHandler } from "astro";

const globalThisExecutionContext = globalThis as {
  executionContext?: {
    waitUntil: ExecutionContext["waitUntil"];
  };
};

export const onRequest: MiddlewareHandler = (context, next) => {
  globalThisExecutionContext.executionContext ??= {
    waitUntil: context.locals.runtime?.waitUntil,
  };
  return next();
};
