// In-memory PostgreSQL only: no .env, hosted database or account credentials.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
let checks = 0;
const admin = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const tables = ["prompt_chains", "prompt_chain_steps", "prompt_chain_mix", "terms", "generation_requests", "ai_generation_examples", "llm_models", "llm_providers", "llm_responses", "allowed_signup_domains", "whitelisted_email_addresses", "images"];
async function check(name, fn) { await fn(); checks++; console.log(`ok ${checks} - ${name}`); }
async function denied(fn, code) {
  await assert.rejects(fn, error => error.code === code);
}
async function read(table, page = 1, search = "") {
  const { rows } = await db.query("select public.admin_resource_read($1,$2,$3) result", [table, page, search]);
  return rows[0].result;
}
const write = (table, operation, id, payload = {}) => db.query(
  "select public.admin_resource_write($1,$2,$3::jsonb,$4::jsonb)",
  [table, operation, JSON.stringify(id), JSON.stringify(payload)],
);
async function session(role, id = "") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}

try {
  // Relevant Week 6 schema, including the original cascading image foreign key.
  // Storage/auth services are stand-ins; this test does not simulate OAuth or uploads.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.profiles (id uuid primary key references auth.users, first_name text, last_name text, avatar_url text, updated_at timestamptz default now());
    create table public.images (id uuid primary key default gen_random_uuid(), url text not null check(url ~ '^https://'), alt_text text not null, user_id uuid references public.profiles, storage_path text, created_at timestamptz default now());
    create table public.generations (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles, image_id uuid references public.images, user_input text, prompt text, model text, generated_content text, created_at timestamptz default now(), withdrawn_at timestamptz);
    create table public.captions (id uuid primary key default gen_random_uuid(), image_id uuid references public.images on delete cascade, generation_id uuid references public.generations, content text, created_at timestamptz default now(), deleted_at timestamptz);
    create table public.caption_votes (user_id uuid references public.profiles, caption_id uuid references public.captions on delete cascade, value smallint, updated_at timestamptz default now(), primary key(user_id,caption_id));
    insert into auth.users(id,email) values ('${admin}','admin@example.com'),('${member}','member@example.com');
    insert into public.profiles(id) values ('${admin}'),('${member}');
  `);
  await db.exec(await readFile(new URL("../supabase/008_admin_panel.sql", import.meta.url), "utf8"));
  await db.exec(`update public.profiles set is_superadmin=true where id='${admin}'`);
  const migration = await readFile(new URL("../supabase/012_week7_observability.sql", import.meta.url), "utf8");
  await check("migration applies and is repeatable", async () => { await db.exec(migration); await db.exec(migration); });

  for (const [role, id] of [["anon", ""], ["authenticated", member], ["authenticated", ""]]) {
    await session(role, id);
    for (const table of tables) {
      await check(`${role}/${id || "no user"} cannot read ${table} RPC`, () => denied(() => read(table), "42501"));
    }
    for (const table of tables.filter(t => !["prompt_chains", "prompt_chain_steps", "generation_requests", "llm_responses"].includes(t))) {
      await check(`${role}/${id || "no user"} cannot mutate ${table}`, async () => {
        for (const op of ["create", "update", "delete"]) await denied(() => write(table, op, admin, {}), "42501");
      });
    }
    await check(`${role} cannot access new tables directly`, async () => {
      for (const table of tables.filter(t => t !== "images")) await denied(() => db.query(`select * from public.${table}`), "42501");
    });
  }
  await session("authenticated", admin);
  for (const table of tables) await check(`admin reads ${table} and schema`, async () => {
    const result = await read(table);
    assert.ok(result.columns.some(c => c.primary)); assert.ok(Array.isArray(result.rows));
  });

  const records = [
    ["terms", { term: "office hours", definition: "When students ask questions" }, { definition: "Updated definition" }],
    ["llm_providers", { name: "Temporary provider" }, { name: "Updated provider" }],
    ["allowed_signup_domains", { domain: "example.edu" }, { domain: "updated.edu" }],
    ["whitelisted_email_addresses", { email: "student@example.edu" }, { email: "other@example.edu" }],
    ["ai_generation_examples", { prompt: "Caption this", response: "A caption" }, { response: "An improved caption" }],
    ["images", { url: "https://example.com/test.png", alt_text: "A test" }, { alt_text: "Updated image" }],
  ];
  for (const [table, initial, update] of records) await check(`admin CRUD ${table}`, async () => {
    await write(table, "create", null, initial);
    const row = (await read(table)).rows[0];
    for (const [key, value] of Object.entries(initial)) assert.equal(row[key], value);
    await write(table, "update", row.id, update);
    const updated = (await read(table)).rows[0];
    for (const [key, value] of Object.entries(update)) assert.equal(updated[key], value);
    await write(table, "delete", row.id);
    assert.equal((await read(table)).total, 0);
  });
  await write("llm_providers", "create", null, { name: "Model provider" });
  const provider = (await read("llm_providers")).rows[0].id;
  await check("model CRUD and provider references", async () => {
    await write("llm_models", "create", null, { provider_id: provider, name: "Model" });
    const model = (await read("llm_models")).rows[0].id;
    await write("llm_models", "update", model, { name: "Updated model" });
    assert.equal((await read("llm_models")).rows[0].name, "Updated model");
    await denied(() => write("llm_providers", "delete", provider), "23503");
    await write("llm_models", "delete", model); await write("llm_providers", "delete", provider);
  });
  await check("read-only resources reject all writes", async () => {
    for (const table of ["prompt_chains", "prompt_chain_steps", "generation_requests", "llm_responses"])
      for (const op of ["create", "update", "delete"]) await denied(() => write(table, op, admin), "42501");
  });
  await session("postgres");
  await db.exec(`insert into public.prompt_chains(id,name) values ('${admin}','Test chain'); insert into public.prompt_chain_mix(id,prompt_chain_id) values ('${admin}','${admin}');`);
  await session("authenticated", admin);
  await check("mix allows update only, rejects negative weights", async () => {
    await write("prompt_chain_mix", "update", admin, { weight: 2, enabled: false });
    const row = (await read("prompt_chain_mix")).rows[0];
    assert.equal(Number(row.weight), 2); assert.equal(row.enabled, false);
    await denied(() => write("prompt_chain_mix", "update", admin, { weight: -1 }), "23514");
    for (const op of ["create", "delete"]) await denied(() => write("prompt_chain_mix", op, admin), "42501");
  });
  await check("unknown, protected and invalid inputs are rejected", async () => {
    await denied(() => read("profiles"), "22023");
    await denied(() => read("terms; drop table public.terms"), "22023");
    await denied(() => write("profiles", "delete", admin), "42501");
    for (const payload of [{ id: admin }, { created_at: "2026-01-01" }, { invented: true }]) await denied(() => write("terms", "create", null, payload), "22023");
    await denied(() => write("terms", "update", member, { definition: "missing" }), "P0001");
    await denied(() => write("terms", "create", null, null), "P0001");
    await denied(() => write("allowed_signup_domains", "create", null, { domain: "INVALID DOMAIN" }), "23514");
    await denied(() => write("whitelisted_email_addresses", "create", null, { email: "invalid" }), "23514");
  });
  await check("search and pagination cover all rows without overlap", async () => {
    for (let i = 0; i < 27; i++) await write("terms", "create", null, { term: `term-${i}`, definition: "pagination fixture" });
    const a = await read("terms", 1, "pagination fixture"), b = await read("terms", 2, "pagination fixture");
    assert.equal(a.total, 27); assert.equal(a.rows.length, 25); assert.equal(b.rows.length, 2);
    assert.equal(new Set([...a.rows, ...b.rows].map(r => r.id)).size, 27);
    assert.equal((await read("terms", 1, "PAGINATION FIXTURE")).total, 27);
    assert.equal((await read("terms", 1, "no match")).total, 0);
  });
  await write("images", "create", null, { url: "https://example.com/referenced.png", alt_text: "Referenced" });
  const image = (await read("images")).rows[0].id;
  await session("postgres");
  await db.exec(`insert into public.captions(id,image_id,content) values ('${admin}','${image}','Keep this caption'); insert into public.caption_votes(user_id,caption_id,value) values ('${member}','${admin}',1)`);
  await session("authenticated", admin);
  await check("image deletion cannot cascade into captions or votes", async () => {
    await denied(() => write("images", "delete", image), "23503");
    await session("postgres");
    assert.equal((await db.query("select count(*)::int n from public.captions")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from public.caption_votes")).rows[0].n, 1);
  });
  const pipeline = await readFile(new URL("../supabase/013_generation_pipeline.sql", import.meta.url), "utf8");
  const start = (imageId = image, context = "A campus study session") => db.query(
    "select public.humor_begin_generation($1,$2,$3,$4,$5) plan",
    [imageId, context, "deadpan", "Base caption instructions", "gemini-3.5-flash-lite"],
  ).then(r => r.rows[0].plan);
  const finish = (request, response = "Office hours have become my second major.", error = null) => db.query(
    "select public.humor_finish_generation($1,$2,$3,$4,$5,$6) id", [request, response, error, 321, 100, 12],
  ).then(r => r.rows[0].id);
  const fixtureChain = "70000000-0000-4000-8000-000000000001";
  let plan, draft;
  await check("pipeline migration applies twice without inventing historical requests", async () => {
    await db.exec(pipeline); await db.exec(pipeline);
    assert.equal((await db.query("select count(*)::int n from public.generation_requests")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.prompt_chain_steps where prompt_chain_id=$1", [fixtureChain])).rows[0].n, 1);
  });
  await check("anonymous generation is denied", async () => {
    await session("anon"); await denied(() => start(), "42501");
    await denied(() => finish(admin), "42501");
  });
  await check("a normal signed-in user starts a request without direct table privileges", async () => {
    await session("authenticated", member); plan = await start();
    assert.ok(plan.request_id); assert.equal(plan.model, "gemini-3.5-flash-lite");
    assert.match(plan.prompt, /Base caption instructions/); assert.match(plan.prompt, /Pipeline step instruction/);
    await denied(() => db.query("select * from public.generation_requests"), "42501");
  });
  await check("admins see a running request with exact prompt and model snapshot", async () => {
    await session("authenticated", admin);
    const req = (await read("generation_requests", 1, plan.request_id)).rows[0];
    assert.equal(req.user_id, member); assert.equal(req.image_id, image); assert.equal(req.status, "running");
    assert.equal(req.prompt_chain_id, fixtureChain); assert.equal(req.request.prompt, plan.prompt);
  });
  await check("a different user cannot complete another user's request", async () => {
    await denied(() => finish(plan.request_id), "42501");
  });
  await check("successful completion atomically links request, response and preview", async () => {
    await session("authenticated", member); draft = await finish(plan.request_id);
    assert.ok(draft); await session("authenticated", admin);
    const req = (await read("generation_requests", 1, plan.request_id)).rows[0];
    const response = (await read("llm_responses", 1, plan.request_id)).rows[0];
    assert.equal(req.status, "completed"); assert.equal(req.generation_id, draft);
    assert.equal(response.latency_ms, 321); assert.equal(response.input_tokens, 100); assert.equal(response.output_tokens, 12);
    assert.equal(response.prompt, plan.prompt); assert.equal(response.error, null);
    assert.equal(response.llm_model_id, req.request.llm_model_id);
    await session("postgres");
    const saved = (await db.query("select * from public.generations where id=$1", [draft])).rows[0];
    assert.equal(saved.generated_content, response.response); assert.equal(saved.user_id, member);
    assert.equal(saved.prompt, plan.prompt); assert.equal(saved.model, plan.model);
  });
  await check("completion retries return the same draft and do not duplicate responses", async () => {
    await session("authenticated", member); assert.equal(await finish(plan.request_id), draft);
    await session("postgres");
    assert.equal((await db.query("select count(*)::int n from public.llm_responses where generation_request_id=$1", [plan.request_id])).rows[0].n, 1);
  });
  await check("provider failure is visible to admins and creates no draft", async () => {
    await session("authenticated", member); const failed = await start();
    assert.equal(await finish(failed.request_id, null, "AI service timed out"), null);
    await session("authenticated", admin);
    assert.equal((await read("generation_requests", 1, failed.request_id)).rows[0].status, "failed");
    const response = (await read("llm_responses", 1, failed.request_id)).rows[0];
    assert.equal(response.error, "AI service timed out"); assert.equal(response.response, null);
  });
  await check("rejected AI output is logged as failure rather than published", async () => {
    await session("authenticated", member); const rejected = await start();
    assert.equal(await finish(rejected.request_id, "Repeated caption", "Duplicate output"), null);
    await session("authenticated", admin);
    assert.equal((await read("llm_responses", 1, rejected.request_id)).rows[0].response, "Repeated caption");
    assert.equal((await read("generation_requests", 1, rejected.request_id)).rows[0].generation_id, null);
  });
  await check("invalid response rolls back completely and permits a valid retry", async () => {
    await session("authenticated", member); const invalid = await start();
    await denied(() => finish(invalid.request_id, ""), "22023");
    await session("authenticated", admin);
    assert.equal((await read("llm_responses", 1, invalid.request_id)).total, 0);
    assert.equal((await read("generation_requests", 1, invalid.request_id)).rows[0].status, "running");
    await session("authenticated", member); assert.ok(await finish(invalid.request_id));
  });
  await check("users cannot generate against another user's upload", async () => {
    await session("postgres");
    const privateImage = (await db.query("insert into public.images(url,alt_text,user_id) values ('https://example.com/private.jpg','Private',$1) returning id", [admin])).rows[0].id;
    await session("authenticated", member); await denied(() => start(privateImage), "42501");
  });
  await check("disabling a chain via admin mix stops new generations", async () => {
    await session("authenticated", admin);
    const mix = (await read("prompt_chain_mix", 1, fixtureChain)).rows[0];
    await write("prompt_chain_mix", "update", mix.id, { enabled: false });
    await session("authenticated", member); await denied(() => start(), "22023");
    await session("authenticated", admin); await write("prompt_chain_mix", "update", mix.id, { enabled: true, weight: 0 });
    await session("authenticated", member); await denied(() => start(), "22023");
    await session("authenticated", admin); await write("prompt_chain_mix", "update", mix.id, { weight: 1 });
    await session("authenticated", member); assert.ok((await start()).request_id);
  });
  await check("zero-weight chains are not selected and enabled weights route real requests", async () => {
    await session("postgres");
    await db.exec(`insert into public.prompt_chains(id,name) values ('70000000-0000-4000-8000-000000000003','Alternative');
      insert into public.prompt_chain_steps(prompt_chain_id,step_order,prompt) values ('70000000-0000-4000-8000-000000000003',0,'Alternative instruction');
      insert into public.prompt_chain_mix(prompt_chain_id,weight,enabled) values ('70000000-0000-4000-8000-000000000003',1,true);
      update public.prompt_chain_mix set weight=0 where prompt_chain_id='${fixtureChain}'`);
    await session("authenticated", member); const routed = await start(); assert.match(routed.prompt, /Alternative instruction/);
    await session("authenticated", admin);
    assert.equal((await read("generation_requests", 1, routed.request_id)).rows[0].prompt_chain_id, '70000000-0000-4000-8000-000000000003');
  });
  await check("re-running migration preserves admin mix changes", async () => {
    await session("postgres"); await db.exec(pipeline);
    assert.equal(Number((await db.query("select weight from public.prompt_chain_mix where prompt_chain_id=$1", [fixtureChain])).rows[0].weight), 0);
  });
  await check("members cannot create arbitrary model configuration through generation RPC", async () => {
    const count = (await db.query("select count(*)::int n from public.llm_models")).rows[0].n;
    await session("authenticated", member);
    await denied(() => db.query("select public.humor_begin_generation($1,$2,$3,$4,$5)",
      [image, "A real scene", "deadpan", "Prompt", "unauthorized-model"]), "22023");
    await session("postgres");
    assert.equal((await db.query("select count(*)::int n from public.llm_models")).rows[0].n, count);
  });
  await check("permanently deleting a caption retains its completed request and AI response", async () => {
    await session("postgres");
    const caption = (await db.query("insert into public.captions(image_id,generation_id,content) values ($1,$2,'Temporary published caption') returning id", [image, draft])).rows[0].id;
    await db.query("insert into public.caption_votes(user_id,caption_id,value) values ($1,$2,1)", [member, caption]);
    await session("authenticated", admin);
    await db.query("select public.admin_delete_caption($1)", [caption]);
    const request = (await read("generation_requests", 1, plan.request_id)).rows[0];
    assert.equal(request.status, "completed"); assert.equal(request.generation_id, draft);
    assert.equal((await read("llm_responses", 1, plan.request_id)).total, 1);
    await session("postgres");
    assert.ok((await db.query("select withdrawn_at from public.generations where id=$1", [draft])).rows[0].withdrawn_at);
    assert.equal((await db.query("select count(*)::int n from public.captions where id=$1", [caption])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from public.caption_votes where caption_id=$1", [caption])).rows[0].n, 0);
  });
  console.log(`\n${checks} PostgreSQL checks passed.`);
} finally { await db.close(); }
