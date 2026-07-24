"use client";

import { ChangeEvent, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AttendanceStudent,
  GuidanceStudent,
  Sanction,
  buildStudentRecords,
  effectiveSanction,
  getBasicSanction,
  parseAttendanceRows,
  parseGuidanceRows,
  sanctionLabel,
  summarizeSanctions,
} from "@/lib/discipline";

type TabKey = "combined" | "grade1" | "grade2" | "grade3" | "rules";

const tabs: { id: TabKey; label: string }[] = [
  { id: "combined", label: "통합 결과" },
  { id: "grade1", label: "1학년 생활지도" },
  { id: "grade2", label: "2학년 생활지도" },
  { id: "grade3", label: "3학년 생활지도" },
  { id: "rules", label: "기준표" },
];

const formatStudentNumber = (studentId: string) => {
  const grade = Number(studentId.slice(0, 1));
  const classNo = Number(studentId.slice(1, 3));
  const number = Number(studentId.slice(3, 5));
  return `${grade}-${classNo}-${String(number).padStart(2, "0")}`;
};

const readRows = async (file: File): Promise<unknown[][]> => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
};

function SanctionPill({
  sanction,
  incomplete,
}: {
  sanction: Sanction;
  incomplete?: boolean;
}) {
  const shown = incomplete ? effectiveSanction(sanction, new Set([sanction.id])) : sanction;
  return (
    <span className={`sanction-pill sanction-${shown.type}`}>
      {sanctionLabel(shown)}
      {incomplete ? " · 미이수 반영" : ""}
    </span>
  );
}

