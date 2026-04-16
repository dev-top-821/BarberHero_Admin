import { buildOpenApiDocument } from "@/lib/openapi/spec";

export function GET() {
  return Response.json(buildOpenApiDocument());
}
