/* Change history for one record: GET /changes?entity_type=&entity_id= (supported by the API). */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDateTime } from "@/taxatlas-ui/lib/format";
import { ChangeGlyph } from "./Marker";
import { ChangeDiff } from "@/taxatlas-ui/components/ChangeRow";
import { Bilingual } from "@/taxatlas-ui/components/ui/Bilingual";
import "./lists.css";

export function ChangeHistory({ entityType, entityId }: { entityType: string; entityId: number }) {
  const q = useQuery({
    queryKey: ["changes", { entity_type: entityType, entity_id: entityId }],
    queryFn: () => api.changes.list({ entity_type: entityType, entity_id: entityId, limit: 50 }),
  });
  return (
    <div className="ta-sect">
      <h3>Change history</h3>
      {q.isLoading && <span className="ta-sk" style={{ width: "60%", display: "block" }} aria-hidden="true" />}
      {q.isError && <div className="ta-empty">Could not load change history.</div>}
      {q.data && q.data.items.length === 0 && <div className="ta-empty">No change events recorded for this record.</div>}
      {q.data?.items.map((c) => (
        <div key={c.id} className="ta-ev">
          <ChangeGlyph type={c.change_type} />
          <span className="t">
            <Bilingual original={c.title} translation={c.title_en} />
            {(c.change_type === "rate_changed" || c.change_type === "status_changed" || c.change_type === "updated") && <ChangeDiff c={c} />}
          </span>
          <span className="when" title={c.detected_at}>{fmtDateTime(c.detected_at)}</span>
        </div>
      ))}
    </div>
  );
}
