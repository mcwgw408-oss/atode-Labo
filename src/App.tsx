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

const laterCategories = ["あとで読む", "あとで聞く", "あとで見る", "あとで交流", "その他"] as const;
const sources = ["Voicy", "Substack", "Threads", "note", "X", "その他"] as const;
const priorities = ["高", "中", "低"] as const;
const statuses = ["未対応", "対応中", "完了"] as const;
const scheduleModes = ["単発予定", "定期予定"] as const;
const scheduleKinds = ["ライブ配信", "Voicy", "Zoom", "訪看", "ヘルパー", "企画締切", "相談", "その他"] as const;
const repeatTypes = ["なし", "毎日", "毎週", "毎月", "任意曜日"] as const;
const weekdays = ["日", "月", "火", "水", "木", "金", "土"] as const;

type Category = (typeof categories)[number];
type LaterCategory = (typeof laterCategories)[number];
type Source = (typeof sources)[number];
type Priority = (typeof priorities)[number];
type Status = (typeof statuses)[number];
type ScheduleMode = (typeof scheduleModes)[number];
type ScheduleKind = (typeof scheduleKinds)[number];
type RepeatType = (typeof repeatTypes)[number];
type Page = "home" | "capture" | "schedule" | "later" | "list";
type SortKey = "updated" | "date" | "deadline" | "priority";

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
type ScheduleOccurrence = {
  id: string;
  item: Item;
  date: Date;
  label: string;
};

