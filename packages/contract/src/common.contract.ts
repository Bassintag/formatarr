import { z } from "zod";

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const VoidSchema = z.void();

export function PageSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    items: z.array(schema),
    total: z.int().nonnegative(),
  });
}

export function IdParamsSchema<T extends z.ZodType>(schema: T) {
  return z.object({ id: schema });
}

export function UpdateSchema<T extends z.ZodObject, IdT extends z.ZodType>(
  schema: T,
  idSchema: IdT,
) {
  return schema.partial().extend({ id: idSchema });
}
