import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "atode-labo-items";

const categories = [
  "あとで読む",
  "あとで聞く",
  "あとで見る",
  "あとで交流",
  "企画・締切",
  "ライブ・予定",
  "その他",
] as const;

const priorities = ["高", "中", "低"] as const;
const statuses = ["未対応", "対応中", "完了"] as const;

type Category = (typeof categories)[number];
type Priority = (typeof priorities)[number];
type Status = (typeof statuses)[number];

type Item = {
  id: string;
  title: string;
  category: Category;
  memo: string;
  dateTime: string;
  deadline: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
};

type Draft = Omit<Item, "id" | "createdAt" | "updatedAt">;

type FilterRange = "all" | "today" | "week" | "deadline";

const emptyDraft: Draft = {
  title: "",
  category: "あとで見る",
  memo: "",
  dateTime: "",
  deadline: "",
  priority: "中",
  status: "未対応",
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
    id: "sample-voicy",
    title: "朝のVoicyをあとで聞く",
    category: "あとで聞く",
    memo: "移動中に聞く",
    dateTime: "",
    deadline: "",
    priority: "中",
    status: "未対応",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "sample-live",
    title: "ライブ配信予定を確認",
    category: "ライブ・予定",
    memo: "",
    dateTime: getDateInputValue(1, 20),
    deadline: "",
    priority: "高",
    status: "未対応",
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

function endOfDay(daysFromToday: number) {
  const date = startOfToday();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(23, 59, 59, 999);
  return date;
}

function isToday(value: string) {
  const date = parseLocalDate(value);
  return Boolean(date && date >= startOfToday() && date <= endOfDay(0));
}

function isWithinDays(value: string, days: number) {
  const date = parseLocalDate(value);
  return Boolean(date && date >= startOfToday() && date <= endOfDay(days));
}

function formatDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  }).format(date);
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
      memo: typeof entry.memo === "string" ? entry.memo : "",
      dateTime: typeof entry.dateTime === "string" ? entry.dateTime : "",
      deadline: typeof entry.deadline === "string" ? entry.deadline : "",
      priority: priorities.includes(entry.priority as Priority) ? (entry.priority as Priority) : "中",
      status: statuses.includes(entry.status as Status) ? (entry.status as Status) : "未対応",
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
      const parsed = JSON.parse(saved);
      const normalized = normalizeImportedItems(parsed);
      return normalized.length ? normalized : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Category | "すべて">("すべて");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "すべて">("すべて");
  const [rangeFilter, setRangeFilter] = useState<FilterRange>("all");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const activeItems = useMemo(() => items.filter((item) => item.status !== "完了"), [items]);

  const todayItems = useMemo(
    () => activeItems.filter((item) => isToday(item.dateTime) || isToday(item.deadline)),
    [activeItems],
  );

  const upcomingItems = useMemo(
    () =>
      activeItems
        .filter((item) => isWithinDays(item.dateTime, 7) && !isToday(item.dateTime))
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    [activeItems],
  );

  const urgentDeadlines = useMemo(
    () =>
      activeItems
        .filter((item) => isWithinDays(item.deadline, 7))
        .sort((a, b) => a.deadline.localeCompare(b.deadline)),
    [activeItems],
  );

  const laterItems = useMemo(
    () =>
      activeItems.filter(
        (item) =>
          item.category.startsWith("あとで") &&
          !isToday(item.dateTime) &&
          !isToday(item.deadline),
      ),
    [activeItems],
  );

  const unresolvedItems = useMemo(
    () => items.filter((item) => item.status === "未対応"),
    [items],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = categoryFilter === "すべて" || item.category === categoryFilter;
      const matchesPriority = priorityFilter === "すべて" || item.priority === priorityFilter;
      const matchesRange =
        rangeFilter === "all" ||
        (rangeFilter === "today" && (isToday(item.dateTime) || isToday(item.deadline))) ||
        (rangeFilter === "week" && (isWithinDays(item.dateTime, 7) || isWithinDays(item.deadline, 7))) ||
        (rangeFilter === "deadline" && Boolean(item.deadline));

      return matchesCategory && matchesPriority && matchesRange;
    });
  }, [categoryFilter, items, priorityFilter, rangeFilter]);

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
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
    if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId
            ? { ...item, ...draft, title, updatedAt: now }
            : item,
        ),
      );
      setNotice("更新しました");
    } else {
      setItems((current) => [
        {
          ...draft,
          id: crypto.randomUUID(),
          title,
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
    setNotice("1秒保存しました");
  }

  function completeItem(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: "完了", updatedAt: new Date().toISOString() }
          : item,
      ),
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
      const text = await file.text();
      const imported = normalizeImportedItems(JSON.parse(text));
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
          <h1>流れていく情報を、いったん置いておく。</h1>
          <p>
            細かい整理より、忘れないことを優先。タイトルだけでも保存できます。
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
            placeholder="あとで見るものをここに置く"
            autoFocus
          />
        </label>

        <div className="form-grid">
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
          <label className="memo-field">
            メモ
            <textarea value={draft.memo} onChange={(event) => updateDraft("memo", event.target.value)} placeholder="リンク、ひとこと、思い出すためのメモ" />
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

      <section className="overview-grid" aria-label="トップ画面">
        <DashboardList title="今日見るもの" items={todayItems} empty="今日の予定は空です" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
        <DashboardList title="近日予定" items={upcomingItems} empty="近日予定はありません" onComplete={completeItem} onEdit={editItem} onDelete={deleteItem} />
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
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as Category | "すべて")}>
            <option>すべて</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "すべて")}>
            <option>すべて</option>
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
        <span className={`category-chip ${categoryTone[item.category]}`}>{item.category}</span>
        <h3>{item.title}</h3>
        {!compact && item.memo && <p>{item.memo}</p>}
        <div className="meta-row">
          {item.dateTime && <span>予定 {formatDate(item.dateTime)}</span>}
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
