import type { ReactNode } from 'react'

import type { ProductGraphicKind } from './product-details'

function Panel({ x, y, width, height, children }: { x: number; y: number; width: number; height: number; children?: ReactNode }) {
  return <g transform={`translate(${x} ${y})`}><rect className="pp-art-panel" width={width} height={height} rx="12" />{children}</g>
}

function Text({ x, y, children, muted = false, small = false }: { x: number; y: number; children: ReactNode; muted?: boolean; small?: boolean }) {
  return <text x={x} y={y} className={muted ? 'pp-art-muted' : 'pp-art-text'} fontSize={small ? 11 : 13}>{children}</text>
}

function Lines({ x, y, widths = [108, 128, 84] }: { x: number; y: number; widths?: number[] }) {
  return <g>{widths.map((width, i) => <rect key={i} className="pp-art-line" x={x} y={y + i * 16} width={width} height="5" rx="2.5" />)}</g>
}

function Checkmark({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`}><circle r="9" className="pp-art-accent-soft" /><path d="m-4 0 3 3 5-6" className="pp-art-stroke" fill="none" strokeWidth="1.8" /></g>
}

function Arrow({ x, y, width = 35 }: { x: number; y: number; width?: number }) {
  return <path d={`M${x} ${y}h${width}m-6-5 6 5-6 5`} className="pp-art-stroke" fill="none" strokeWidth="1.5" />
}

function Scene({ kind }: { kind: ProductGraphicKind }) {
  switch (kind) {
    case 'extraction':
      return <>
        <Panel x={30} y={48} width={154} height={188}><Text x={18} y={30}>Source documents</Text><Lines x={18} y={52} widths={[95, 115, 78]} /><rect x="18" y="112" width="118" height="30" rx="5" className="pp-art-accent-soft" /><Text x={27} y={132}>Revenue</Text><Lines x={18} y={157} widths={[112]} /></Panel>
        <Arrow x={194} y={144} />
        <Panel x={242} y={70} width={208} height={184}><Text x={16} y={28}>Extracted fields</Text><Text x={16} y={58} small muted>FIELD</Text><Text x={133} y={58} small muted>VALUE</Text>{[['Revenue', '$240,000'], ['Period', 'Q4'], ['Currency', 'USD']].map(([label, value], i) => <g key={label}><path d={`M16 ${70 + i * 31}h176`} className="pp-art-rule" /><Text x={16} y={90 + i * 31}>{label}</Text><Text x={123} y={90 + i * 31}>{value}</Text></g>)}</Panel>
        <Checkmark x={270} y={283} /><Text x={286} y={287} small>Review → Export</Text>
      </>
    case 'forms':
      return <>
        <Panel x={30} y={79} width={166} height={156}><Text x={16} y={29}>Client data</Text>{['Client name', 'Reporting period', 'Address'].map((label, i) => <g key={label}><rect x="14" y={45 + i * 32} width="138" height="25" rx="5" className="pp-art-accent-soft" /><Text x={23} y={62 + i * 32} small>{label}</Text></g>)}</Panel>
        <Arrow x={208} y={154} />
        <Panel x={258} y={32} width={192} height={257}><Text x={20} y={32}>Completed form</Text><Lines x={20} y={49} widths={[100]} />{['Client name', 'Reporting period', 'Address'].map((label, i) => <g key={label}><Text x={20} y={85 + i * 58} small muted>{label}</Text><rect x="20" y={94 + i * 58} width="150" height="26" rx="4" className="pp-art-accent-soft" /><Lines x={30} y={105 + i * 58} widths={[85]} /><Checkmark x={153} y={107 + i * 58} /></g>)}</Panel>
      </>
    case 'requests':
      return <>
        <Panel x={34} y={46} width={412} height={233}><Text x={20} y={32}>Client evidence · Year-end close</Text><Text x={20} y={61} small muted>REQUEST</Text><Text x={270} y={61} small muted>REVIEW STATUS</Text>{[['Bank statements', 'Accepted'], ['Invoice support', 'Submitted'], ['Supporting schedules', 'Open']].map(([label, status], i) => <g key={label}><path d={`M20 ${74 + i * 48}h372`} className="pp-art-rule" /><rect x="20" y={88 + i * 48} width="18" height="22" rx="3" className="pp-art-accent-soft" /><Text x={49} y={103 + i * 48}>{label}</Text><Text x={270} y={103 + i * 48} small>{status}</Text></g>)}</Panel>
      </>
    case 'writing':
      return <>
        <Panel x={30} y={35} width={248} height={247}><Text x={22} y={34}>Investor report</Text><Text x={22} y={65} small muted>PERFORMANCE OVERVIEW</Text><Lines x={22} y={83} widths={[195, 178, 191]} /><rect x="20" y="135" width="205" height="30" rx="4" className="pp-art-accent-soft" /><Text x={29} y={155} small>Supported by the source [1]</Text><Lines x={22} y={184} widths={[192, 161, 182]} /></Panel>
        <path d="M252 184h42v-75h17" className="pp-art-stroke" fill="none" strokeDasharray="4 4" />
        <Panel x={306} y={78} width={147} height={152}><Text x={14} y={28}>References</Text><Text x={14} y={62} small>[1] Annual report</Text><Lines x={14} y={76} widths={[112]} /><Text x={14} y={111} small>[2] Financials</Text><Lines x={14} y={125} widths={[91]} /></Panel>
      </>
    case 'speech':
      return <>
        <Panel x={69} y={34} width={342} height={105}><Text x={20} y={28}>Listening on your Mac</Text>{[12, 24, 42, 25, 56, 36, 19, 47, 61, 30, 43, 22, 51, 31, 17, 39, 22, 12].map((height, i) => <rect key={i} x={27 + i * 17} y={69 - height / 2} width="5" height={height} rx="2.5" className="pp-art-accent" />)}</Panel>
        <path d="M240 145v28m-5-6 5 6 5-6" className="pp-art-stroke" fill="none" />
        <Panel x={43} y={185} width={394} height={102}><Text x={20} y={28} small muted>YOUR WORDS, WRITTEN</Text><Text x={20} y={54}>Here are the follow-up notes</Text><Text x={20} y={76}>from our client meeting.</Text></Panel>
      </>
    case 'signature':
      return <>
        <Panel x={82} y={24} width={316} height={223}><Text x={25} y={35}>Engagement letter</Text><Lines x={25} y={57} widths={[254, 233, 246, 183]} /><rect x="24" y="126" width="268" height="70" rx="6" className="pp-art-accent-soft" /><Text x={38} y={145} small muted>SIGNATURE</Text><path d="M55 179q22-50 30-22t-9 21 30-22q-9 32 6 15t14-2q12 11 34-3" className="pp-art-stroke" strokeWidth="2" fill="none" /><Checkmark x={270} y={170} /></Panel>
        {['Prepare', 'Send', 'Sign', 'Complete'].map((label, i) => <g key={label}><Checkmark x={66 + i * 112} y={277} /><Text x={66 + i * 112 - 23} y={302} small>{label}</Text></g>)}
      </>
    case 'workers':
      return <>
        <Panel x={126} y={22} width={228} height={55}><Text x={20} y={32}>Your brief + source files</Text></Panel>
        <path d="M240 77v24H121v21m119-21h119v21" className="pp-art-stroke" fill="none" />
        {['AccountingClaw', 'LegalClaw'].map((label, i) => <Panel key={label} x={26 + i * 239} y={126} width={213} height={88}><rect x="17" y="19" width="31" height="31" rx="9" className="pp-art-accent-soft" /><circle cx="28" cy="33" r="2" className="pp-art-accent" /><circle cx="38" cy="33" r="2" className="pp-art-accent" /><Text x={59} y={39}>{label}</Text><Text x={17} y={69} small muted>{i ? 'Research · Draft · Review' : 'Prepare · Reconcile · Report'}</Text></Panel>)}
        <path d="M132 214v19h228v-19M240 233v20" className="pp-art-stroke" fill="none" />
        <Panel x={117} y={253} width={246} height={48}><Checkmark x={24} y={24} /><Text x={44} y={29}>Ready for human review</Text></Panel>
      </>
    case 'crm':
      return <>
        <Panel x={32} y={34} width={416} height={77}><circle cx="37" cy="38" r="21" className="pp-art-accent-soft" /><Text x={27} y={43}>AC</Text><Text x={73} y={32}>Acme · Client relationship</Text><Text x={73} y={54} small muted>Contacts · Activity · Opportunities</Text></Panel>
        {['Qualify', 'Propose', 'Win'].map((label, i) => <Panel key={label} x={32 + i * 142} y={137} width={132} height={105}><Text x={16} y={28}>{label}</Text><rect x="14" y="46" width="104" height="40" rx="6" className="pp-art-accent-soft" /><Lines x={24} y={57} widths={[70, 48]} /></Panel>)}
        <Checkmark x={50} y={280} /><Text x={67} y={284}>Clearance review attached to the pursuit</Text>
      </>
    case 'projects':
      return <>
        <Text x={32} y={42}>Year-end engagement</Text>
        {['Planned', 'In review', 'Done'].map((label, i) => <Panel key={label} x={30 + i * 144} y={65} width={132} height={219}><Text x={14} y={28}>{label}</Text>{[0, 1].slice(0, i === 1 ? 1 : 2).map((row) => <g key={row}><rect x="10" y={45 + row * 80} width="112" height="69" rx="7" className="pp-art-accent-soft" /><Text x={20} y={67 + row * 80} small>{[['Collect files', 'Prepare memo'], ['Review draft'], ['Scope work', 'Assign team']][i][row]}</Text><Lines x={20} y={79 + row * 80} widths={[64]} /><circle cx="25" cy={101 + row * 80} r="6" className="pp-art-accent" /></g>)}</Panel>)}
      </>
    case 'time':
      return <>
        <Panel x={43} y={30} width={394} height={258}><Text x={22} y={32}>Your workday, reconstructed</Text><path d="M89 105v137" className="pp-art-rule" strokeWidth="2" />{[['09:00', 'Client work', 'Statement preparation'], ['10:30', 'Research', 'Technical accounting'], ['11:15', 'Review', 'Engagement workpapers']].map(([time, title, body], i) => <g key={time}><Text x={17} y={91 + i * 63} small muted>{time}</Text><circle cx="89" cy={86 + i * 63} r="5" className="pp-art-accent" /><rect x="109" y={64 + i * 63} width="262" height="51" rx="7" className="pp-art-accent-soft" /><Text x={123} y={85 + i * 63}>{title}</Text><Text x={123} y={103 + i * 63} small muted>{body}</Text></g>)}</Panel>
      </>
    case 'learning':
      return <>
        <Panel x={35} y={34} width={174} height={133}><Text x={18} y={31}>Course certificate</Text><Lines x={18} y={49} widths={[125, 104]} /><circle cx="87" cy="99" r="18" className="pp-art-accent-soft" /><path d="m80 101 5 5 10-12" className="pp-art-stroke" strokeWidth="2" fill="none" /></Panel>
        <Arrow x={223} y={111} />
        <Panel x={107} y={184} width={340} height={107}><Text x={18} y={28}>Your CPE sheet</Text><Text x={18} y={55} small muted>COURSE</Text><Text x={168} y={55} small muted>DATE</Text><Text x={252} y={55} small muted>CREDITS</Text><path d="M18 66h304" className="pp-art-rule" /><Text x={18} y={87} small>Professional ethics</Text><Text x={168} y={87} small>08 / 12</Text><Text x={268} y={87} small>2.0</Text></Panel>
        <Text x={280} y={104}>Extract</Text><Text x={280} y={125} small muted>Review & organize</Text><path d="M332 141v29m-5-6 5 6 5-6" className="pp-art-stroke" fill="none" />
      </>
    case 'analytics':
      return <>
        <Panel x={30} y={35} width={266} height={250}><Text x={20} y={32}>Actual vs. budget</Text>{[0, 1, 2].map((i) => <path key={i} d={`M20 ${75 + i * 54}h226`} className="pp-art-rule" />)}{[83, 121, 103, 150].map((height, i) => <g key={i}><rect x={30 + i * 56} y={218 - height} width="15" height={height} rx="3" className="pp-art-accent" /><rect x={48 + i * 56} y={218 - height * .8} width="15" height={height * .8} rx="3" className="pp-art-accent-soft" /></g>)}<Text x={26} y={240} small muted>Q1</Text><Text x={84} y={240} small muted>Q2</Text><Text x={142} y={240} small muted>Q3</Text><Text x={200} y={240} small muted>Q4</Text></Panel>
        <Panel x={311} y={60} width={139} height={84}><Text x={14} y={28} small>Variance flagged</Text><Lines x={14} y={45} widths={[101, 72]} /></Panel>
        <Panel x={311} y={163} width={139} height={99}><Text x={14} y={28} small>Reconciliation</Text><Checkmark x={22} y={53} /><Text x={38} y={58} small>Matched</Text><Text x={14} y={83} small muted>Review exceptions</Text></Panel>
      </>
    case 'tax':
      return <>
        <circle cx="162" cy="150" r="109" className="pp-art-accent-soft" /><g className="pp-art-stroke" fill="none" opacity=".5"><circle cx="162" cy="150" r="94" /><ellipse cx="162" cy="150" rx="49" ry="94" /><ellipse cx="162" cy="150" rx="94" ry="35" /><path d="M68 150h188M162 56v188" /></g><circle cx="202" cy="106" r="7" className="pp-art-accent" /><circle cx="106" cy="170" r="5" className="pp-art-accent" /><path d="M202 106h68v-29h24" className="pp-art-stroke" fill="none" strokeDasharray="4 4" />
        <Panel x={284} y={40} width={165} height={109}><Text x={15} y={29}>Jurisdiction profile</Text><Text x={15} y={56} small muted>Rates · Rules · Tariffs</Text><Checkmark x={24} y={82} /><Text x={41} y={87} small>Source linked</Text></Panel>
        <Panel x={274} y={177} width={175} height={103}><Text x={15} y={29}>Watchlist updates</Text><Lines x={15} y={46} widths={[140, 108]} /><Text x={15} y={85} small muted>Check effective dates</Text></Panel>
      </>
  }
}

export function ProductGraphic({ kind, label, productName }: { kind: ProductGraphicKind; label: string; productName: string }) {
  return (
    <figure className={`pp-graphic pp-graphic--${kind}`}>
      <div className="pp-graphic__heading"><span>{productName}</span><span aria-hidden>↗</span></div>
      <svg viewBox="0 0 480 320" role="img" aria-label={label}><Scene kind={kind} /></svg>
      <figcaption>Illustrative workflow</figcaption>
    </figure>
  )
}
