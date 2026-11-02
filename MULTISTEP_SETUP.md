# Enable prompt-tool chains in the public app

The three apps share Supabase. `Not configured` meant the chain had no row in
`prompt_chain_mix`; it did not mean that its instructions were missing.

## Apply the upgrade

1. In the shared Supabase project's SQL Editor, apply
   `supabase/017_public_multistep_chains.sql` after 015 and 016, then apply
   `supabase/018_admin_tool_history_single_caption.sql`. If 017 is already applied,
   apply only 018. Do not rerun older migrations afterward.
2. Deploy the updated public app, Admin app and Prompt Chain Tool. The public
   `/create` page uses a 300-second function budget. Model calls share a
   240-second workflow budget, with a maximum of 90 seconds per step and
   adaptive limits for the remaining steps. Your Vercel plan must support
   the route's function budget.
3. Open Admin > Prompt chains. Existing unconfigured chains now have disabled
   settings with weight 1; future tool-created chains get the same defaults.
4. Enable the desired chain, set a positive weight and save. For a deterministic
   test, disable the other chains so the chosen chain has a 100% live chance.
5. Generate a preview in the public app. Inspect the saved request and each
   response in Admin or the tool's Generated media execution details.

The migration preserves enabled flags and weights already configured. It never
automatically enables a new chain. Mix updates are atomic and superadmin-only.

## Execution behavior

- 1–6 nonempty instructions, using registered Google models (the providers
  supported by the tool), execute in saved order.
- Step 1 gets the photo, if Storage-backed, and scene/description/style context.
  Later steps receive the immediately preceding output and the input context.
- Intermediate outputs and tool test results can contain up to 20,000 characters.
  Public final results must be one caption on a single line, at most 30 words and
  500 characters. Lists or oversized final results are saved as failed responses,
  not as publishable previews. No extra model call rewrites the last result.
- Admin Generation requests and LLM responses combine public history and tool
  history with a Source filter. Tool runs are marked Test only; no public draft
  is fabricated. Existing tool runs appear after migration 018 without copying.
- Each response saves its actual prompt, output, model reference, duration and
  available usage before the next model call. A failed call stops the chain.
- Requests snapshot model IDs/names and instructions. Configuration changes
  apply to new requests and cannot rewrite an active request's saved steps.
- Interrupted runs expire after five minutes. Persistence retries do not repeat
  model calls or create duplicate drafts.
- The legacy Admin Test run remains a single-step diagnostic. Use the Prompt
  Chain Tool for multi-step testing or test an enabled chain in the public app.

Model availability, quotas and provider errors can still cause runs to fail;
these are recorded as failures rather than fabricated captions.

## Local verification

Prompt tool: `npm test`, `npm run lint`, `npm run typecheck`.

Public app: `node scripts/chain-generation-test.mjs`, `npx tsc --noEmit --incremental false`,
`npm run lint`. Tests use simulated providers and in-memory PostgreSQL and do not
prove that the live shared migration has been applied.
