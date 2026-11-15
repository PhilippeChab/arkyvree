import { afterEach, describe, expect, test } from "bun:test";

import { DiskStorageBackend } from "@/server/storage/DiskStorageBackend.ts";
import ObjectStorage, { findStorageKind } from "@/server/storage/ObjectStorage.ts";

const S3_VARIABLES = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"];

/** The S3 variables as the run had them, put back after each test. */
const saved = Object.fromEntries(S3_VARIABLES.map((name) => [name, process.env[name]]));

/** Sets the S3 variables a test names (`set`), and unsets the others. */
function setS3(set: string[]) {
  for (const name of S3_VARIABLES) {
    if (set.includes(name)) process.env[name] = `${name.toLowerCase()}-value`;
    else delete process.env[name];
  }
}

describe("ObjectStorage", () => {
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test("keeps the files in S3 with every S3 variable set, on the disk with none, and nowhere with some", () => {
    setS3(S3_VARIABLES);
    expect(findStorageKind()).toBe("s3");
    setS3([]);
    expect(findStorageKind()).toBe("disk");
    setS3(["S3_BUCKET", "S3_ENDPOINT"]);
    expect(findStorageKind()).toBeNull();
  });

  test("builds the disk storage without S3, and refuses to build any with S3 set up in part", () => {
    setS3([]);
    ObjectStorage.setForTest(null);
    expect(ObjectStorage.get()).toBeInstanceOf(DiskStorageBackend);
    expect(ObjectStorage.findDisk()).toBeInstanceOf(DiskStorageBackend);

    setS3(["S3_BUCKET"]);
    ObjectStorage.setForTest(null);
    expect(() => ObjectStorage.get()).toThrow("S3 storage is set up in part");
  });
});
