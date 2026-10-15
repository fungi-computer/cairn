import { defineIdFamily } from "@fungi.computer/cairn/id";
import { words } from "@fungi.computer/cairn/words";

const ids = defineIdFamily({
  family: "jobs",
  version: 1,
  kinds: { job: { prefix: "job" } },
});

const id = ids.job.generate();
console.log(id); // job_ and 21 base36 characters
console.log(ids.job.parse(id).ok); // true
console.log(ids.job.parse("job_TOO-SHORT").ok); // false
console.log(words()); // a candidate name such as "quiet-fern"
