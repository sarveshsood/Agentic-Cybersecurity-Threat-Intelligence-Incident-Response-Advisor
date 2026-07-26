import {useEffect} from "react";
import {Link, useLocation, useNavigate} from "react-router-dom";
import {ArrowLeft, ShieldWarning} from "@phosphor-icons/react";
import {useAuth} from "../lib/auth";
import {api} from "../lib/api";

export default function Forbidden() {
    const {user} = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Audit Telemetry: Log frontend authorization breach to backend SIEM/Audit stream
    useEffect(() => {
        // baseURL already includes /api — do not prefix again
        api.post("/audit/telemetry", {
            event: "unauthorized_page_access",
            attempted_path: location.pathname,
            user_id: user?.id || user?.sub,
            user_role: user?.role || "anonymous",
            timestamp: new Date().toISOString(),
        }).catch(() => {
            // Silently catch telemetry failure to prevent breaking UI error state
        });
    }, [location.pathname, user]);

    return (
        <div
            className="min-h-[60vh] grid place-items-center p-8"
            data-testid="forbidden-page"
            role="alert"
        >
            <div className="soc-card p-8 max-w-md text-center space-y-3 border border-error/20 shadow-lg">
                <ShieldWarning size={40} className="text-error mx-auto" weight="duotone" aria-hidden/>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">
                    403 — Insufficient Role
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Your account
                    {user?.role ? (
                        <>
                            {" "}
                            (<span className="font-mono text-foreground font-semibold">{user.role}</span>)
                        </>
                    ) : null}{" "}
                    does not have adequate permissions to view this module. Contact an administrator to request elevated
                    access.
                </p>

                <div className="flex flex-wrap justify-center items-center gap-2 pt-3">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="soc-btn-secondary !text-xs !px-3 !py-1.5 inline-flex items-center gap-1"
                        data-testid="forbidden-back-btn"
                    >
                        <ArrowLeft size={14}/> Go Back
                    </button>
                    <Link to="/" className="soc-btn-primary !text-xs !px-3 !py-1.5" data-testid="forbidden-home">
                        Dashboard
                    </Link>
                    <Link to="/incidents" className="soc-btn-secondary !text-xs !px-3 !py-1.5">
                        Incidents
                    </Link>
                </div>
            </div>
        </div>
    );
}