import {
  LONG,
  nanoid,
  replayKey,
  correlationKey,
  createCorrelationSequence,
  words as rootWords,
} from "@fungi.computer/cairn";
import {
  CairnDefinitionError,
  CairnGenerationError,
  defineIdFamily,
} from "@fungi.computer/cairn/id";
import { words } from "@fungi.computer/cairn/words";

const wordCount = 9;
const identifier = nanoid(LONG);
const rootCandidate = rootWords({ count: wordCount });
const subpathCandidate = words({ count: wordCount });

const machineIds = defineIdFamily({
  family: "machine",
  version: 1,
  kinds: {
    machine: { prefix: "machine" },
    lease: { prefix: "machine_lease" },
  },
});

const machineId = machineIds.machine.generate();
const parsed = machineIds.machine.parse(machineId);
const crossKind = machineIds.lease.parse(machineId);

if (identifier.length !== LONG) {
  throw new Error("Cairn stranger import returned the wrong identifier length");
}
if (
  rootCandidate.split("-").length !== wordCount ||
  subpathCandidate.split("-").length !== wordCount
) {
  throw new Error("Cairn stranger import returned a wrong candidate shape");
}
if (!/^machine_[a-z0-9]{21}$/.test(machineId)) {
  throw new Error("Cairn stranger import generated a wrong typed ID shape");
}
if (
  !parsed.ok ||
  parsed.value !== machineId ||
  !machineIds.machine.is(machineId)
) {
  throw new Error("Cairn stranger import failed to parse its generated ID");
}
if (
  crossKind.ok ||
  crossKind.error.code !== "invalid_id" ||
  crossKind.error.reason !== "grammar"
) {
  throw new Error("Cairn stranger import accepted an ID from another kind");
}

const definitionError = new CairnDefinitionError();
if (
  definitionError.name !== "CairnDefinitionError" ||
  definitionError.code !== "invalid_definition" ||
  definitionError.message !== "Cairn identifier family definition is invalid" ||
  "cause" in definitionError
) {
  throw new Error("Cairn stranger import exposed a wrong definition error");
}

const generationError = new CairnGenerationError({
  family: "machine",
  kind: "machine",
});
if (
  generationError.name !== "CairnGenerationError" ||
  generationError.code !== "entropy_unavailable" ||
  generationError.family !== "machine" ||
  generationError.kind !== "machine" ||
  generationError.version !== 1 ||
  generationError.message !== "Cairn entropy source is unavailable" ||
  "cause" in generationError
) {
  throw new Error("Cairn stranger import exposed a wrong generation error");
}

const replay = replayKey();
const correlation = correlationKey();
if (
  replay.length !== 36 ||
  replay[14] !== "7" ||
  correlation.length !== 36 ||
  correlation[14] !== "4"
) {
  throw new Error("Cairn stranger ephemeral key wire format is wrong");
}
const nextCorrelation = createCorrelationSequence();
if (nextCorrelation() !== 1 || nextCorrelation() !== 2) {
  throw new Error("Cairn stranger correlation sequence is wrong");
}
