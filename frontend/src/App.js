import {Component, lazy, Suspense} from "react";
import {BrowserRouter, Navigate, Route, Routes, useLocation} from "react-router-dom";
import {AuthProvider, useAuth} from "./lib/auth";
import {ThemeProvider} from "./lib/theme";
import {Toaster} from "./components/ui/sonner";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import Compliance from "./pages/Compliance";
import {TooltipProvider} from "./components/ui/tooltip";
import {LoadingState} from "./design-system";
import "./App.css";

const CHUNK_RELOAD_KEY = "actira:chunk-reload";

function lazyRetry(importer) {
    return lazy(async () => {
        try {
            const page = await importer();
            window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            return page;
        } catch (error) {
            const isChunkError =
                error?.name === "ChunkLoadError" ||
                /Loading chunk [\w-]+ failed/i.test(error?.message || "");
            const hasReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";

            if (isChunkError && !hasReloaded) {
                window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
                window.location.reload();
                return new Promise(() => {
                });
            }

            throw error;
        }
    });
}

class RouteErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {chunkFailed: false};
    }

    static getDerivedStateFromError(error) {
        const isChunkError =
            error?.name === "ChunkLoadError" ||
            /Loading chunk [\w-]+ failed/i.test(error?.message || "");
        if (isChunkError) {
            return {chunkFailed: true};
        }
        return null;
    }

    render() {
        if (this.state.chunkFailed) {
            return (
                <div className="p-6 text-sm text-muted-foreground" role="alert">
                    A frontend bundle changed while this page was open. Refresh once and retry.
                </div>
            );
        }
        return this.props.children;
    }
}

const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const Upload = lazyRetry(() => import("./pages/Upload"));
const Incidents = lazyRetry(() => import("./pages/Incidents"));
const IncidentDetail = lazyRetry(() => import("./pages/IncidentDetail"));
const ReviewQueue = lazyRetry(() => import("./pages/ReviewQueue"));
const AuditLogs = lazyRetry(() => import("./pages/AuditLogs")); // Added Audit Logs import
const Settings = lazyRetry(() => import("./pages/Settings"));
const Knowledge = lazyRetry(() => import("./pages/Knowledge"));
const Analytics = lazyRetry(() => import("./pages/Analytics"));
const Roadmap = lazyRetry(() => import("./pages/Roadmap"));
const GoldenBenchmark = lazyRetry(() => import("./pages/GoldenBenchmark"));
const OpsHealth = lazyRetry(() => import("./pages/OpsHealth"));

const REVIEWER_ROLES = ["senior_reviewer", "admin"];
const ADMIN_ROLES = ["admin"];

function PageFallback() {
    return (
        <div className="p-6">
            <LoadingState message="Loading page…" testid="route-loading"/>
        </div>
    );
}

function Protected({children, roles}) {
    const {user, loading} = useAuth();
    const loc = useLocation();
    if (loading) {
        return (
            <div className="min-h-screen grid place-items-center text-muted-foreground text-sm" role="status">
                Initializing ACTIRA…
            </div>
        );
    }
    if (!user) return <Navigate to="/login" state={{from: loc}} replace/>;
    if (roles && !roles.includes(user.role) && user.role !== "admin") {
        return (
            <Layout>
                <Forbidden/>
            </Layout>
        );
    }
    return (
        <Layout>
            <RouteErrorBoundary>
                <Suspense fallback={<PageFallback/>}>{children}</Suspense>
            </RouteErrorBoundary>
        </Layout>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <TooltipProvider delayDuration={200}>
                        <Toaster/>
                        <Routes>
                            <Route path="/login" element={<Login/>}/>
                            <Route path="/" element={<Protected><Dashboard/></Protected>}/>
                            <Route path="/upload" element={<Protected><Upload/></Protected>}/>
                            <Route path="/analytics" element={<Protected><Analytics/></Protected>}/>
                            <Route path="/incidents" element={<Protected><Incidents/></Protected>}/>
                            <Route
                                path="/compliance"
                                element={<Protected roles={REVIEWER_ROLES}><Compliance/></Protected>}
                            />
                            <Route path="/incidents/:id" element={<Protected><IncidentDetail/></Protected>}/>
                            <Route
                                path="/review"
                                element={<Protected roles={REVIEWER_ROLES}><ReviewQueue/></Protected>}
                            />
                            {/* Added Audit Trail Route restricted to Reviewers and Admins */}
                            <Route
                                path="/audit"
                                element={<Protected roles={REVIEWER_ROLES}><AuditLogs/></Protected>}
                            />
                            <Route path="/knowledge" element={<Protected><Knowledge/></Protected>}/>
                            <Route path="/roadmap" element={<Protected><Roadmap/></Protected>}/>
                            <Route
                                path="/benchmark"
                                element={<Protected roles={ADMIN_ROLES}><GoldenBenchmark/></Protected>}
                            />
                            <Route
                                path="/ops"
                                element={<Protected roles={ADMIN_ROLES}><OpsHealth/></Protected>}
                            />
                            <Route
                                path="/settings"
                                element={<Protected roles={ADMIN_ROLES}><Settings/></Protected>}
                            />
                            <Route
                                path="*"
                                element={(
                                    <Protected>
                                        <NotFound/>
                                    </Protected>
                                )}
                            />
                        </Routes>
                    </TooltipProvider>
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}