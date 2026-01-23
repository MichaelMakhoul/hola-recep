"use client";

import { format, parseISO } from "date-fns";

interface DailyStats {
  date: string;
  calls: number;
  answered: number;
  appointments: number;
}

interface HourlyStats {
  hour: number;
  calls: number;
}

interface AnalyticsChartsProps {
  dailyStats: DailyStats[];
  hourlyStats: HourlyStats[];
}

export function AnalyticsCharts({ dailyStats }: AnalyticsChartsProps) {
  // Simple bar chart visualization
  const maxCalls = Math.max(...dailyStats.map((d) => d.calls), 1);
  const recentDays = dailyStats.slice(-14); // Show last 14 days

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-1 h-40">
        {recentDays.map((day) => {
          const height = (day.calls / maxCalls) * 100;
          const answeredHeight = (day.answered / maxCalls) * 100;

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center justify-end"
              title={`${format(parseISO(day.date), "MMM d")}: ${day.calls} calls (${day.answered} answered)`}
            >
              <div className="w-full relative">
                {/* Total calls bar */}
                <div
                  className="w-full bg-gray-200 dark:bg-gray-700 rounded-t"
                  style={{ height: `${height}px` }}
                >
                  {/* Answered portion */}
                  <div
                    className="w-full bg-green-500 rounded-t absolute bottom-0"
                    style={{ height: `${answeredHeight}px` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        {recentDays.length > 0 && (
          <>
            <span>{format(parseISO(recentDays[0].date), "MMM d")}</span>
            <span>{format(parseISO(recentDays[recentDays.length - 1].date), "MMM d")}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gray-200 dark:bg-gray-700" />
          <span>Total Calls</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-green-500" />
          <span>Answered</span>
        </div>
      </div>
    </div>
  );
}
