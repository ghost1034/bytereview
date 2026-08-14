'use client'

/** Metric type fields for create/edit goal modal. */
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GoalFormField } from './GoalFormFields'

export type MetricKind = 'percent' | 'numeric' | 'currency' | 'manual'

type Props = {
  metricKind: MetricKind
  setMetricKind: (v: MetricKind) => void
  current: string
  setCurrent: (v: string) => void
  target: string
  setTarget: (v: string) => void
  unit: string
  setUnit: (v: string) => void
  symbol: string
  setSymbol: (v: string) => void
  manualStatus: 'on_track' | 'at_risk' | 'off_track'
  setManualStatus: (v: 'on_track' | 'at_risk' | 'off_track') => void
}

/** Metric type selector and value inputs. */
export function GoalMetricFields(props: Props) {
  const { metricKind, setMetricKind, manualStatus, setManualStatus } = props
  return (
    <>
      <GoalFormField label="Metric type">
        <Select value={metricKind} onValueChange={(v) => setMetricKind(v as MetricKind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="percent">Percent</SelectItem>
            <SelectItem value="numeric">Numeric</SelectItem>
            <SelectItem value="currency">Currency</SelectItem>
            <SelectItem value="manual">Manual status</SelectItem>
          </SelectContent>
        </Select>
      </GoalFormField>
      {metricKind === 'manual' ? (
        <Select value={manualStatus} onValueChange={(v) => setManualStatus(v as typeof manualStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="on_track">On track</SelectItem>
            <SelectItem value="at_risk">At risk</SelectItem>
            <SelectItem value="off_track">Off track</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" className="tl-input" placeholder="Current" value={props.current} onChange={(e) => props.setCurrent(e.target.value)} />
          {metricKind !== 'percent' && (
            <Input type="number" className="tl-input" placeholder="Target" value={props.target} onChange={(e) => props.setTarget(e.target.value)} />
          )}
          {metricKind === 'numeric' && <Input className="tl-input" placeholder="Unit" value={props.unit} onChange={(e) => props.setUnit(e.target.value)} />}
          {metricKind === 'currency' && <Input className="tl-input" placeholder="Symbol" value={props.symbol} onChange={(e) => props.setSymbol(e.target.value)} />}
        </div>
      )}
    </>
  )
}
