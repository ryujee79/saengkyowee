export type SanctionType =
  | "교내봉사"
  | "사회봉사"
  | "특별교육"
  | "출석정지";

export type SanctionSource =
  | "기본생활"
  | "미인정지각"
  | "기타 미인정 합계";

export interface Sanction {
  id: string;
  source: SanctionSource;
  type: SanctionType;
  days: number | null;
  reason: string;
}

export interface AttendanceStudent {
  studentId: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  tardy: number;
  result: number;
  earlyLeave: number;
  absence: number;
}

export interface GuidanceStudent {
  sequence: number;
  studentId: string;
  name: string;
  grade: number;
  points: number;
  guidanceCount: number;
}

export interface StudentRecord {
  studentId: string;
  name: string;
  grade: number;
  classNo: number;
  number: number;
  guidance?: GuidanceStudent;
  attendance?: AttendanceStudent;
  sanctions: Sanction[];
}

export interface ParsedAttendance {
  students: AttendanceStudent[];
  classLabels: string[];
}

const sanctionOrder: SanctionType[] = [
  "교내봉사",
  "사회봉사",
  "특별교육",
  "출석정지",
];

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function buildStudentId(
  grade: number,
  classNo: number,
  number: number,
): string {
  return `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
}

function partsFromStudentId(studentId: string) {
  const normalized = studentId.padStart(5, "0");
  return {
    grade: numeric(normalized.slice(0, 1)),
    classNo: numeric(normalized.slice(1, 3)),
    number: numeric(normalized.slice(3, 5)),
  };
}

export function parseAttendanceRows(rows: unknown[][]): ParsedAttendance {
  let grade = 0;
  let classNo = 0;
  const classLabels = new Set<string>();
  const students: AttendanceStudent[] = [];

  for (const row of rows) {
    const labelText = row
      .slice(0, 6)
      .map((cell) => text(cell))
      .join(" ");
    const classMatch = labelText.match(/([1-3])학년\s*([0-9]{1,2})반/);
    if (classMatch) {
      grade = numeric(classMatch[1]);
      classNo = numeric(classMatch[2]);
      classLabels.add(`${grade}학년 ${classNo}반`);
    }

    const number = numeric(row[0]);
    const name = text(row[1]);
    if (
      !grade ||
      !classNo ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > 99 ||
      !name
    ) {
      continue;
    }

    students.push({
      studentId: buildStudentId(grade, classNo, number),
      name,
      grade,
      classNo,
      number,
      absence: numeric(row[4]),
      tardy: numeric(row[7]),
      earlyLeave: numeric(row[10]),
      result: numeric(row[13]),
    });
  }

  return { students, classLabels: [...classLabels] };
}

export function parseGuidanceRows(rows: unknown[][]): GuidanceStudent[] {
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map((cell) => text(cell));
    return (
      cells.includes("학번") &&
      cells.includes("이름") &&
      cells.includes("생활지도") &&
      cells.includes("지도횟수")
    );
  });

  if (headerIndex < 0) {
    throw new Error(
      "생활지도 파일에서 학번·이름·생활지도·지도횟수 열을 찾지 못했습니다.",
    );
  }

  const header = rows[headerIndex].map((cell) => text(cell));
  const sequenceCol = header.indexOf("순번");
  const idCol = header.indexOf("학번");
  const nameCol = header.indexOf("이름");
  const pointsCol = header.indexOf("생활지도");
  const countCol = header.indexOf("지도횟수");
  const result: GuidanceStudent[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rawId = text(row[idCol]).replace(/\D/g, "");
    const studentId = rawId.padStart(5, "0");
    const name = text(row[nameCol]);
    const grade = numeric(studentId.slice(0, 1));
    if (!name || studentId.length !== 5 || ![1, 2, 3].includes(grade)) {
      return;
    }
    result.push({
      sequence: numeric(row[sequenceCol]) || offset + 1,
      studentId,
      name,
      grade,
      points: numeric(row[pointsCol]),
      guidanceCount: numeric(row[countCol]),
    });
  });

  return result;
}

export function getBasicSanction(
  studentId: string,
  points: number,
): Sanction | null {
  const base = {
    id: `${studentId}:basic`,
    source: "기본생활" as const,
    reason: `생활지도 벌점 ${points}점`,
  };
  if (points < 3) return null;
  if (points <= 5) return { ...base, type: "교내봉사", days: 3 };
  if (points <= 8) return { ...base, type: "교내봉사", days: 5 };
  if (points <= 11) return { ...base, type: "사회봉사", days: 3 };
  if (points <= 14) return { ...base, type: "사회봉사", days: 5 };
  if (points <= 17) return { ...base, type: "특별교육", days: 3 };
  if (points <= 20) return { ...base, type: "특별교육", days: 5 };
  if (points <= 23) return { ...base, type: "출석정지", days: 3 };
  if (points <= 26) return { ...base, type: "출석정지", days: 5 };
  return { ...base, type: "출석정지", days: 10 };
}

export function getTardySanction(
  studentId: string,
  tardy: number,
): Sanction | null {
  const base = {
    id: `${studentId}:tardy`,
    source: "미인정지각" as const,
    reason: `미인정지각 ${tardy}회`,
  };
  if (tardy < 5) return null;
  if (tardy <= 9) return { ...base, type: "교내봉사", days: 5 };
  if (tardy <= 14) return { ...base, type: "사회봉사", days: 5 };
  if (tardy <= 19) return { ...base, type: "특별교육", days: 5 };
  if (tardy <= 24) return { ...base, type: "출석정지", days: 5 };
  if (tardy <= 29) return { ...base, type: "출석정지", days: 10 };
  return { ...base, type: "출석정지", days: null };
}

export function getOtherAttendanceSanction(
  studentId: string,
  total: number,
): Sanction | null {
  const base = {
    id: `${studentId}:other`,
    source: "기타 미인정 합계" as const,
    reason: `미인정결과·조퇴·결석 합계 ${total}회`,
  };
  if (total < 2) return null;
  if (total <= 3) return { ...base, type: "교내봉사", days: 5 };
  if (total <= 5) return { ...base, type: "사회봉사", days: 5 };
  if (total <= 7) return { ...base, type: "특별교육", days: 5 };
  return { ...base, type: "출석정지", days: null };
}

export function buildStudentRecords(
  attendanceStudents: AttendanceStudent[],
  guidanceStudents: GuidanceStudent[],
): StudentRecord[] {
  const attendanceMap = new Map<string, AttendanceStudent>();
  for (const student of attendanceStudents) {
    const current = attendanceMap.get(student.studentId);
    if (!current) {
      attendanceMap.set(student.studentId, student);
      continue;
    }
    attendanceMap.set(student.studentId, {
      ...student,
      tardy: Math.max(current.tardy, student.tardy),
      result: Math.max(current.result, student.result),
      earlyLeave: Math.max(current.earlyLeave, student.earlyLeave),
      absence: Math.max(current.absence, student.absence),
    });
  }

  const guidanceMap = new Map<string, GuidanceStudent>();
  for (const student of guidanceStudents) {
    const current = guidanceMap.get(student.studentId);
    if (!current || student.points >= current.points) {
      guidanceMap.set(student.studentId, student);
    }
  }

  const ids = new Set([...attendanceMap.keys(), ...guidanceMap.keys()]);
  return [...ids]
    .map((studentId) => {
      const attendance = attendanceMap.get(studentId);
      const guidance = guidanceMap.get(studentId);
      const parts = partsFromStudentId(studentId);
      const sanctions: Sanction[] = [];
      const basic = getBasicSanction(studentId, guidance?.points ?? 0);
      const tardy = getTardySanction(studentId, attendance?.tardy ?? 0);
      const otherTotal =
        (attendance?.result ?? 0) +
        (attendance?.earlyLeave ?? 0) +
        (attendance?.absence ?? 0);
      const other = getOtherAttendanceSanction(studentId, otherTotal);
      if (basic) sanctions.push(basic);
      if (tardy) sanctions.push(tardy);
      if (other) sanctions.push(other);

      return {
        studentId,
        name: attendance?.name || guidance?.name || "",
        grade: attendance?.grade ?? guidance?.grade ?? parts.grade,
        classNo: attendance?.classNo ?? parts.classNo,
        number: attendance?.number ?? parts.number,
        attendance,
        guidance,
        sanctions,
      };
    })
    .sort(
      (a, b) =>
        a.grade - b.grade ||
        a.classNo - b.classNo ||
        a.number - b.number ||
        a.name.localeCompare(b.name, "ko"),
    );
}

export function sanctionLabel(sanction: Sanction): string {
  return sanction.days === null
    ? `${sanction.type} 협의`
    : `${sanction.type} ${sanction.days}일`;
}

export function applyIncomplete(sanction: Sanction): Sanction {
  if (sanction.type === "출석정지") return sanction;
  const nextType =
    sanctionOrder[sanctionOrder.indexOf(sanction.type) + 1] ?? sanction.type;
  return { ...sanction, type: nextType };
}

export function effectiveSanction(
  sanction: Sanction,
  incompleteIds: Set<string>,
): Sanction {
  return incompleteIds.has(sanction.id)
    ? applyIncomplete(sanction)
    : sanction;
}

export function summarizeSanctions(
  sanctions: Sanction[],
  incompleteIds: Set<string>,
): string {
  const effective = sanctions.map((item) =>
    effectiveSanction(item, incompleteIds),
  );
  const fixedDays = new Map<SanctionType, number>();
  const discussions = new Set<SanctionType>();

  for (const sanction of effective) {
    if (sanction.days === null) {
      discussions.add(sanction.type);
    } else {
      fixedDays.set(
        sanction.type,
        (fixedDays.get(sanction.type) ?? 0) + sanction.days,
      );
    }
  }

  const labels: string[] = [];
  for (const type of sanctionOrder) {
    const days = fixedDays.get(type);
    if (days) labels.push(`${type} ${days}일`);
    if (discussions.has(type)) labels.push(`${type} 협의`);
  }
  return labels.join(" + ") || "해당 없음";
}
