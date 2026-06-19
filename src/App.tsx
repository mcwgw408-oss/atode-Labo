import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "atode-labo-items";
const ALL = "すべて";

const categories = [
  "あとで読む",
  "あとで聞く",
  "あとで見る",
  "あとで交流",
  "企画・締切",
  "ライブ・予定",
  "その他",
] as const;

const sources = ["Voicy", "Substack", "Threads", "note", "X", "その他"] as const;
const priorities = ["高", "中", "低"] as const;
const statuses = ["未対応", "対応中", "完了"] as const;
const scheduleModes = ["単発予定", "定期予定"] as const;
const scheduleKinds = [
  "ライブ配信",
  "Voicy",
  "Zoom",
  "訪看",
  "ヘルパー",
  "企画締切",
  "相談",
  "その他",
] as const;
const repeatTypes = ["なし", "毎日", "毎週", "毎月", "任意曜日"] as const;
const weekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Category = (typeof categories)[number];
type Source = (typeof sources)[number];
type Priority = (typeof priorities)[number];
type Status = (typeof statuses)[number];
type ScheduleMode = (typeof scheduleModes)[number];
type ScheduleKind = (typeof scheduleKinds)[number];
type RepeatType = (typeof repeatTypes)[number];

type Item = {
  id: string;
  title: string;
  category: Category;
  source: Source;
  memo: string;
  dateTime: string;
  deadline: string;
  priority: Priority;
  status: Status;
  scheduleMode: ScheduleMode;
  scheduleKind: ScheduleKind;
  repeatType: RepeatType;
  repeatWeekdays: number[];
  createdAt: string;
  updatedAt: string;
};

type Draft = Omit<Item, "id" | "createdAt" | "updatedAt">;
type FilterRange = "all" | "today" | "week" | "deadline";
type ScheduleOccurrence = {
  id: string;
  item: Item;
  date: Date;
  label: string;
};

const emptyDraft: Draft = {
  title: "",
  category: "ライブ・予定",
  source: "その他",
  memo: "",
  dateTime: "",
  deadline: "",
  priority: "中",
  status: "未対応",
  scheduleMode: "単発予定",
  scheduleKind: "その他",
  repeatType: "なし",
  repeatWeekdays: [],
};

const categoryTone: Record<Category, string> = {
  "あとで読む": "tone-read",
  "あとで聞く": "tone-listen",
  "あとで見る": "tone-watch",
  "あとで交流": "tone-social",
  "企画・締切": "tone-deadline",
  "ライブ・予定": "tone-plan",
  "その他": "tone-other",
};

