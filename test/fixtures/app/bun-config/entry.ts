// @ts-expect-error Bun resolves this alias from this fixture's tsconfig.json.
import { message } from "@fixture/message";

console.log(message);
