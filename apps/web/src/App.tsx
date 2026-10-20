import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { Layout } from "./components/Layout";
import { AddPage } from "./pages/Add";
import { CausePage } from "./pages/Cause";
import { CausesPage } from "./pages/Causes";
import { ClaimPage } from "./pages/Claim";
import { DashboardPage } from "./pages/Dashboard";
import { EmbedGivePage } from "./pages/EmbedGive";
import { GivePage } from "./pages/Give";
import { HomePage } from "./pages/Home";
import { LeaderboardsPage } from "./pages/Leaderboards";
import { MePage } from "./pages/Me";
import { NotFoundPage } from "./pages/NotFound";
import { PosterPage } from "./pages/Poster";
import { RulesPage } from "./pages/Rules";
import { SharePage } from "./pages/Share";
import { TechnologyPage } from "./pages/Technology";
import { VerifyPage } from "./pages/Verify";

/** Routes per docs/PLAN.md section 2.5. Bare pages (embed, poster) skip the chrome. */
export default function App() {
  const [location] = useLocation();
  const bare = location.startsWith("/embed/") || /^\/c\/\d+\/poster$/.test(location);

  const routes = (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/causes" component={CausesPage} />
      <Route path="/c/:id/share" component={SharePage} />
      <Route path="/c/:id/poster" component={PosterPage} />
      <Route path="/c/:idSlug" component={CausePage} />
      <Route path="/give/:id" component={GivePage} />
      <Route path="/add" component={AddPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/helpers" component={VerifyPage} />
      <Route path="/helpers/:causeId/:claim" component={ClaimPage} />
      {/* The hub used to live at /verify. Anything already shared keeps
          working, and lands on the same page under its new name. */}
      <Route path="/verify" component={LegacyVerifyRedirect} />
      <Route path="/verify/:causeId/:claim" component={LegacyClaimRedirect} />
      <Route path="/me" component={MePage} />
      <Route path="/leaderboards" component={LeaderboardsPage} />
      <Route path="/technology" component={TechnologyPage} />
      <Route path="/rules" component={RulesPage} />
      <Route path="/embed/give/:id" component={EmbedGivePage} />
      <Route component={NotFoundPage} />
    </Switch>
  );

  if (bare) return routes;
  return <Layout>{routes}</Layout>;
}

/** Parse "12-some-slug" into the cause id. */
export function parseIdSlug(idSlug: string): number {
  const id = Number.parseInt(idSlug.split("-")[0] ?? "", 10);
  return Number.isFinite(id) ? id : 0;
}

function LegacyVerifyRedirect() {
  const search = useSearch();
  return <Redirect to={`/helpers${search ? `?${search}` : ""}`} replace />;
}

function LegacyClaimRedirect({ params }: { params: { causeId: string; claim: string } }) {
  return <Redirect to={`/helpers/${params.causeId}/${params.claim}`} replace />;
}
