import { cleanupExpired } from "../src/lib/cleanup";
import { sqlClient } from "../src/db/client";

try {
  const result = await cleanupExpired();
  console.log(JSON.stringify(result));
} finally {
  await sqlClient.end();
}
