import {Link} from "react-router-dom";
import {ShieldWarning} from "@phosphor-icons/react";
import {useAuth} from "../lib/auth";

export default function Forbidden() {
    const {user} = useAuth();
    return (
        <div
            className="min-h-[60vh] grid place-items-center p-8"
            data-testid="forbidden-page"
            role="alert"
        >
            <div className="soc-card p-8 max-w-md text-center space-y-3">
                <ShieldWarning size={36} className="text-error mx-auto" weight="duotone" aria-hidden/>
                <h1 className="text-xl font-semibold tracking-tight">403 — Insufficient role</h1>
                <p className="text-sm text-muted-foreground">
                    Your account
                    {user?.role ? (
                        <>
                            {" "}
                            (<span className="font-mono text-foreground">{user.role}</span>)
                        </>
                    ) : null}{" "}
                    cannot open this area. Ask an administrator if you need elevated access.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <Link to="/" className="soc-btn-primary" data-testid="forbidden-home">
                        Dashboard
                    </Link>
                    <Link to="/incidents" className="soc-btn-secondary">
                        Incidents
                    </Link>
                </div>
            </div>
        </div>
    );
}
