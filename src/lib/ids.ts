import { nanoid } from "nanoid";

export function id(prefix: string) {
  return `${prefix}_${nanoid(12)}`;
}
