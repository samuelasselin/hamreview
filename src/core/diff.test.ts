import { describe, it, expect } from "vitest";
import { parseUnifiedDiff, changedLinesByPath } from "./diff";
import type { Diff } from "./diff";

const raw = `diff --git a/app/models/booking.rb b/app/models/booking.rb
index e69de29..1234567 100644
--- a/app/models/booking.rb
+++ b/app/models/booking.rb
@@ -3,3 +3,4 @@ class Booking < ApplicationRecord
   belongs_to :user
+  validates :end_at, comparison: { greater_than: :start_at }
   scope :upcoming, -> { where("start_at > ?", Time.now) }
 end
diff --git a/web/src/BookingForm.tsx b/web/src/BookingForm.tsx
new file mode 100644
--- /dev/null
+++ b/web/src/BookingForm.tsx
@@ -0,0 +1,3 @@
+export function BookingForm() {
+  return null
+}
`;

describe("parseUnifiedDiff", () => {
  it("parses two files with correct new-file added line numbers", () => {
    const diff = parseUnifiedDiff(raw);
    expect(diff.files.length).toBe(2);

    const booking = diff.files[0];
    expect(booking.path).toBe("app/models/booking.rb");
    expect(booking.status).toBe("modified");
    expect(booking.addedLines).toEqual([4]);

    const form = diff.files[1];
    expect(form.path).toBe("web/src/BookingForm.tsx");
    expect(form.status).toBe("added");
    expect(form.addedLines).toEqual([1, 2, 3]);
  });

  it("indexes changed lines by path", () => {
    const map = changedLinesByPath(parseUnifiedDiff(raw));
    expect(map.get("app/models/booking.rb")?.has(4)).toBe(true);
    expect(map.get("web/src/BookingForm.tsx")?.size).toBe(3);
  });

  it("returns no files for an empty diff", () => {
    expect(parseUnifiedDiff("").files).toEqual([]);
  });

  it("parses a deleted file (no added lines)", () => {
    const raw = `diff --git a/old/gone.rb b/old/gone.rb
deleted file mode 100644
index 1234567..0000000
--- a/old/gone.rb
+++ /dev/null
@@ -1,2 +0,0 @@
-class Gone
-end
`;
    const f = parseUnifiedDiff(raw).files[0];
    expect(f.path).toBe("old/gone.rb");
    expect(f.status).toBe("deleted");
    expect(f.addedLines).toEqual([]);
  });

  it("parses a renamed file with an edit", () => {
    const raw = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 90%
rename from src/old-name.ts
rename to src/new-name.ts
index 1234567..89abcde 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -5,3 +5,4 @@ export function f() {
   const a = 1
+  const b = 2
   return a
 }
`;
    const f = parseUnifiedDiff(raw).files[0];
    expect(f.path).toBe("src/new-name.ts");
    expect(f.status).toBe("renamed");
    expect(f.oldPath).toBe("src/old-name.ts");
    expect(f.addedLines).toEqual([6]);
  });

  it("resets new-file line numbers across multiple hunks", () => {
    const raw = `diff --git a/app.js b/app.js
index 1111111..2222222 100644
--- a/app.js
+++ b/app.js
@@ -1,2 +1,3 @@
 line1
+added-at-2
 line2
@@ -10,2 +11,3 @@
 line10
+added-at-12
 line11
`;
    const f = parseUnifiedDiff(raw).files[0];
    expect(f.addedLines).toEqual([2, 12]);
  });

  it("ignores the no-newline-at-eof marker", () => {
    const raw = `diff --git a/nonl.txt b/nonl.txt
index 1111111..2222222 100644
--- a/nonl.txt
+++ b/nonl.txt
@@ -1 +1,2 @@
 first
+second
\\ No newline at end of file
`;
    const f = parseUnifiedDiff(raw).files[0];
    expect(f.addedLines).toEqual([2]);
  });

  it("does not treat a content line starting with +++/--- as a file header", () => {
    const raw = `diff --git a/notes.md b/notes.md
index 1111111..2222222 100644
--- a/notes.md
+++ b/notes.md
@@ -1,1 +1,3 @@
 title
+++ plus prefixed line
+regular added line
`;
    const f = parseUnifiedDiff(raw).files[0];
    expect(f.path).toBe("notes.md");
    expect(f.addedLines).toEqual([2, 3]);
  });

  it("unions added lines when two file entries share a path", () => {
    const diff: Diff = {
      files: [
        { path: "a.rb", status: "modified", addedLines: [1, 2] },
        { path: "a.rb", status: "modified", addedLines: [5] },
      ],
    };
    expect(changedLinesByPath(diff).get("a.rb")).toEqual(new Set([1, 2, 5]));
  });
});
