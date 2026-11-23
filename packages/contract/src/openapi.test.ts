import { expect, test } from "bun:test";
import { OpenAPIGenerator } from "@orpc/openapi";
import { contract } from "./contract";

test("the contract generates an OpenAPI document", async () => {
  const generator = new OpenAPIGenerator();
  const spec = await generator.generate(contract, {
    base: { info: { title: "formatarr", version: "0.0.0" } },
  });

  expect(Object.keys(spec.paths ?? {}).sort()).toMatchSnapshot();
});
