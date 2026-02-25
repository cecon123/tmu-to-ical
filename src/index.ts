/* ============================================================================
   TMU Schedule Exporter
   ----------------------------------------------------------------------------
   Responsibilities are separated to follow SOLID:
   - Capture TMU auth headers + week cache (Interceptor)
   - Fetch schedules (Service + HttpClient)
   - Map raw API schedule items to calendar events (Mapper)
   - Serialize events to ICS (Serializer)
   - Download ICS file (Downloader)
   - Inject UI and orchestrate export flow (App)
============================================================================ */

const API_BASE = "https://tmuonlineapi.azurewebsites.net/api/student";

/** Period index to start/end time mapping (local time, Asia/Ho_Chi_Minh). */
const PERIOD_TIME: Readonly<
  Record<number, { sh: number; sm: number; eh: number; em: number }>
> = {
  1: { sh: 6, sm: 30, eh: 7, em: 20 },
  2: { sh: 7, sm: 25, eh: 8, em: 15 },
  3: { sh: 8, sm: 20, eh: 9, em: 10 },
  4: { sh: 9, sm: 20, eh: 10, em: 10 },
  5: { sh: 10, sm: 15, eh: 11, em: 5 },
  6: { sh: 11, sm: 10, eh: 12, em: 0 },
  7: { sh: 12, sm: 30, eh: 13, em: 20 },
  8: { sh: 13, sm: 25, eh: 14, em: 15 },
  9: { sh: 14, sm: 20, eh: 15, em: 10 },
  10: { sh: 15, sm: 20, eh: 16, em: 10 },
  11: { sh: 16, sm: 15, eh: 17, em: 5 },
  12: { sh: 17, sm: 10, eh: 18, em: 0 },
} as const;

/* ============================================================================
   Domain Types
============================================================================ */

type ISODateCompact = string; // e.g. "20260225T063000"

interface WeekScheduleItem {
  TermID: number;
  YearStudy: number;
  Week: number;
}

interface TMUScheduleItem {
  Date: string; // "dd/mm/yyyy"
  PeriodName: string; // "1-3"
  RoomID: string; // may contain "</br>"
  CaHoc: string; // may contain "(07:00)" etc.
  ScheduleStudyUnitID: string;
  NumberOfPeriods: number | string;
  ProfessorName: string;
  CurriculumName: string;
}

interface TMUDrawingSchedulesResponse {
  ResultDataSchedule?: TMUScheduleItem[];
}

interface CalendarEvent {
  uid: string;
  title: string;
  location: string;
  description: string;
  start: ISODateCompact;
  end: ISODateCompact;
}

/* ============================================================================
   Small Utilities
============================================================================ */

class DateUtils {
  static pad2(n: number): string {
    return String(n).padStart(2, "0");
  }

  /** Convert date parts to compact ICS timestamp (no timezone suffix). */
  static toICSDate(
    y: number,
    m: number,
    d: number,
    h: number,
    min: number,
  ): ISODateCompact {
    return `${y}${this.pad2(m)}${this.pad2(d)}T${this.pad2(h)}${this.pad2(min)}00`;
  }
}

class IdFactory {
  static uid(prefix = "tmu"): string {
    // Prefer deterministic UUID if available
    const g = globalThis as unknown as { crypto?: Crypto };
    const uuid =
      g.crypto && "randomUUID" in g.crypto
        ? (g.crypto as any).randomUUID()
        : `${Date.now()}-${Math.random()}`;
    return `${prefix}-${uuid}`;
  }
}

/* ============================================================================
   Ports (Interfaces) - Dependency Inversion
============================================================================ */

interface ITMUContextProvider {
  /** Returns auth headers required by TMU API calls. */
  getAuthHeaders(): Record<string, string> | null;

  /** Returns captured WeekSchedule list, if available. */
  getWeeks(): WeekScheduleItem[] | null;
}

