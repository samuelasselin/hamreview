import { describe, it, expect } from "vitest";
import { parseUnifiedDiff, changedLinesByPath } from "./diff";

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
});
