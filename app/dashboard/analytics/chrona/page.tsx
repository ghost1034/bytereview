'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, Download, Layers, Loader2, MonitorSmartphone } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { useToast } from '@/hooks/use-toast'
import { useChronaSummary } from '@/hooks/useChronaDashboard'
import { useChronaDevices } from '@/hooks/useChronaDevices'
import { apiClient } from '@/lib/api'
import {
  dayStringDaysAgo,
  formatDayLabel,
  formatHours,
  formatRelativeTime,
  toDayString,
} from '@/lib/chrona/format'
import type { ChronaSummaryDevice } from '@/lib/chrona/types'

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

/** Stacked day chart keeps the top N categories; the tail folds into "Other". */
const MAX_STACKED_CATEGORIES = 5
const OTHER_KEY = 'Other'

type DeviceRow = ChronaSummaryDevice & { id: string }

export default function ChronaDashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [fromDay, setFromDay] = useState(() => dayStringDaysAgo(13))
  const [toDay, setToDay] = useState(() => toDayString(new Date()))
  const [deviceId, setDeviceId] = useState<string>('all')
  const [isExporting, setIsExporting] = useState(false)

  const summaryQuery = useChronaSummary({
    from: fromDay,
    to: toDay,
    deviceId: deviceId === 'all' ? undefined : deviceId,
  })
  // Picker options come from the unfiltered device list so switching between
  // devices stays possible while the summary is filtered to one of them.
  const devicesQuery = useChronaDevices()
  const allDevices = devicesQuery.data?.devices ?? []
  const cells = useMemo(() => summaryQuery.data?.cells ?? [], [summaryQuery.data])
  const devices = useMemo(() => summaryQuery.data?.devices ?? [], [summaryQuery.data])

  const totalHours = useMemo(
    () => devices.reduce((acc, d) => acc + d.total_hours, 0),
    [devices],
  )
  const totalCards = useMemo(
    () => devices.reduce((acc, d) => acc + d.card_count, 0),
    [devices],
  )
  const activeDevices = useMemo(
    () => devices.filter((d) => d.total_hours > 0).length,
    [devices],
  )

  const hoursByCategory = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const cell of cells) {
      byCategory.set(cell.category, (byCategory.get(cell.category) ?? 0) + cell.hours)
    }
    return [...byCategory.entries()]
      .map(([category, hours]) => ({ category, hours }))
      .sort((a, b) => b.hours - a.hours)
  }, [cells])

  const stackedCategories = useMemo(() => {
    const top = hoursByCategory.slice(0, MAX_STACKED_CATEGORIES).map((c) => c.category)
    return hoursByCategory.length > MAX_STACKED_CATEGORIES ? [...top, OTHER_KEY] : top
  }, [hoursByCategory])

  const hoursByDay = useMemo(() => {
    const topSet = new Set(
      stackedCategories.filter((category) => category !== OTHER_KEY),
    )
    const byDay = new Map<string, Record<string, number>>()
    for (const cell of cells) {
      const bucket = byDay.get(cell.day_key) ?? {}
      const key = topSet.has(cell.category) ? cell.category : OTHER_KEY
      bucket[key] = (bucket[key] ?? 0) + cell.hours
      byDay.set(cell.day_key, bucket)
    }
    // Fill the full range so the x-axis is continuous even on idle days.
    const days: Array<Record<string, number | string>> = []
    const [fy, fm, fd] = fromDay.split('-').map(Number)
    const [ty, tm, td] = toDay.split('-').map(Number)
    if (!fy || !ty) return days
    const cursor = new Date(fy, (fm ?? 1) - 1, fd ?? 1)
    const end = new Date(ty, (tm ?? 1) - 1, td ?? 1)
    while (cursor <= end && days.length <= 366) {
      const dayKey = toDayString(cursor)
      days.push({ day: dayKey, label: formatDayLabel(dayKey), ...(byDay.get(dayKey) ?? {}) })
      cursor.setDate(cursor.getDate() + 1)
    }
    return days
  }, [cells, stackedCategories, fromDay, toDay])

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    stackedCategories.forEach((category, i) => {
      config[category] = { label: category, color: CHART_COLORS[i % CHART_COLORS.length] }
    })
    return config
  }, [stackedCategories])

  const deviceRows = useMemo<DeviceRow[]>(
    () => devices.map((d) => ({ ...d, id: d.device_id })),
    [devices],
  )

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const { blob, filename } = await apiClient.exportChronaCSV({
        from: fromDay,
        to: toDay,
        deviceId: deviceId === 'all' ? undefined : deviceId,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'CSV export failed.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const deviceColumns: ColumnDef<DeviceRow>[] = [
    {
      header: 'Device',
      accessorKey: 'display_name',
      sortable: true,
      cell: (value, row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{value}</span>
          {row.revoked && <Badge variant="destructive">Revoked</Badge>}
        </div>
      ),
    },
    {
      header: 'Hours',
      accessorKey: 'total_hours',
      sortable: true,
      cell: (value) => <span className="tabular-nums">{formatHours(value)}</span>,
    },
    {
      header: 'Cards',
      accessorKey: 'card_count',
      sortable: true,
      cell: (value) => <span className="tabular-nums">{value}</span>,
    },
    {
      header: 'Last sync',
      accessorKey: 'last_sync_at',
      sortable: true,
      cell: (value) => (
        <span className="text-foreground-muted">{formatRelativeTime(value)}</span>
      ),
    },
  ]

  if (summaryQuery.isLoading) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Time Tracking"
          description="Hours synced from paired Chrona devices across your firm."
        />
        <LoadingState variant="page" label="Loading time tracking data" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Time Tracking"
        description="Hours synced from paired Chrona devices across your firm."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCSV}
              disabled={isExporting || cells.length === 0}
            >
              {isExporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-2 size-4" aria-hidden />
              )}
              Export CSV
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/analytics/chrona/devices">
                <MonitorSmartphone className="mr-2 size-4" aria-hidden />
                Manage devices
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground-muted">Device</p>
          <Select value={deviceId} onValueChange={setDeviceId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All devices" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All devices</SelectItem>
              {allDevices.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground-muted">From</p>
          <Input
            type="date"
            value={fromDay}
            max={toDay}
            onChange={(e) => e.target.value && setFromDay(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground-muted">To</p>
          <Input
            type="date"
            value={toDay}
            min={fromDay}
            onChange={(e) => e.target.value && setToDay(e.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {summaryQuery.isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <p>
            {summaryQuery.error instanceof Error
              ? summaryQuery.error.message
              : 'Failed to load time tracking data.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => summaryQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="No Chrona devices paired yet"
          description="Generate a pairing code and enter it in Chrona's sync settings to start syncing time tracking data."
          action={
            <Button asChild>
              <Link href="/dashboard/analytics/chrona/devices">Manage devices</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total hours" value={formatHours(totalHours)} icon={Clock} />
            <StatCard
              label="Active devices"
              value={`${activeDevices} / ${devices.length}`}
              icon={MonitorSmartphone}
              hint="Devices with tracked time in range"
            />
            <StatCard label="Timeline cards" value={totalCards.toLocaleString()} icon={Layers} />
          </div>

          {cells.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Clock}
              title="No tracked time in this range"
              description="Cards will appear here after paired devices sync activity for the selected dates."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-foreground">Hours by category</div>
                  <div className="text-xs text-foreground-muted">
                    Total tracked time per category over the selected range.
                  </div>
                </div>
                <ChartContainer config={chartConfig} className="h-80 w-full">
                  <BarChart
                    data={hoursByCategory.slice(0, 10)}
                    layout="vertical"
                    margin={{ left: 12, right: 12, top: 12, bottom: 12 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => formatHours(value as number)}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={120}
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatHours(value as number)}
                        />
                      }
                    />
                    <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                      {hoursByCategory.slice(0, 10).map((entry, index) => (
                        <Cell
                          key={`cell-${entry.category}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </section>

              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-foreground">Hours by day</div>
                  <div className="text-xs text-foreground-muted">
                    Daily tracked time, stacked by category (device-local days).
                  </div>
                </div>
                <ChartContainer config={chartConfig} className="h-80 w-full">
                  <BarChart
                    data={hoursByDay}
                    margin={{ left: 12, right: 12, top: 12, bottom: 12 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(value) => formatHours(value as number)}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => `${name}: ${formatHours(value as number)}`}
                        />
                      }
                    />
                    {stackedCategories.map((category, index) => (
                      <Bar
                        key={category}
                        dataKey={category}
                        stackId="hours"
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        radius={
                          index === stackedCategories.length - 1 ? [4, 4, 0, 0] : undefined
                        }
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              </section>
            </div>
          )}

          <DataTable
            data={deviceRows}
            columns={deviceColumns}
            title="Devices"
            description="Tracked totals per device for the selected range. Click a device to see its timeline."
            searchPlaceholder="Search devices..."
            onRowClick={(row) =>
              router.push(`/dashboard/analytics/chrona/${encodeURIComponent(row.device_id)}`)
            }
          />
        </>
      )}
    </div>
  )
}