export function DisciplineApp() {
  const [attendanceStudents, setAttendanceStudents] = useState<
    AttendanceStudent[]
  >([]);
  const [guidanceStudents, setGuidanceStudents] = useState<GuidanceStudent[]>(
    [],
  );
  const [attendanceFiles, setAttendanceFiles] = useState<string[]>([]);
  const [guidanceFile, setGuidanceFile] = useState("");
  const [classLabels, setClassLabels] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("combined");
  const [incompleteIds, setIncompleteIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const records = useMemo(
    () => buildStudentRecords(attendanceStudents, guidanceStudents),
    [attendanceStudents, guidanceStudents],
  );
  const targets = useMemo(
    () => records.filter((record) => record.sanctions.length > 0),
    [records],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase("ko");
  const filteredTargets = targets.filter((record) => {
    if (!normalizedSearch) return true;
    return (
      record.name.toLocaleLowerCase("ko").includes(normalizedSearch) ||
      record.studentId.includes(normalizedSearch) ||
      formatStudentNumber(record.studentId).includes(normalizedSearch)
    );
  });

  const handleAttendanceFiles = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          const rows = await readRows(file);
          return parseAttendanceRows(rows);
        }),
      );
      const students = parsed.flatMap((item) => item.students);
      if (!students.length) {
        throw new Error(
          "출결 파일에서 학년·반과 학생별 출결 자료를 찾지 못했습니다.",
        );
      }
      setAttendanceStudents(students);
      setAttendanceFiles(files.map((file) => file.name));
      setClassLabels([
        ...new Set(parsed.flatMap((item) => item.classLabels)),
      ].sort((a, b) => a.localeCompare(b, "ko", { numeric: true })));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "출결 파일을 읽는 중 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const handleGuidanceFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const students = parseGuidanceRows(await readRows(file));
      if (!students.length) {
        throw new Error("생활지도 파일에 유효한 학생 자료가 없습니다.");
      }
      setGuidanceStudents(students);
      setGuidanceFile(file.name);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "생활지도 파일을 읽는 중 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  const toggleIncomplete = (sanctionId: string) => {
    setIncompleteIds((current) => {
      const next = new Set(current);
      if (next.has(sanctionId)) next.delete(sanctionId);
      else next.add(sanctionId);
      return next;
    });
  };

  const exportWorkbook = () => {
    const workbook = XLSX.utils.book_new();
    const combinedRows = targets.map((record) => {
      const attendance = record.attendance;
      const otherTotal =
        (attendance?.result ?? 0) +
        (attendance?.earlyLeave ?? 0) +
        (attendance?.absence ?? 0);
      return {
        학번: formatStudentNumber(record.studentId),
        이름: record.name,
        생활지도벌점: record.guidance?.points ?? 0,
        미인정지각: attendance?.tardy ?? 0,
        미인정결과: attendance?.result ?? 0,
        미인정조퇴: attendance?.earlyLeave ?? 0,
        미인정결석: attendance?.absence ?? 0,
        기타미인정합계: otherTotal,
        산정내역: record.sanctions
          .map(
            (item) =>
              `${item.source}: ${sanctionLabel(item)}${
                incompleteIds.has(item.id) ? "(미이수)" : ""
              }`,
          )
          .join(" / "),
        최종처분: summarizeSanctions(record.sanctions, incompleteIds),
      };
    });
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(combinedRows),
      "통합 결과",
    );

    [1, 2, 3].forEach((grade) => {
      const gradeRows = guidanceStudents
        .filter((student) => student.grade === grade)
        .map((student) => {
          const sanction = getBasicSanction(student.studentId, student.points);
          return {
            순번: student.sequence,
            학번: formatStudentNumber(student.studentId),
            이름: student.name,
            생활지도: student.points,
            지도횟수: student.guidanceCount,
            기본생활처분: sanction
              ? sanctionLabel(
                  effectiveSanction(sanction, incompleteIds),
                )
              : "",
            미이수: sanction && incompleteIds.has(sanction.id) ? "미이수" : "",
          };
        });
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(gradeRows),
        `${grade}학년 생활지도`,
      );
    });

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `학생생활교육_징계산정_${stamp}.xlsx`);
  };

  const renderCompletionToggle = (sanction: Sanction) => (
    <label className="completion-toggle" key={sanction.id}>
      <input
        type="checkbox"
        checked={incompleteIds.has(sanction.id)}
        onChange={() => toggleIncomplete(sanction.id)}
      />
      <span className="checkbox-visual" aria-hidden="true" />
      <span>
        {sanction.source}
        <small>
          {incompleteIds.has(sanction.id) ? "미이수" : "이수(기본)"}
        </small>
      </span>
    </label>
  );

  const renderCombined = () => (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">통합 산정</span>
          <h2>징계 대상자 {filteredTargets.length}명</h2>
          <p>
            지각, 기타 미인정 합계, 기본생활 처분을 각각 계산한 뒤 같은
            처분의 일수를 합산합니다.
          </p>
        </div>
        <button
          className="export-button"
          onClick={exportWorkbook}
          disabled={!targets.length}
        >
          결과 엑셀 내보내기
        </button>
      </div>

      <div className="toolbar">
        <label className="search-box">
          <span>학생 검색</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="이름 또는 학번"
          />
        </label>
        <span className="result-note">
          미이수 체크 {incompleteIds.size}건
        </span>
      </div>

      {!filteredTargets.length ? (
        <EmptyState
          title="산정된 대상자가 없습니다"
          description="두 엑셀 파일을 넣으면 기준을 충족한 학생이 여기에 표시됩니다."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>학번</th>
                <th>이름</th>
                <th>입력값</th>
                <th>산정 내역</th>
                <th>최종 처분</th>
                <th>이수 여부</th>
              </tr>
            </thead>
            <tbody>
              {filteredTargets.map((record) => {
                const attendance = record.attendance;
                const otherTotal =
                  (attendance?.result ?? 0) +
                  (attendance?.earlyLeave ?? 0) +
                  (attendance?.absence ?? 0);
                return (
                  <tr key={record.studentId}>
                    <td className="student-number">
                      {formatStudentNumber(record.studentId)}
                    </td>
                    <td className="student-name">{record.name}</td>
                    <td>
                      <div className="metric-list">
                        <span>벌점 {record.guidance?.points ?? 0}</span>
                        <span>지각 {attendance?.tardy ?? 0}</span>
                        <span>기타 {otherTotal}</span>
                      </div>
                    </td>
                    <td>
                      <div className="sanction-list">
                        {record.sanctions.map((sanction) => (
                          <div className="sanction-detail" key={sanction.id}>
                            <strong>{sanction.source}</strong>
                            <SanctionPill
                              sanction={sanction}
                              incomplete={incompleteIds.has(sanction.id)}
                            />
                            <small>{sanction.reason}</small>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="final-sanction">
                      {summarizeSanctions(record.sanctions, incompleteIds)}
                    </td>
                    <td>
                      <div className="completion-list">
                        {record.sanctions.map(renderCompletionToggle)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderGrade = (grade: number) => {
    const rows = guidanceStudents.filter((student) => {
      if (student.grade !== grade) return false;
      const sanction = getBasicSanction(student.studentId, student.points);
      if (onlyTargets && !sanction) return false;
      if (!normalizedSearch) return true;
      return (
        student.name.toLocaleLowerCase("ko").includes(normalizedSearch) ||
        student.studentId.includes(normalizedSearch) ||
        formatStudentNumber(student.studentId).includes(normalizedSearch)
      );
    });
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{grade}학년</span>
            <h2>생활지도 목록 {rows.length}명</h2>
            <p>
              `생활지도` 열을 벌점으로 사용하며 `지도횟수`는 참고값으로
              표시합니다.
            </p>
          </div>
        </div>
        <div className="toolbar">
          <label className="search-box">
            <span>학생 검색</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름 또는 학번"
            />
          </label>
          <label className="target-filter">
            <input
              type="checkbox"
              checked={onlyTargets}
              onChange={(event) => setOnlyTargets(event.target.checked)}
            />
            징계 대상만 보기
          </label>
        </div>
        {!rows.length ? (
          <EmptyState
            title={`${grade}학년 자료가 없습니다`}
            description="생활지도 엑셀 파일을 넣으면 학번 첫 자리로 자동 분류됩니다."
          />
        ) : (
          <div className="table-wrap grade-table">
            <table>
              <thead>
                <tr>
                  <th>순번</th>
                  <th>학번</th>
                  <th>이름</th>
                  <th>생활지도 벌점</th>
                  <th>지도횟수</th>
                  <th>기본생활 처분</th>
                  <th>이수 여부</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => {
                  const sanction = getBasicSanction(
                    student.studentId,
                    student.points,
                  );
                  return (
                    <tr key={student.studentId}>
                      <td>{student.sequence}</td>
                      <td className="student-number">
                        {formatStudentNumber(student.studentId)}
                      </td>
                      <td className="student-name">{student.name}</td>
                      <td className="score-cell">{student.points}</td>
                      <td>{student.guidanceCount}</td>
                      <td>
                        {sanction ? (
                          <SanctionPill
                            sanction={sanction}
                            incomplete={incompleteIds.has(sanction.id)}
                          />
                        ) : (
                          <span className="no-sanction">해당 없음</span>
                        )}
                      </td>
                      <td>
                        {sanction ? (
                          renderCompletionToggle(sanction)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <main>
      <header className="hero">
        <div className="hero-copy">
          <span className="product-mark">양곡고등학교 · 학생생활교육</span>
          <h1>
            엑셀 두 종류만 넣으면
            <br />
            징계 기준이 한눈에 정리됩니다.
          </h1>
          <p>
            나이스 출결과 생활지도 목록을 브라우저에서 바로 분석합니다.
            파일과 학생 정보는 서버로 전송되지 않습니다.
          </p>
        </div>
        <div className="privacy-card">
          <span className="privacy-dot" />
          <div>
            <strong>브라우저 안에서만 처리</strong>
            <p>업로드한 파일은 이 기기를 벗어나지 않습니다.</p>
          </div>
        </div>
      </header>

      <section className="upload-grid" aria-label="엑셀 파일 입력">
        <label className="upload-card">
          <input
            type="file"
            multiple
            accept=".xls,.xlsx"
            onChange={handleAttendanceFiles}
            disabled={busy}
          />
          <span className="upload-step">01</span>
          <strong>나이스 출결 파일</strong>
          <p>반별 XLS 또는 XLSX 파일을 여러 개 선택하세요.</p>
          <span className="file-status">
            {attendanceFiles.length
              ? `${attendanceFiles.length}개 파일 · ${classLabels.length}개 반`
              : "파일 선택"}
          </span>
        </label>
        <label className="upload-card">
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={handleGuidanceFile}
            disabled={busy}
          />
          <span className="upload-step">02</span>
          <strong>생활지도 목록</strong>
          <p>학번, 이름, 생활지도, 지도횟수 열이 있는 파일입니다.</p>
          <span className="file-status">
            {guidanceFile || "파일 선택"}
          </span>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {busy ? <div className="loading-banner">엑셀 자료를 읽는 중입니다…</div> : null}

      <section className="summary-strip" aria-label="자료 요약">
        <div>
          <span>출결 학생</span>
          <strong>{attendanceStudents.length.toLocaleString("ko-KR")}</strong>
        </div>
        <div>
          <span>생활지도 학생</span>
          <strong>{guidanceStudents.length.toLocaleString("ko-KR")}</strong>
        </div>
        <div>
          <span>징계 대상</span>
          <strong>{targets.length.toLocaleString("ko-KR")}</strong>
        </div>
        <div>
          <span>미이수 체크</span>
          <strong>{incompleteIds.size.toLocaleString("ko-KR")}</strong>
        </div>
      </section>

      <nav className="tabs" aria-label="결과 보기">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => {
              setActiveTab(tab.id);
              setSearch("");
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "combined" ? renderCombined() : null}
      {activeTab === "grade1" ? renderGrade(1) : null}
      {activeTab === "grade2" ? renderGrade(2) : null}
      {activeTab === "grade3" ? renderGrade(3) : null}
      {activeTab === "rules" ? <RulesPanel /> : null}

      <footer>
        <strong>학생생활교육 징계 산정</strong>
        <span>최종 처분 전 담당자 확인이 필요합니다.</span>
      </footer>
    </main>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span>자료 대기</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function RulesPanel() {
  return (
    <section className="panel rules-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">산정 기준</span>
          <h2>현재 적용 중인 징계 기준</h2>
          <p>미인정지각과 기타 미인정 합계는 각각 산정해 합산합니다.</p>
        </div>
      </div>
      <div className="rule-grid">
        <RuleTable
          title="미인정지각"
          rows={[
            ["5~9회", "교내봉사 5일"],
            ["10~14회", "사회봉사 5일"],
            ["15~19회", "특별교육 5일"],
            ["20~24회", "출석정지 5일"],
            ["25~29회", "출석정지 10일"],
            ["30회 이상", "출석정지 협의"],
          ]}
        />
        <RuleTable
          title="미인정결과·조퇴·결석 합계"
          rows={[
            ["2~3회", "교내봉사 5일"],
            ["4~5회", "사회봉사 5일"],
            ["6~7회", "특별교육 5일"],
            ["8회 이상", "출석정지 협의"],
          ]}
        />
        <RuleTable
          title="기본생활 벌점"
          rows={[
            ["3~5점", "교내봉사 3일"],
            ["6~8점", "교내봉사 5일"],
            ["9~11점", "사회봉사 3일"],
            ["12~14점", "사회봉사 5일"],
            ["15~17점", "특별교육 3일"],
            ["18~20점", "특별교육 5일"],
            ["21~23점", "출석정지 3일"],
            ["24~26점", "출석정지 5일"],
            ["27점 이상", "출석정지 10일"],
          ]}
        />
      </div>
      <div className="rule-notes">
        <div>
          <strong>합산 원칙</strong>
          <p>
            기본생활, 미인정지각, 기타 미인정 합계의 처분을 각각 부과하며
            같은 처분은 일수를 합산합니다.
          </p>
        </div>
        <div>
          <strong>미이수 원칙</strong>
          <p>
            기본값은 이수입니다. 미이수 체크 시 기간을 유지하고
            교내봉사 → 사회봉사 → 특별교육 → 출석정지 순으로 올립니다.
          </p>
        </div>
      </div>
    </section>
  );
}

function RuleTable({
  title,
  rows,
}: {
  title: string;
  rows: string[][];
}) {
  return (
    <article className="rule-card">
      <h3>{title}</h3>
      <table>
        <tbody>
          {rows.map(([range, sanction]) => (
            <tr key={range}>
              <td>{range}</td>
              <td>{sanction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
