import { z } from "zod/v4";

type Method = "get" | "post" | "patch" | "put" | "delete";

export type RouteSpec = {
  method: Method;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth?: boolean;
  pathParams?: string[];
  query?: Record<
    string,
    { schema: z.ZodType; description?: string; required?: boolean }
  >;
  body?: z.ZodType;
  responses: Record<string, { description: string; schema?: z.ZodType }>;
};

function toJson(schema: z.ZodType) {
  return z.toJSONSchema(schema, { target: "openapi-3.0" });
}

export function buildPaths(routes: RouteSpec[]) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of routes) {
    paths[r.path] ??= {};

    const parameters: unknown[] = [];
    for (const name of r.pathParams ?? []) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
    for (const [name, q] of Object.entries(r.query ?? {})) {
      parameters.push({
        name,
        in: "query",
        required: q.required ?? false,
        description: q.description,
        schema: toJson(q.schema),
      });
    }

    const op: Record<string, unknown> = {
      summary: r.summary,
      tags: r.tags,
      security: r.auth ? [{ bearerAuth: [] }] : [],
    };
    if (r.description) op.description = r.description;
    if (parameters.length) op.parameters = parameters;
    if (r.body) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": { schema: toJson(r.body) },
        },
      };
    }
    op.responses = Object.fromEntries(
      Object.entries(r.responses).map(([status, resp]) => [
        status,
        {
          description: resp.description,
          ...(resp.schema && {
            content: {
              "application/json": { schema: toJson(resp.schema) },
            },
          }),
        },
      ])
    );

    paths[r.path][r.method] = op;
  }

  return paths;
}
