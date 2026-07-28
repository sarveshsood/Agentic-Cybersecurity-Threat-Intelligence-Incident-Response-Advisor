/**
 * H-07 assignment panel on incident detail.
 */
import {useState} from "react";
import {api} from "../../lib/api";
import {toast} from "sonner";
import {useAuth} from "../../lib/auth";
import {HelpTip, Tip} from "../HelpTip";
import UserPicker from "./UserPicker";
import {DsButton} from "../../design-system";

export default function AssignPanel({incident, onUpdated}) {
    const {user} = useAuth();
    const elevated = user?.role === "admin" || user?.role === "senior_reviewer";
    const [busy, setBusy] = useState(false);
    const [primary, setPrimary] = useState(
        incident?.assignee_id
            ? {id: incident.assignee_id, email: incident.assignee_email}
            : null,
    );

    const selfAssign = async () => {
        setBusy(true);
        try {
            const r = await api.patch(`/incidents/${incident.id}/assignment`, {
                assignee_id: user.sub || user.id,
            });
            toast.success("Assigned to you");
            onUpdated?.(r.data);
            setPrimary({id: user.sub || user.id, email: user.email});
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Assign failed");
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        setBusy(true);
        try {
            const body = {
                assignee_id: primary?.id ?? null,
            };
            const r = await api.patch(`/incidents/${incident.id}/assignment`, body);
            toast.success("Assignment saved");
            onUpdated?.(r.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Assign failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="soc-card p-4 space-y-3" data-testid="assign-panel">
            <div className="flex items-center gap-1.5">
                <div className="soc-label">Ownership</div>
                <HelpTip
                    title="Case ownership"
                    body="Primary assignee owns the IR case. Does not change HiTL review status. Assignment never sets reviewer_id."
                    testid="tip-assign-panel"
                />
            </div>
            <div className="text-[12px] text-muted-foreground">
                Current:{" "}
                <span className="font-mono text-foreground">
                    {incident?.assignee_email || incident?.assignee_id || "Unassigned"}
                </span>
                {incident?.secondary_assignee_email && (
                    <span className="ml-2">
                        · secondary{" "}
                        <span className="font-mono">{incident.secondary_assignee_email}</span>
                    </span>
                )}
            </div>
            {elevated ? (
                <>
                    <UserPicker value={primary} onChange={setPrimary} testid="assign-primary" />
                    <Tip content="Save primary assignee (LWW)">
                        <DsButton
                            size="sm"
                            disabled={busy}
                            onClick={save}
                            data-testid="assign-save"
                            tooltip="Save assignment"
                        >
                            Save assignment
                        </DsButton>
                    </Tip>
                </>
            ) : (
                <Tip content="Self-assign as primary IR owner">
                    <DsButton
                        size="sm"
                        disabled={busy}
                        onClick={selfAssign}
                        data-testid="assign-self"
                        tooltip="Assign this case to me"
                    >
                        Assign to me
                    </DsButton>
                </Tip>
            )}
        </div>
    );
}
