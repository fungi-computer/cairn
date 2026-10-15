import { LONG, nanoid, words as rootWords } from "@fungi.computer/cairn";
import {
  defineIdFamily,
  type CairnId,
  type IdCodec,
  type IdOf,
  type IdParseResult,
} from "@fungi.computer/cairn/id";
import { words } from "@fungi.computer/cairn/words";

const long: 32 = LONG;
const wordCount = 9;
const identifier: string = nanoid(long);
const rootCandidate: string = rootWords({ count: wordCount });
const candidate: string = words({ count: wordCount });

const machineIds = defineIdFamily({
  family: "machine",
  version: 1,
  kinds: {
    machine: { prefix: "machine" },
    lease: { prefix: "machine_lease" },
  },
});

const sessionIds = defineIdFamily({
  family: "session",
  version: 1,
  kinds: {
    machine: { prefix: "session_machine" },
  },
});

type MachineId = IdOf<typeof machineIds.machine>;
type LeaseId = IdOf<typeof machineIds.lease>;
type SessionMachineId = IdOf<typeof sessionIds.machine>;

const family: "machine" = machineIds.machine.family;
const kind: "machine" = machineIds.machine.kind;
const version: 1 = machineIds.machine.version;
const codec: IdCodec<"machine", "machine"> = machineIds.machine;
const machineId: MachineId = machineIds.machine.generate();
const branded: CairnId<"machine", "machine"> = machineId;
const parsed: IdParseResult<MachineId, "machine", "machine"> =
  machineIds.machine.parse(machineId);
const sessionMachineId: SessionMachineId = sessionIds.machine.generate();

// @ts-expect-error Machine and Lease identities are not interchangeable.
const leaseId: LeaseId = machineId;

// @ts-expect-error Same-named kinds from different families are not interchangeable.
const crossFamilyMachineId: MachineId = sessionMachineId;

// @ts-expect-error Raw strings are not branded Cairn identities.
const rawMachineId: MachineId = "machine_000000000000000000000";

void identifier;
void rootCandidate;
void candidate;
void family;
void kind;
void version;
void codec;
void branded;
void parsed;
void sessionMachineId;
void leaseId;
void crossFamilyMachineId;
void rawMachineId;