const emptyDraft: Draft = {
  title: "",
  category: "あとで見る",
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

const priorityOrder: Record<Priority, number> = {
  "高": 0,
  "中": 1,
  "低": 2,
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
    memo: "日付・時間を入れるとホームの今日の優先事項にも出せます",
    dateTime: getDateInputValue(0, 11),
    priority: "高",
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

function isLaterItem(item: Item) {
  return laterCategories.includes(item.category as LaterCategory);
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
    return base >= startOfToday() && base <= endOfDay(days) ? [createOccurrence(item, base, "単発")] : [];
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
      scheduleMode: scheduleModes.includes(entry.scheduleMode as ScheduleMode) ? (entry.scheduleMode as ScheduleMode) : "単発予定",
      scheduleKind: scheduleKinds.includes(entry.scheduleKind as ScheduleKind) ? (entry.scheduleKind as ScheduleKind) : "その他",
      repeatType: repeatTypes.includes(entry.repeatType as RepeatType) ? (entry.repeatType as RepeatType) : "なし",
      repeatWeekdays: Array.isArray(entry.repeatWeekdays)
        ? entry.repeatWeekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : now,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : now,
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
  const [activePage, setActivePage] = useState<Page>("home");
  const [categoryFilter, setCategoryFilter] = useState<Category | typeof ALL>(ALL);
  const [sourceFilter, setSourceFilter] = useState<Source | typeof ALL>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<Priority | typeof ALL>(ALL);
  const [scheduleKindFilter, setScheduleKindFilter] = useState<ScheduleKind | typeof ALL>(ALL);
  const [laterFilter, setLaterFilter] = useState<LaterCategory | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
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
  const weekSchedule = scheduleOccurrences;
  const urgentDeadlines = useMemo(
    () => activeItems.filter((item) => isWithinDays(item.deadline, 7)).sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [activeItems],
  );
  const highPriorityToday = useMemo(
    () =>
      activeItems
        .filter((item) => item.priority === "高" && (isToday(item.dateTime) || isToday(item.deadline) || !isScheduled(item)))
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]),
    [activeItems],
  );
  const unresolvedCounts = useMemo(
    () =>
      laterCategories.map((category) => ({
        category,
        count: activeItems.filter((item) => item.status === "未対応" && item.category === category).length,
      })),
    [activeItems],
  );
  const recurringItems = useMemo(() => activeItems.filter((item) => item.scheduleMode === "定期予定"), [activeItems]);
  const oneTimeItems = useMemo(() => activeItems.filter((item) => item.scheduleMode === "単発予定" && isScheduled(item)), [activeItems]);
  const laterItems = useMemo(() => activeItems.filter((item) => isLaterItem(item)), [activeItems]);

  const filteredSchedule = useMemo(
    () => ({
      today: todaySchedule.filter((occurrence) => scheduleKindFilter === ALL || occurrence.item.scheduleKind === scheduleKindFilter),
      tomorrow: tomorrowSchedule.filter((occurrence) => scheduleKindFilter === ALL || occurrence.item.scheduleKind === scheduleKindFilter),
      week: weekSchedule.filter((occurrence) => scheduleKindFilter === ALL || occurrence.item.scheduleKind === scheduleKindFilter),
      recurring: recurringItems.filter((item) => scheduleKindFilter === ALL || item.scheduleKind === scheduleKindFilter),
      oneTime: oneTimeItems.filter((item) => scheduleKindFilter === ALL || item.scheduleKind === scheduleKindFilter),
    }),
    [oneTimeItems, recurringItems, scheduleKindFilter, todaySchedule, tomorrowSchedule, weekSchedule],
  );

  const filteredLaterItems = useMemo(
    () => laterItems.filter((item) => laterFilter === ALL || item.category === laterFilter),
    [laterFilter, laterItems],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        const matchesQuery =
          !normalizedQuery ||
          `${item.title} ${item.memo} ${item.source} ${item.category} ${item.scheduleKind}`.toLowerCase().includes(normalizedQuery);
        const matchesCategory = categoryFilter === ALL || item.category === categoryFilter;
        const matchesSource = sourceFilter === ALL || item.source === sourceFilter;
        const matchesPriority = priorityFilter === ALL || item.priority === priorityFilter;
        return matchesQuery && matchesCategory && matchesSource && matchesPriority;
      })
      .sort((a, b) => {
        if (sortKey === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
        if (sortKey === "date") return (parseLocalDate(a.dateTime)?.getTime() || Infinity) - (parseLocalDate(b.dateTime)?.getTime() || Infinity);
        if (sortKey === "deadline") return (parseLocalDate(a.deadline)?.getTime() || Infinity) - (parseLocalDate(b.deadline)?.getTime() || Infinity);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [categoryFilter, items, priorityFilter, query, sortKey, sourceFilter]);

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
      setItems((current) => current.map((item) => (item.id === editingId ? { ...item, ...cleanedDraft, updatedAt: now } : item)));
      setNotice("更新しました");
    } else {
      setItems((current) => [{ ...cleanedDraft, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...current]);
      setNotice("置いておきました");
    }
    resetForm();
    setActivePage("home");
  }

  function quickAdd(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    setItems((current) => [{ ...emptyDraft, title: trimmed, id: crypto.randomUUID(), createdAt: now, updatedAt: now }, ...current]);
    setNotice("タイトルだけ保存しました");
    setActivePage("home");
  }

  function completeItem(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status: "完了", updatedAt: new Date().toISOString() } : item)));
  }

  function editItem(item: Item) {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...editable } = item;
    setDraft(editable);
    setEditingId(item.id);
    setActivePage("capture");
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
          <h1>今日、何を見ればいいか。</h1>
          <p>ホームは今見るべきものだけ。予定・あとで・一覧は必要なときに開く棚として分けました。</p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>

      <nav className="page-tabs" aria-label="画面切り替え">
        {[
          ["home", "ホーム"],
          ["capture", editingId ? "編集中" : "登録"],
          ["schedule", "予定"],
          ["later", "あとで"],
          ["list", "一覧"],
        ].map(([page, label]) => (
          <button key={page} type="button" className={activePage === page ? "active" : ""} onClick={() => setActivePage(page as Page)}>
            {label}
          </button>
        ))}
      </nav>

      {activePage === "home" && (
        <HomePage
          todayCount={todaySchedule.length}
          tomorrowCount={tomorrowSchedule.length}
          weekCount={weekSchedule.length}
          urgentDeadlines={urgentDeadlines.slice(0, 4)}
          unresolvedCounts={unresolvedCounts}
          highPriorityToday={highPriorityToday.slice(0, 5)}
          onOpenPage={setActivePage}
          onComplete={completeItem}
          onEdit={editItem}
          onDelete={deleteItem}
        />
      )}

      {activePage === "capture" && (
        <CapturePage
          draft={draft}
          editingId={editingId}
          notice={notice}
          onSubmit={handleSubmit}
          onQuickAdd={quickAdd}
          onReset={resetForm}
          onUpdate={updateDraft}
          onToggleWeekday={toggleWeekday}
        />
      )}

      {activePage === "schedule" && (
        <SchedulePage
          kindFilter={scheduleKindFilter}
          onKindFilter={setScheduleKindFilter}
          schedule={filteredSchedule}
          onComplete={completeItem}
          onEdit={editItem}
          onDelete={deleteItem}
        />
      )}

      {activePage === "later" && (
        <LaterPage
          filter={laterFilter}
          onFilter={setLaterFilter}
          items={filteredLaterItems}
          onComplete={completeItem}
          onEdit={editItem}
          onDelete={deleteItem}
        />
      )}

      {activePage === "list" && (
        <ListPage
          items={filteredItems}
          query={query}
          categoryFilter={categoryFilter}
          sourceFilter={sourceFilter}
          priorityFilter={priorityFilter}
          sortKey={sortKey}
          fileInputRef={fileInputRef}
          onQuery={setQuery}
          onCategoryFilter={setCategoryFilter}
          onSourceFilter={setSourceFilter}
          onPriorityFilter={setPriorityFilter}
          onSort={setSortKey}
          onExport={exportJson}
          onImport={importJson}
          onComplete={completeItem}
          onEdit={editItem}
          onDelete={deleteItem}
        />
      )}
    </main>
  );
}