const sampleItems: Item[] = [
  {
    ...emptyDraft,
    id: "sample-visit",
    title: "訪問看護",
    category: "ライブ・予定",
    scheduleMode: "定期予定",
    scheduleKind: "訪看",
    repeatType: "毎週",
    dateTime: getDateInputValue(0, 11),
    priority: "高",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    ...emptyDraft,
    id: "sample-note",
    title: "noteで見てほしい記事を確認",
    category: "あとで読む",
    source: "note",
    scheduleMode: "単発予定",
    scheduleKind: "その他",
    memo: "日付・時間に入れると、今日/明日/今週に出ます",
    dateTime: getDateInputValue(0, 11),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function getDateInputValue(offsetDays: number, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfDay(offsetDays: number) {
  const date = startOfToday();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function endOfDay(offsetDays: number) {
  const date = startOfDay(offsetDays);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(value: string) {
  const date = parseLocalDate(value);
  return Boolean(date && isSameDay(date, startOfToday()));
}

function isWithinDays(value: string, days: number) {
  const date = parseLocalDate(value);
  return Boolean(date && date >= startOfToday() && date <= endOfDay(days));
}

function setTimeFromBase(date: Date, base: Date) {
  const next = new Date(date);
  next.setHours(base.getHours(), base.getMinutes(), 0, 0);
  return next;
}

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? parseLocalDate(value) : value;
  if (!date) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getScheduleDate(item: Item) {
  return parseLocalDate(item.dateTime) || parseLocalDate(item.deadline);
}

function isScheduled(item: Item) {
  return Boolean(item.dateTime || item.deadline || item.scheduleMode === "定期予定");
}

function createOccurrence(item: Item, date: Date, label: string): ScheduleOccurrence {
  return {
    id: `${item.id}-${date.toISOString()}`,
    item,
    date,
    label,
  };
}

function getOccurrences(item: Item, days = 7): ScheduleOccurrence[] {
  const base = getScheduleDate(item);
  if (!base || item.status === "完了") return [];

  if (item.scheduleMode === "単発予定" || item.repeatType === "なし") {
    return base >= startOfToday() && base <= endOfDay(days)
      ? [createOccurrence(item, base, "単発")]
      : [];
  }

  const occurrences: ScheduleOccurrence[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = startOfDay(offset);
    const weekday = date.getDay();
    const dayMatches =
      item.repeatType === "毎日" ||
      (item.repeatType === "毎週" && weekday === base.getDay()) ||
      (item.repeatType === "毎月" && date.getDate() === base.getDate()) ||
      (item.repeatType === "任意曜日" && item.repeatWeekdays.includes(weekday));

    if (dayMatches) {
      occurrences.push(createOccurrence(item, setTimeFromBase(date, base), item.repeatType));
    }
  }

  return occurrences;
}

function normalizeImportedItems(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  const now = new Date().toISOString();

  return value
    .filter((entry): entry is Partial<Item> => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
      title: typeof entry.title === "string" ? entry.title : "",
      category: categories.includes(entry.category as Category) ? (entry.category as Category) : "その他",
      source: sources.includes(entry.source as Source) ? (entry.source as Source) : "その他",
      memo: typeof entry.memo === "string" ? entry.memo : "",
      dateTime: typeof entry.dateTime === "string" ? entry.dateTime : "",
      deadline: typeof entry.deadline === "string" ? entry.deadline : "",
      priority: priorities.includes(entry.priority as Priority) ? (entry.priority as Priority) : "中",
      status: statuses.includes(entry.status as Status) ? (entry.status as Status) : "未対応",
      scheduleMode: scheduleModes.includes(entry.scheduleMode as ScheduleMode)
        ? (entry.scheduleMode as ScheduleMode)
        : "単発予定",
      scheduleKind: scheduleKinds.includes(entry.scheduleKind as ScheduleKind)
        ? (entry.scheduleKind as ScheduleKind)
        : "その他",
      repeatType: repeatTypes.includes(entry.repeatType as RepeatType)
        ? (entry.repeatType as RepeatType)
        : "なし",
      repeatWeekdays: Array.isArray(entry.repeatWeekdays)
        ? entry.repeatWeekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
      updatedAt: now,
    }))
    .filter((entry) => entry.title.trim());
}

export default function App() {
  const [items, setItems] = useState<Item[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return sampleItems;

    try {
      const normalized = normalizeImportedItems(JSON.parse(saved));
      return normalized.length ? normalized : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | typeof ALL>(ALL);
  const [sourceFilter, setSourceFilter] = useState<Source | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<Priority | typeof ALL>(ALL);
  const [rangeFilter, setRangeFilter] = useState<FilterRange>("all");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const activeItems = useMemo(() => items.filter((item) => item.status !== "完了"), [items]);
  const scheduleOccurrences = useMemo(
    () => activeItems.flatMap((item) => getOccurrences(item, 7)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [activeItems],
  );

  const todaySchedule = useMemo(
    () => scheduleOccurrences.filter((occurrence) => isSameDay(occurrence.date, startOfDay(0))),
    [scheduleOccurrences],
  );
  const tomorrowSchedule = useMemo(
    () => scheduleOccurrences.filter((occurrence) => isSameDay(occurrence.date, startOfDay(1))),
    [scheduleOccurrences],
  );
  const weekSchedule = useMemo(
    () => scheduleOccurrences.filter((occurrence) => occurrence.date >= startOfToday() && occurrence.date <= endOfDay(7)),
    [scheduleOccurrences],
  );

  const todayItems = useMemo(
    () => activeItems.filter((item) => isToday(item.dateTime) || isToday(item.deadline)),
    [activeItems],
  );
  const urgentDeadlines = useMemo(
    () => activeItems.filter((item) => isWithinDays(item.deadline, 7)).sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [activeItems],
  );
  const laterItems = useMemo(
    () => activeItems.filter((item) => item.category.startsWith("あとで") && !isScheduled(item)),
    [activeItems],
  );
  const unresolvedItems = useMemo(() => items.filter((item) => item.status === "未対応"), [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = categoryFilter === ALL || item.category === categoryFilter;
      const matchesSource = sourceFilter === ALL || item.source === sourceFilter;
      const matchesPriority = priorityFilter === ALL || item.priority === priorityFilter;
      const matchesRange =
        rangeFilter === "all" ||
        (rangeFilter === "today" && (isToday(item.dateTime) || isToday(item.deadline))) ||
        (rangeFilter === "week" && getOccurrences(item, 7).length > 0) ||
        (rangeFilter === "deadline" && Boolean(item.deadline));

      return matchesCategory && matchesSource && matchesPriority && matchesRange;
    });
  }, [categoryFilter, items, priorityFilter, rangeFilter, sourceFilter]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "scheduleMode" && value === "単発予定") {
        next.repeatType = "なし";
        next.repeatWeekdays = [];
      }
      if (key === "scheduleMode" && value === "定期予定" && next.repeatType === "なし") {
        next.repeatType = "毎週";
      }
      return next;
    });
  }

  function toggleWeekday(day: number) {
    setDraft((current) => ({
      ...current,
      repeatWeekdays: current.repeatWeekdays.includes(day)
        ? current.repeatWeekdays.filter((value) => value !== day)
        : [...current.repeatWeekdays, day].sort(),
    }));
  }

  function resetForm() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) return;

    const now = new Date().toISOString();
    const cleanedDraft = {
      ...draft,
      title,
      repeatType: draft.scheduleMode === "単発予定" ? "なし" : draft.repeatType,
      repeatWeekdays: draft.repeatType === "任意曜日" ? draft.repeatWeekdays : [],
    };

    if (editingId) {
      setItems((current) =>
        current.map((item) => (item.id === editingId ? { ...item, ...cleanedDraft, updatedAt: now } : item)),
      );
      setNotice("更新しました");
    } else {
      setItems((current) => [
        {
          ...cleanedDraft,
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ]);
      setNotice("置いておきました");
    }
    resetForm();
  }

  function quickAdd(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    setItems((current) => [
      {
        ...emptyDraft,
        title: trimmed,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      },
      ...current,
    ]);
    setNotice("タイトルだけ保存しました");
  }

  function completeItem(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status: "完了", updatedAt: new Date().toISOString() } : item)),
    );
  }

  function editItem(item: Item) {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...editable } = item;
    setDraft(editable);
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteItem(id: string) {
    const target = items.find((item) => item.id === id);
    if (!target) return;
    if (!confirm(`「${target.title}」を削除しますか？`)) return;
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `atode-labo-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = normalizeImportedItems(JSON.parse(await file.text()));
      if (!imported.length) {
        setNotice("読み込めるデータがありませんでした");
        return;
      }
      setItems(imported);
      setNotice(`${imported.length}件を読み込みました`);
    } catch {
      setNotice("JSONを読み込めませんでした");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">あとで-Labo</p>
          <h1>近日中に何があるか、ぱっと見えるように。</h1>
          <p>
            単発予定と定期予定を分けて保存できます。毎日・毎週・毎月・任意曜日の繰り返しを設定できます。
          </p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <form className="capture-panel" onSubmit={handleSubmit}>
        <label className="title-input">
          <span>タイトル</span>
          <input
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                quickAdd(draft.title);
              }
            }}
            placeholder="例: 訪問看護、Zoom相談、金曜のVoicy"
            autoFocus
          />
        </label>

        <div className="form-grid">
          <label>
            予定
            <select value={draft.scheduleMode} onChange={(event) => updateDraft("scheduleMode", event.target.value as ScheduleMode)}>
              {scheduleModes.map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </label>
          <label>
            種別
            <select value={draft.scheduleKind} onChange={(event) => updateDraft("scheduleKind", event.target.value as ScheduleKind)}>
              {scheduleKinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label>
            繰り返し
            <select
              value={draft.repeatType}
              disabled={draft.scheduleMode === "単発予定"}
              onChange={(event) => updateDraft("repeatType", event.target.value as RepeatType)}
            >
              {repeatTypes.map((repeat) => (
                <option key={repeat}>{repeat}</option>
              ))}
            </select>
          </label>
          <label>
            情報元
            <select value={draft.source} onChange={(event) => updateDraft("source", event.target.value as Source)}>
              {sources.map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </label>
          <label>
            カテゴリ
            <select value={draft.category} onChange={(event) => updateDraft("category", event.target.value as Category)}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            優先度
            <select value={draft.priority} onChange={(event) => updateDraft("priority", event.target.value as Priority)}>
              {priorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
          <label>
            状態
            <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as Status)}>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            日付・時間
            <input type="datetime-local" value={draft.dateTime} onChange={(event) => updateDraft("dateTime", event.target.value)} />
          </label>
          <label>
            締切
            <input type="date" value={draft.deadline} onChange={(event) => updateDraft("deadline", event.target.value)} />
          </label>
          {draft.scheduleMode === "定期予定" && draft.repeatType === "任意曜日" && (
            <fieldset className="weekday-field">
              <legend>曜日</legend>
              <div className="weekday-row">
                {weekdays.map((label, day) => (
                  <label key={label} className="weekday-toggle">
                    <input type="checkbox" checked={draft.repeatWeekdays.includes(day)} onChange={() => toggleWeekday(day)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="memo-field">
            メモ
            <textarea
              value={draft.memo}
              onChange={(event) => updateDraft("memo", event.target.value)}
              placeholder="リンク、補足、思い出すためのメモ"
            />
          </label>
        </div>

        <div className="actions-row">
          <button className="primary-button" type="submit">
            {editingId ? "更新" : "保存"}
          </button>
          <button type="button" onClick={() => quickAdd(draft.title)}>
            タイトルだけ保存
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              編集をやめる
            </button>
          )}
          {notice && <span className="notice">{notice}</span>}
        </div>
      </form>

      <section className="schedule-view">
        <div className="section-heading">
          <div>
            <p className="eyebrow">予定</p>
            <h2>近日予定</h2>
          </div>
        </div>
        <div className="schedule-grid">
          <ScheduleList title="今日" occurrences={todaySchedule} empty="今日の予定はありません" />
          <ScheduleList title="明日" occurrences={tomorrowSchedule} empty="明日の予定はありません" />
          <ScheduleList title="今週" occurrences={weekSchedule} empty="今週の予定はありません" />
        </div>
      </section>

      <section className="overview-grid" aria-label="トップ画面">
        <DashboardList title="今日見るもの" items={todayItems} empty="今日見るものは空です" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
        <DashboardList title="締切が近いもの" items={urgentDeadlines} empty="近い締切はありません" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
        <DashboardList title="あとで見るもの" items={laterItems} empty="あとで箱は空です" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
        <DashboardList title="未対応一覧" items={unresolvedItems} empty="未対応はありません" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} wide />
      </section>

      <section className="library">
        <div className="section-heading">
          <div>
            <p className="eyebrow">一覧</p>
            <h2>置いてあるもの</h2>
          </div>
          <div className="data-actions">
            <button type="button" onClick={exportJson}>JSONエクスポート</button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>JSONインポート</button>
            <input ref={fileInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importJson} />
          </div>
        </div>

        <div className="filters">
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as Source | typeof ALL)} aria-label="情報元フィルター">
            <option>{ALL}</option>
            {sources.map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as Category | typeof ALL)} aria-label="カテゴリフィルター">
            <option>{ALL}</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | typeof ALL)} aria-label="優先度フィルター">
            <option>{ALL}</option>
            {priorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="期間フィルター">
            {[
              ["all", "全部"],
              ["today", "今日"],
              ["week", "今週"],
              ["deadline", "期限あり"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={rangeFilter === value ? "active" : ""}
                onClick={() => setRangeFilter(value as FilterRange)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="item-list">
          {filteredItems.length ? (
            filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
            ))
          ) : (
            <p className="empty">条件に合うものはありません</p>
          )}
        </div>
      </section>
    </main>
  );
}

function ScheduleList({
  title,
  occurrences,
  empty,
}: {
  title: string;
  occurrences: ScheduleOccurrence[];
  empty: string;
}) {
  return (
    <section className="schedule-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{occurrences.length}</span>
      </div>
      <div className="mini-list">
        {occurrences.slice(0, 8).map((occurrence) => (
          <article key={occurrence.id} className="schedule-card">
            <div>
              <div className="chip-row">
                <span className="source-chip">{occurrence.item.scheduleKind}</span>
                <span className="category-chip">{occurrence.item.scheduleMode}</span>
                {occurrence.item.scheduleMode === "定期予定" && <span className="category-chip">{occurrence.label}</span>}
              </div>
              <h3>{occurrence.item.title}</h3>
              <p>{formatDate(occurrence.date)}</p>
            </div>
          </article>
        ))}
        {!occurrences.length && <p className="empty">{empty}</p>}
      </div>
    </section>
  );
}

function DashboardList({
  title,
  items,
  empty,
  onComplete,
  onEdit,
  onDelete,
  wide = false,
}: {
  title: string;
  items: Item[];
  empty: string;
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  wide?: boolean;
}) {
  return (
    <section className={`dashboard-panel ${wide ? "wide-panel" : ""}`}>
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <div className="mini-list">
        {items.slice(0, 6).map((item) => (
          <ItemCard key={item.id} item={item} compact onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {!items.length && <p className="empty">{empty}</p>}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  onComplete,
  onEdit,
  onDelete,
  compact = false,
}: {
  item: Item;
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <article className={`item-card ${compact ? "compact-card" : ""}`}>
      <div className="item-main">
        <div className="chip-row">
          <span className="source-chip">{item.source}</span>
          <span className={`category-chip ${categoryTone[item.category]}`}>{item.category}</span>
          {isScheduled(item) && <span className="category-chip">{item.scheduleKind}</span>}
          {item.scheduleMode === "定期予定" && <span className="category-chip">{item.repeatType}</span>}
        </div>
        <h3>{item.title}</h3>
        {!compact && item.memo && <p>{item.memo}</p>}
        <div className="meta-row">
          {item.dateTime && <span>日時 {formatDate(item.dateTime)}</span>}
          {item.deadline && <span>締切 {formatDate(item.deadline)}</span>}
          <span>優先度 {item.priority}</span>
          <span>{item.status}</span>
        </div>
      </div>
      <div className="card-actions">
        {item.status !== "完了" && (
          <button type="button" onClick={() => onComplete(item.id)} aria-label={`${item.title}を完了にする`}>
            完了
          </button>
        )}
        <button type="button" onClick={() => onEdit(item)}>
          編集
        </button>
        <button type="button" className="danger-button" onClick={() => onDelete(item.id)}>
          削除
        </button>
      </div>
    </article>
  );
}
