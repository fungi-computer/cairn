# Cairn (`@fungi.computer/cairn`)

Cairn gives Fungi packages typed, opaque identifiers, temporary command and
correlation keys, and candidate word names. Use it so you do not have to
hand-roll your own ID format and parser. The package provides these values and
their parsing rules. The calling domain owns persistence, uniqueness,
authorization, and lifecycle policy.

## Install or set up

```sh
npm install @fungi.computer/cairn
```

The package ships ESM only (`"type": "module"`) and installs `nanoid`, Zod, and
`uuid` as runtime dependencies. Import the root entrypoint for IDs and ephemeral
keys together, or import `@fungi.computer/cairn/id` and
`@fungi.computer/cairn/words` separately.

## Quick start

This illustrative example creates one caller-owned ID family, generates an ID,
and checks a decoded string without changing its spelling:

```ts
import { defineIdFamily } from "@fungi.computer/cairn/id";

const jobIds = defineIdFamily({
  family: "jobs",
  version: 1,
  kinds: { job: { prefix: "job" } },
});

const jobId = jobIds.job.generate();
const result = jobIds.job.parse(jobId);
if (!result.ok) throw new Error(`Invalid job ID: ${result.error.reason}`);
```

The result is a canonical `job_` identifier. The runnable ID tests exercise
family-scoped generation and parsing in [`src/id.test.ts`](src/id.test.ts).

## Core concepts

`defineIdFamily` validates a trusted family declaration and returns one codec
for each declared kind. Each codec has a branded TypeScript ID type, a Zod
schema for an untrusted string boundary, and `parse` and `is` methods for a
string that has already been decoded. Version 1 IDs have the form
`<prefix>_<21 lowercase base36 characters>`. Parsing does not trim, decode,
case-fold, or normalize the input. A rejected parse returns bounded metadata and
a reason. It does not return the rejected value.

IDs do not declare database uniqueness, relationships, permissions, or entity
lifecycle. The domain that declares a family owns those rules and any bounded
collision retry.

The root also exports `replayKey`, `deterministicReplayKey`, `correlationKey`,
and `createCorrelationSequence`. `replayKey()` mints a UUIDv7 for one command;
retain it across an ambiguous retry.
`await deterministicReplayKey(domain, parts)` derives the same replay-key brand
using Web Crypto SHA-256 and length-prefixed tuple encoding in Node, browsers
and Workers. Supply a stable host-owned domain and the complete authority scope
and stored command identity so a restart derives the same key. A correlation key
is a UUIDv4 for transport or provider correlation. A correlation sequence starts
at 1 for one connection and throws when it reaches safe-integer exhaustion. None
of these keys is a durable domain identity.

`words()` chooses a candidate name from Cairn's exported adjective and noun
lists. It does not keep a registry or promise uniqueness. Callers choose a word
count that fits their collision requirements.

## API reference

See the generated [API reference](docs/api/index.md). The public entrypoints are
`@fungi.computer/cairn`, `@fungi.computer/cairn/id`,
`@fungi.computer/cairn/words`, and `@fungi.computer/cairn/team-role`.

## Examples and checks

The test suite covers identifier grammar, ephemeral keys, and candidate words.
After building, run the unit tests and the public `./id` bundle-isolation proof:

```sh
pnpm --filter @fungi.computer/cairn test
```

[`test/runtime/id-only-proof.mjs`](test/runtime/id-only-proof.mjs) verifies that
the public `./id` entrypoint does not include the word corpus. The focused tests
are in [`src/id.test.ts`](src/id.test.ts),
[`src/ephemeral-key.test.ts`](src/ephemeral-key.test.ts), and
[`src/index.test.ts`](src/index.test.ts).

## Limits and errors

ID generation needs secure randomness. If that source is unavailable, Cairn
throws `CairnGenerationError` with the validated family and kind. Invalid
trusted family declarations throw `CairnDefinitionError`. The caller must use
the codec's schema at an untrusted wire boundary before passing data to `parse`.

The root `nanoid(length)` export is retained for callers that need a raw random
string. Its finite length coercion follows the selected upstream runtime
implementation. Use a bounded nonnegative integer for predictable results.
`LONG` is a conventional size, not a maximum. Likewise, `words({ count })` keeps
legacy count coercion and does not impose a maximum. CPU and output grow with
the requested size, so validate and bound untrusted sizing values before calling
either helper. Use `defineIdFamily` for durable domain IDs.

## Contribute and license

Cairn's license is MIT. See [`LICENSE`](LICENSE). Its direct runtime
dependencies are `nanoid`, Zod, and `uuid`. Consult their package distributions
for their license terms.
