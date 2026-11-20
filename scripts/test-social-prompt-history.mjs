import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`,
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20261120141214_social_creative_prompt_history.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const owner = randomUUID(),
  other = randomUUID();
await db.query("insert into auth.users values($1),($2)", [owner, other]);
await db.query(
  "insert into social_creative_prompts(user_id,book_slug,concept_key,recipe) values($1,'book','scene-layout-palette-hook','{}'),($2,'book','foreign','{}')",
  [owner, other],
);
await assert.rejects(
  () =>
    db.query(
      "insert into social_creative_prompts(user_id,book_slug,concept_key,recipe) values($1,'book','scene-layout-palette-hook','{}')",
      [owner],
    ),
  /unique/,
);
await db.exec("set role authenticated");
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
assert.equal(
  (await db.query("select * from social_creative_prompts")).rows.length,
  1,
);
await assert.rejects(
  () => db.query("update social_creative_prompts set user_id=$1", [other]),
  /permission denied/,
);
await assert.rejects(
  () =>
    db.query(
      "insert into social_creative_prompts(user_id,book_slug,concept_key,recipe) values($1,'book','spoofed','{}')",
      [owner],
    ),
  /permission denied/,
);
await db.exec("reset role");
const id = (
  await db.query("select id from social_creative_prompts where user_id=$1", [
    owner,
  ])
).rows[0].id;
const claim = () =>
  db.query(
    "update social_creative_prompts set poster_state='generating' where id=$1 and user_id=$2 and poster_state='idle' returning id",
    [id, owner],
  );
assert.equal((await claim()).rows.length, 1);
assert.equal((await claim()).rows.length, 0);
console.log(
  "PASS: real SQL owner isolation, denied history tampering, unique creative reservations and a single poster claim.",
);
await db.close();