interface IHttpClient {
  getJson<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

interface IScheduleLoader {
  loadCurrentTermSchedules(): Promise<TMUScheduleItem[]>;
}

interface IEventMapper<TIn> {
  map(items: TIn[]): CalendarEvent[];
}

interface ICalendarSerializer {
  serialize(events: CalendarEvent[]): string;
}

interface IFileDownloader {
  downloadTextFile(filename: string, mime: string, content: string): void;
}

/* ============================================================================
   Infrastructure: HTTP client
============================================================================ */

class FetchHttpClient implements IHttpClient {
  async getJson<T>(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} when GET ${url}`);
    }
    return (await res.json()) as T;
  }
}

/* ============================================================================
   Infrastructure: Interceptor (captures apikey/authorization + WeekSchedule)
============================================================================ */

class TMUInterceptorContext implements ITMUContextProvider {
  private apiKey: string | null = null;
  private authorization: string | null = null;
  private cachedWeeks: WeekScheduleItem[] | null = null;

  constructor() {
    this.installInterceptors();
  }

  getAuthHeaders(): Record<string, string> | null {
    if (!this.apiKey || !this.authorization) return null;

    // TMU API expects these keys (case-insensitive at network layer, but keep consistent).
    return {
      apikey: this.apiKey,
      authorization: this.authorization,
      clientid: "tmu",
    };
  }

  getWeeks(): WeekScheduleItem[] | null {
    return this.cachedWeeks;
  }

  private installInterceptors(): void {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    // Keep instance reference for overridden prototype functions.
    const self = this;

    XMLHttpRequest.prototype.setRequestHeader = function (
      key: string,
      value: string,
    ) {
      const lower = key.toLowerCase();
      if (!self.apiKey && lower === "apikey") self.apiKey = value;
      if (!self.authorization && lower === "authorization")
        self.authorization = value;
      return originalSetHeader.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.open = function (method: string, url: string) {
      (this as any)._tmu_url = url;
      return originalOpen.apply(this, arguments as any);
    };

    XMLHttpRequest.prototype.send = function () {
      const xhr = this as any;

      // Capture WeekSchedule response once it finishes.
      if (xhr._tmu_url?.includes("/WeekSchedule")) {
        this.addEventListener("load", function () {
          try {
            self.cachedWeeks = JSON.parse(
              (this as XMLHttpRequest).responseText,
            ) as WeekScheduleItem[];
            // eslint-disable-next-line no-console
            console.log("TMU weeks captured:", self.cachedWeeks?.length ?? 0);
          } catch {
            // eslint-disable-next-line no-console
            console.warn("Failed to parse WeekSchedule response.");
          }
        });
      }

      return originalSend.apply(this, arguments as any);
    };
  }
}

/* ============================================================================
   Application Service: Load schedules for current term
============================================================================ */

class TMUScheduleService implements IScheduleLoader {
  constructor(
    private readonly context: ITMUContextProvider,
    private readonly http: IHttpClient,
  ) {}

  async loadCurrentTermSchedules(): Promise<TMUScheduleItem[]> {
    const weeks = this.context.getWeeks();
    if (!weeks || weeks.length === 0) {
      alert("WeekSchedule chưa được tải. Hãy mở trang TKB rồi refresh lại.");
      return [];
    }

    const headers = this.context.getAuthHeaders();
    if (!headers) {
      alert(
        "Chưa bắt được apikey/authorization. Hãy tải lại trang và mở trang TKB trước khi export.",
      );
      return [];
    }

    const currentTerm = weeks[0];
    const termWeeks = weeks.filter(
      (w) =>
        w.TermID === currentTerm.TermID &&
        w.YearStudy === currentTerm.YearStudy,
    );

    const results = await Promise.all(
      termWeeks.map(async (week) => {
        const url =
          `${API_BASE}/DrawingSchedules` +
          `?namhoc=${encodeURIComponent(String(week.YearStudy))}` +
          `&hocky=${encodeURIComponent(String(week.TermID))}` +
          `&tuan=${encodeURIComponent(String(week.Week))}`;

        try {
          const data = await this.http.getJson<TMUDrawingSchedulesResponse>(
            url,
            headers,
          );
          return data.ResultDataSchedule ?? [];
        } catch {
          // If one week fails, skip it (robust export).
          return [];
        }
      }),
    );

    return results.flat();
  }
}

/* ============================================================================
   Mapper: Raw schedule items -> Calendar events
============================================================================ */

class TMUScheduleToEventMapper implements IEventMapper<TMUScheduleItem> {
  map(items: TMUScheduleItem[]): CalendarEvent[] {
    return items
      .map((item) => this.toEvent(item))
      .filter((e): e is CalendarEvent => e !== null);
  }

  private toEvent(item: TMUScheduleItem): CalendarEvent | null {
    const [d, m, y] = item.Date.split("/").map(Number);
    if (!d || !m || !y) return null;

    const [sp, ep] = item.PeriodName.split("-").map(Number);
    const st = PERIOD_TIME[sp];
    const et = PERIOD_TIME[ep];
    if (!st || !et) return null;

    const room = this.cleanRoom(item.RoomID);
    const startTime = item.CaHoc.match(/\((.*?)\)/)?.[1] ?? "";

    const description =
      `LHP: ${item.ScheduleStudyUnitID}\n` +
      `Số tiết: ${item.NumberOfPeriods}\n` +
      `Tiết: ${item.PeriodName}\n` +
      `Giờ bắt đầu: ${startTime}\n` +
      `GV: ${item.ProfessorName}`;

    return {
      uid: IdFactory.uid("tmu"),
      title: `${item.CurriculumName} - ${room}`,
      location: room,
      description,
      start: DateUtils.toICSDate(y, m, d, st.sh, st.sm),
      end: DateUtils.toICSDate(y, m, d, et.eh, et.em),
    };
  }

  private cleanRoom(roomId: string): string {
    // TMU sometimes includes HTML breaks. Keep the first part as the location.
    return roomId.split("</br>")[0].trim();
  }
}

/* ============================================================================
   ICS Serializer
============================================================================ */

class IcsCalendarSerializer implements ICalendarSerializer {
  private static readonly TZID = "Asia/Ho_Chi_Minh";

  serialize(events: CalendarEvent[]): string {
    const header = `BEGIN:VCALENDAR
VERSION:2.0
CALSCALE:GREGORIAN
PRODID:-//TMU//Schedule Exporter//VN
BEGIN:VTIMEZONE
TZID:${IcsCalendarSerializer.TZID}
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0700
TZOFFSETTO:+0700
TZNAME:ICT
END:STANDARD
END:VTIMEZONE
`;

    const body = events.map((e) => this.serializeEvent(e)).join("");

    return `${header}${body}END:VCALENDAR`;
  }

  private serializeEvent(e: CalendarEvent): string {
    const tz = IcsCalendarSerializer.TZID;

    // Escape reserved characters per RFC5545 basics (minimal, practical).
    const summary = this.escapeText(e.title);
    const location = this.escapeText(e.location);
    const description = this.escapeText(e.description);

    return `BEGIN:VEVENT
UID:${e.uid}
DTSTAMP:${e.start}
DTSTART;TZID=${tz}:${e.start}
DTEND;TZID=${tz}:${e.end}
SUMMARY:${summary}
LOCATION:${location}
DESCRIPTION:${description}
END:VEVENT
`;
  }

  private escapeText(input: string): string {
    // ICS text escaping: backslash, comma, semicolon, newline.
    return input
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }
}

/* ============================================================================
   File Downloader
============================================================================ */

class BrowserFileDownloader implements IFileDownloader {
  downloadTextFile(filename: string, mime: string, content: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);

    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/* ============================================================================
   UI + Orchestration
============================================================================ */

class TMUExporterApp {
  private readonly scheduleLoader: IScheduleLoader;
  private readonly mapper: IEventMapper<TMUScheduleItem>;
  private readonly serializer: ICalendarSerializer;
  private readonly downloader: IFileDownloader;

  constructor(deps: {
    scheduleLoader: IScheduleLoader;
    mapper: IEventMapper<TMUScheduleItem>;
    serializer: ICalendarSerializer;
    downloader: IFileDownloader;
  }) {
    this.scheduleLoader = deps.scheduleLoader;
    this.mapper = deps.mapper;
    this.serializer = deps.serializer;
    this.downloader = deps.downloader;

    this.injectExportButton();
  }

  private async exportCurrentTerm(btn: HTMLButtonElement): Promise<void> {
    btn.textContent = "⌛...";
    btn.disabled = true;

    try {
      const schedules = await this.scheduleLoader.loadCurrentTermSchedules();
      const events = this.mapper.map(schedules);

      if (events.length === 0) {
        alert("Không có dữ liệu để xuất (0 events).");
        return;
      }

      const icsContent = this.serializer.serialize(events);
      this.downloader.downloadTextFile(
        "tmu-current-term.ics",
        "text/calendar;charset=utf-8;",
        icsContent,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      alert("Xuất lịch thất bại. Mở Console để xem chi tiết.");
    } finally {
      btn.textContent = "Export";
      btn.disabled = false;
    }
  }

  private injectExportButton(): void {
    // Selector of the container that contains an existing button to clone style from.
    const selector = "#ScheduleComponent div.MuiGrid-grid-md-4";

    const addButtonIfPossible = () => {
      const container = document.querySelector(selector);
      if (!container) return;

      if (container.querySelector(".tmu-export-btn")) return;

      const sample = container.querySelector<HTMLButtonElement>("button");
      if (!sample) return;

      const btn = sample.cloneNode(true) as HTMLButtonElement;
      btn.textContent = "Export";
      btn.classList.add("tmu-export-btn");
      btn.style.marginLeft = "10px";

      btn.addEventListener("click", () => void this.exportCurrentTerm(btn));
      container.appendChild(btn);
    };

    const observer = new MutationObserver(addButtonIfPossible);
    observer.observe(document.body, { childList: true, subtree: true });

    addButtonIfPossible();
  }
}

/* ============================================================================
   Bootstrap
============================================================================ */

const context = new TMUInterceptorContext();
const http = new FetchHttpClient();

const app = new TMUExporterApp({
  scheduleLoader: new TMUScheduleService(context, http),
  mapper: new TMUScheduleToEventMapper(),
  serializer: new IcsCalendarSerializer(),
  downloader: new BrowserFileDownloader(),
});

void app; // keep reference (useful for debugging)
