import {Link} from "react-router-dom";
import {WarningCircle} from "@phosphor-icons/react";

export default function NotFound() {
    return (
        <div
            className="min-h-[60vh] grid place-items-center p-8"
            data-testid="not-found-page"
            role="alert"
        >
            <div className="soc-card p-8 max-w-md text-center space-y-3">
                <WarningCircle size={36} className="text-warning mx-auto" weight="duotone" aria-hidden/>
                <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
                <p className="text-sm text-muted-foreground">
                    That route does not exist in ACTIRA. Check the URL or return to the operations dashboard.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <Link to="/" className="soc-btn-primary" data-testid="not-found-home">
                        Dashboard
                    </Link>
                    <Link to="/incidents" className="soc-btn-secondary" data-testid="not-found-incidents">
                        Incidents
                    </Link>
                </div>
            </div>
        </div>
    );
}