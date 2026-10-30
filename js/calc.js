// 月の集計。保存はせず、毎回記録から計算する（過去の記録を直しても自動で正しくなる）。

export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

// 奉仕時間の繰り越し:
//   1時間に満たない端数は翌月へ繰り越す。毎月「前月の繰り越し + 今月の分」から
//   1時間単位を報告し、残りを翌月へ送る。これを最初の月から続けると、
//   ある月への繰り越しは「その月より前の全記録の合計分 ÷ 60 の余り」と一致する。
export function monthSummary(ym, all) {
  let before = 0;
  let monthMinutes = 0;
  for (const r of all.serviceTimes) {
    const k = r.date.slice(0, 7);
    if (k < ym) before += r.minutes;
    else if (k === ym) monthMinutes += r.minutes;
  }
  const carryIn = before % 60;
  const total = carryIn + monthMinutes;

  const others = all.otherTimes
    .filter((r) => r.date.slice(0, 7) === ym)
    .sort((a, b) => a.date.localeCompare(b.date));
  const otherByTitle = new Map();
  for (const r of others) otherByTitle.set(r.title, (otherByTitle.get(r.title) || 0) + r.hours);

  // レッスン件数 = その月に実際にレッスンを行った相手の人数（重複なし）
  const lessonPeople = new Set(
    all.lessonRecords.filter((r) => r.date.slice(0, 7) === ym).map((r) => r.personId),
  );

  return {
    ym,
    monthMinutes,
    carryIn,
    total,
    reportHours: Math.floor(total / 60),
    carryOut: total % 60,
    otherHours: others.reduce((s, r) => s + r.hours, 0),
    otherByTitle: [...otherByTitle].map(([title, hours]) => ({ title, hours })),
    lessonCount: lessonPeople.size,
    lessonPersonIds: [...lessonPeople],
  };
}
