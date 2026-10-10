import { z } from 'zod';
export const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
export const categories = ['roads', 'water', 'electricity', 'sanitation', 'drainage', 'street_lights', 'other'];
export const priorities = ['low', 'medium', 'high', 'critical'];
export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function validate(schema, data) { return schema.parse(data); }
export function allow(...roles) {
  return (req, res, next) => req.user && roles.includes(req.user.role) ? next() : next(new ApiError(403, 'FORBIDDEN', 'You cannot perform this action'));
}
export function paging(query) {
  const { page, limit } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(query);
  return { page, limit, skip: (page - 1) * limit };
}
export function sendList(res, items, total, page, limit) { res.json({ data: items, pagination: { page, limit, total } }); }
export function scope(user) {
  const filter = { villageId: user.villageId };
  if (user.role === 'citizen') filter.citizenId = user._id;
  if (user.role === 'staff') filter.departmentId = user.departmentId;
  return filter;
}
export const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const pointInput = z.object({ type: z.literal('Point'), coordinates: coordinate }).strict();
const ring = z.array(coordinate).min(4).refine(v => v[0][0] === v.at(-1)[0] && v[0][1] === v.at(-1)[1], 'Polygon rings must be closed');
export const geometryInput = z.discriminatedUnion('type', [
  pointInput,
  z.object({ type: z.literal('LineString'), coordinates: z.array(coordinate).min(2) }).strict(),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }).strict(),
]);