function HomePage({
  todayCount,
  tomorrowCount,
  weekCount,
  urgentDeadlines,
  unresolvedCounts,
  highPriorityToday,
  onOpenPage,
  onComplete,
  onEdit,
  onDelete,
}: {
  todayCount: number;
  tomorrowCount: number;
  weekCount: number;
  urgentDeadlines: Item[];
  unresolvedCounts: Array<{ category: LaterCategory; count: number }>;
  highPriorityToday: Item[];
  onOpenPage: (page: Page) => void;
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="home-dashboard">
      <div className="summary-grid">
        <button type="button" className="metric-card" onClick={() => onOpenPage("schedule")}>
          <span>今日</span>
          <strong>{todayCount}</strong>
        </button>
        <button type="button" className="metric-card" onClick={() => onOpenPage("schedule")}>
          <span>明日</span>
          <strong>{tomorrowCount}</strong>
        </button>
        <button type="button" className="metric-card" onClick={() => onOpenPage("schedule")}>
          <span>今週</span>
          <strong>{weekCount}</strong>
        </button>
      </div>

      <div className="home-grid">
        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>締切が近いもの</h2>
            <span>{urgentDeadlines.length}</span>
          </div>
          <div className="mini-list">
            {urgentDeadlines.map((item) => (
              <ItemCard key={item.id} item={item} compact onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
            ))}
            {!urgentDeadlines.length && <p className="empty">近い締切はありません</p>}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-title">
            <h2>未対応件数</h2>
            <span>{unresolvedCounts.reduce((total, item) => total + item.count, 0)}</span>
          </div>
          <div className="count-list">
            {unresolvedCounts.map((item) => (
              <button key={item.category} type="button" onClick={() => onOpenPage("later")}>
                <span>{item.category}</span>
                <strong>{item.count}件</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="dashboard-panel wide-panel">
          <div className="panel-title">
            <h2>今日の優先事項</h2>
            <span>{highPriorityToday.length}</span>
          </div>
          <div className="mini-list">
            {highPriorityToday.map((item) => (
              <ItemCard key={item.id} item={item} compact onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
            ))}
            {!highPriorityToday.length && <p className="empty">高優先度の未完了項目はありません</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

function CapturePage({
  draft,
  editingId,
  notice,
  onSubmit,
  onQuickAdd,
  onReset,
  onUpdate,
  onToggleWeekday,
}: {
  draft: Draft;
  editingId: string | null;
  notice: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuickAdd: (title: string) => void;
  onReset: () => void;
  onUpdate: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onToggleWeekday: (day: number) => void;
}) {
  return (
    <form className="capture-panel" onSubmit={onSubmit}>
      <label className="title-input">
        <span>タイトル</span>
        <input value={draft.title} onChange={(event) => onUpdate("title", event.target.value)} placeholder="例: 11:00にnoteを見る、金曜のVoicy" autoFocus />
      </label>

      <div className="form-grid">
        <SelectField label="予定" value={draft.scheduleMode} options={scheduleModes} onChange={(value) => onUpdate("scheduleMode", value as ScheduleMode)} />
        <SelectField label="種別" value={draft.scheduleKind} options={scheduleKinds} onChange={(value) => onUpdate("scheduleKind", value as ScheduleKind)} />
        <SelectField label="繰り返し" value={draft.repeatType} options={repeatTypes} disabled={draft.scheduleMode === "単発予定"} onChange={(value) => onUpdate("repeatType", value as RepeatType)} />
        <SelectField label="情報元" value={draft.source} options={sources} onChange={(value) => onUpdate("source", value as Source)} />
        <SelectField label="カテゴリ" value={draft.category} options={categories} onChange={(value) => onUpdate("category", value as Category)} />
        <SelectField label="優先度" value={draft.priority} options={priorities} onChange={(value) => onUpdate("priority", value as Priority)} />
        <SelectField label="状態" value={draft.status} options={statuses} onChange={(value) => onUpdate("status", value as Status)} />
        <label>
          日付・時間
          <input type="datetime-local" value={draft.dateTime} onChange={(event) => onUpdate("dateTime", event.target.value)} />
        </label>
        <label>
          締切
          <input type="date" value={draft.deadline} onChange={(event) => onUpdate("deadline", event.target.value)} />
        </label>
        {draft.scheduleMode === "定期予定" && draft.repeatType === "任意曜日" && (
          <fieldset className="weekday-field">
            <legend>曜日</legend>
            <div className="weekday-row">
              {weekdays.map((label, day) => (
                <label key={label} className="weekday-toggle">
                  <input type="checkbox" checked={draft.repeatWeekdays.includes(day)} onChange={() => onToggleWeekday(day)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="memo-field">
          メモ
          <textarea value={draft.memo} onChange={(event) => onUpdate("memo", event.target.value)} placeholder="リンク、補足、思い出すためのメモ" />
        </label>
      </div>

      <div className="actions-row">
        <button className="primary-button" type="submit">{editingId ? "更新" : "保存"}</button>
        <button type="button" onClick={() => onQuickAdd(draft.title)}>タイトルだけ保存</button>
        {editingId && <button type="button" onClick={onReset}>編集をやめる</button>}
        {notice && <span className="notice">{notice}</span>}
      </div>
    </form>
  );
}

function SchedulePage({
  kindFilter,
  onKindFilter,
  schedule,
  onComplete,
  onEdit,
  onDelete,
}: {
  kindFilter: ScheduleKind | typeof ALL;
  onKindFilter: (value: ScheduleKind | typeof ALL) => void;
  schedule: {
    today: ScheduleOccurrence[];
    tomorrow: ScheduleOccurrence[];
    week: ScheduleOccurrence[];
    recurring: Item[];
    oneTime: Item[];
  };
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="page-section">
      <PageHeader eyebrow="予定" title="近日予定" />
      <div className="filters">
        <select value={kindFilter} onChange={(event) => onKindFilter(event.target.value as ScheduleKind | typeof ALL)} aria-label="予定種別フィルター">
          <option>{ALL}</option>
          {scheduleKinds.map((kind) => <option key={kind}>{kind}</option>)}
        </select>
      </div>
      <div className="schedule-grid">
        <ScheduleList title="今日" occurrences={schedule.today} empty="今日の予定はありません" onEdit={onEdit} onDelete={onDelete} />
        <ScheduleList title="明日" occurrences={schedule.tomorrow} empty="明日の予定はありません" onEdit={onEdit} onDelete={onDelete} />
        <ScheduleList title="今週" occurrences={schedule.week} empty="今週の予定はありません" onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="split-grid">
        <ItemSection title="定期予定" items={schedule.recurring} empty="定期予定はありません" onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
        <ItemSection title="単発予定" items={schedule.oneTime} empty="単発予定はありません" onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </section>
  );
}

function LaterPage({
  filter,
  onFilter,
  items,
  onComplete,
  onEdit,
  onDelete,
}: {
  filter: LaterCategory | typeof ALL;
  onFilter: (value: LaterCategory | typeof ALL) => void;
  items: Item[];
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="page-section">
      <PageHeader eyebrow="あとで" title="一時退避したもの" />
      <div className="segmented page-segmented" role="group" aria-label="あとでカテゴリ">
        {[ALL, ...laterCategories].map((category) => (
          <button key={category} type="button" className={filter === category ? "active" : ""} onClick={() => onFilter(category as LaterCategory | typeof ALL)}>
            {category}
          </button>
        ))}
      </div>
      <ItemSection title={filter === ALL ? "あとで一覧" : filter} items={items} empty="該当するものはありません" onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
    </section>
  );
}

function ListPage({
  items,
  query,
  categoryFilter,
  sourceFilter,
  priorityFilter,
  sortKey,
  fileInputRef,
  onQuery,
  onCategoryFilter,
  onSourceFilter,
  onPriorityFilter,
  onSort,
  onExport,
  onImport,
  onComplete,
  onEdit,
  onDelete,
}: {
  items: Item[];
  query: string;
  categoryFilter: Category | typeof ALL;
  sourceFilter: Source | typeof ALL;
  priorityFilter: Priority | typeof ALL;
  sortKey: SortKey;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onQuery: (value: string) => void;
  onCategoryFilter: (value: Category | typeof ALL) => void;
  onSourceFilter: (value: Source | typeof ALL) => void;
  onPriorityFilter: (value: Priority | typeof ALL) => void;
  onSort: (value: SortKey) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">一覧</p>
          <h2>すべてのデータ</h2>
        </div>
        <div className="data-actions">
          <button type="button" onClick={onExport}>JSONエクスポート</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>JSONインポート</button>
          <input ref={fileInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={onImport} />
        </div>
      </div>
      <div className="filters">
        <input className="search-input" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="検索" />
        <select value={sourceFilter} onChange={(event) => onSourceFilter(event.target.value as Source | typeof ALL)} aria-label="情報元フィルター">
          <option>{ALL}</option>
          {sources.map((source) => <option key={source}>{source}</option>)}
        </select>
        <select value={categoryFilter} onChange={(event) => onCategoryFilter(event.target.value as Category | typeof ALL)} aria-label="カテゴリフィルター">
          <option>{ALL}</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select value={priorityFilter} onChange={(event) => onPriorityFilter(event.target.value as Priority | typeof ALL)} aria-label="優先度フィルター">
          <option>{ALL}</option>
          {priorities.map((priority) => <option key={priority}>{priority}</option>)}
        </select>
        <select value={sortKey} onChange={(event) => onSort(event.target.value as SortKey)} aria-label="並び替え">
          <option value="updated">更新順</option>
          <option value="date">日時順</option>
          <option value="deadline">締切順</option>
          <option value="priority">優先度順</option>
        </select>
      </div>
      <ItemSection title={`${items.length}件`} items={items} empty="条件に合うものはありません" onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function ScheduleList({
  title,
  occurrences,
  empty,
  onEdit,
  onDelete,
}: {
  title: string;
  occurrences: ScheduleOccurrence[];
  empty: string;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
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
            <div className="chip-row">
              <span className="source-chip">{occurrence.item.scheduleKind}</span>
              <span className="category-chip">{occurrence.item.scheduleMode}</span>
              {occurrence.item.scheduleMode === "定期予定" && <span className="category-chip">{occurrence.label}</span>}
            </div>
            <h3>{occurrence.item.title}</h3>
            <p>{formatDate(occurrence.date)}</p>
            <div className="card-actions schedule-actions">
              <button type="button" onClick={() => onEdit(occurrence.item)}>編集</button>
              <button type="button" className="danger-button" onClick={() => onDelete(occurrence.item.id)}>削除</button>
            </div>
          </article>
        ))}
        {!occurrences.length && <p className="empty">{empty}</p>}
      </div>
    </section>
  );
}

function ItemSection({
  title,
  items,
  empty,
  onComplete,
  onEdit,
  onDelete,
}: {
  title: string;
  items: Item[];
  empty: string;
  onComplete: (id: string) => void;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="dashboard-panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{items.length}</span>
      </div>
      <div className="item-list">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onComplete={onComplete} onEdit={onEdit} onDelete={onDelete} />
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
        {item.status !== "完了" && <button type="button" onClick={() => onComplete(item.id)}>完了</button>}
        <button type="button" onClick={() => onEdit(item)}>編集</button>
        <button type="button" className="danger-button" onClick={() => onDelete(item.id)}>削除</button>
      </div>
    </article>
  );
}
