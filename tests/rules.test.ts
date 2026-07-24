import assert from "node:assert/strict";
import test from "node:test";
import {
  AttendanceStudent,
  GuidanceStudent,
  applyIncomplete,
  buildStudentRecords,
  getBasicSanction,
  getOtherAttendanceSanction,
  getTardySanction,
  sanctionLabel,
  summarizeSanctions,
} from "../lib/discipline";

test("applies every basic-life boundary", () => {
  assert.equal(sanctionLabel(getBasicSanction("10101", 3)!), "교내봉사 3일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 6)!), "교내봉사 5일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 9)!), "사회봉사 3일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 12)!), "사회봉사 5일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 15)!), "특별교육 3일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 18)!), "특별교육 5일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 21)!), "출석정지 3일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 24)!), "출석정지 5일");
  assert.equal(sanctionLabel(getBasicSanction("10101", 27)!), "출석정지 10일");
  assert.equal(getBasicSanction("10101", 2), null);
});

test("applies attendance boundaries independently", () => {
  assert.equal(sanctionLabel(getTardySanction("10101", 5)!), "교내봉사 5일");
  assert.equal(sanctionLabel(getTardySanction("10101", 10)!), "사회봉사 5일");
  assert.equal(sanctionLabel(getTardySanction("10101", 15)!), "특별교육 5일");
  assert.equal(sanctionLabel(getTardySanction("10101", 20)!), "출석정지 5일");
  assert.equal(sanctionLabel(getTardySanction("10101", 25)!), "출석정지 10일");
  assert.equal(sanctionLabel(getTardySanction("10101", 30)!), "출석정지 협의");

  assert.equal(
    sanctionLabel(getOtherAttendanceSanction("10101", 2)!),
    "교내봉사 5일",
  );
  assert.equal(
    sanctionLabel(getOtherAttendanceSanction("10101", 4)!),
    "사회봉사 5일",
  );
  assert.equal(
    sanctionLabel(getOtherAttendanceSanction("10101", 6)!),
    "특별교육 5일",
  );
  assert.equal(
    sanctionLabel(getOtherAttendanceSanction("10101", 8)!),
    "출석정지 협의",
  );
});

test("adds same-stage sanctions and escalates only checked items", () => {
  const guidance: GuidanceStudent[] = [
    {
      sequence: 1,
      studentId: "10101",
      name: "테스트",
      grade: 1,
      points: 6,
      guidanceCount: 6,
    },
  ];
  const attendance: AttendanceStudent[] = [
    {
      studentId: "10101",
      name: "테스트",
      grade: 1,
      classNo: 1,
      number: 1,
      tardy: 5,
      result: 1,
      earlyLeave: 1,
      absence: 0,
    },
  ];

  const [record] = buildStudentRecords(attendance, guidance);
  assert.equal(record.sanctions.length, 3);
  assert.equal(
    summarizeSanctions(record.sanctions, new Set()),
    "교내봉사 15일",
  );

  assert.equal(
    summarizeSanctions(record.sanctions, new Set(["10101:basic"])),
    "교내봉사 10일 + 사회봉사 5일",
  );
});

test("keeps the original duration when a sanction is incomplete", () => {
  const sanction = getBasicSanction("10101", 3)!;
  const escalated = applyIncomplete(sanction);
  assert.equal(escalated.type, "사회봉사");
  assert.equal(escalated.days, 3);
});
