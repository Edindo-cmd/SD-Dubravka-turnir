import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "./supabase.js";

const fallbackMatches = [
  ["Kafadar Gnojnice", "Barber shop Sema"],
  ["Bobanovo", "Barber shop Šule"],
  ["Hercegovina Kup", "Turnir Stolac"],
  ["Dubrave", "Turnir Dračevice"],
  ["KMF Moderna", "Vukovi sa Zeca"],
  ["Caffe Pink Caffe Label G&L Company", "Kairo"],
  ["Bijelo Polje", "Narentas"],
  ["KMF Akademac", "KMF Nevesinje"],
  ["Alumina", "Za Almina, Enisa i Dalilu"],
  ["Bingo Pumpa", "Caja Prom"],
  ["F.K Blagaj", "SD Dubravka"]
].map(([home, away], index) => ({
  id: `fallback-${index + 1}`,
  match_number: index + 1,
  home_label: home,
  away_label: away,
  home_score: null,
  away_score: null,
  decided_on_penalties: false,
  home_penalties: null,
  away_penalties: null,
  status: "scheduled",
  scheduled_at: null,
  evening: null
}));

const NAV_ITEMS = [
  ["pregled", "⌂", "Početna"],
  ["utakmice", "▣", "Raspored"],
  ["rezultati", "🏆", "Rezultati"],
  ["sema", "◈", "Turnir"],
  ["strijelci", "◎", "Strijelci"],
  ["ekipe", "👥", "Ekipe"],
  ["admin", "♙", "Admin"]
];

function matchName(match, side) {
  const team = side === "home" ? match.home_team : match.away_team;
  const label = side === "home" ? match.home_label : match.away_label;
  return team?.name || label || "TBD";
}

function score(match) {
  if (match.home_score === null || match.away_score === null) return "VS";

  const regularScore = `${match.home_score} : ${match.away_score}`;

  if (
    match.decided_on_penalties &&
    match.home_penalties !== null &&
    match.away_penalties !== null
  ) {
    return `${regularScore} (pen. ${match.home_penalties} : ${match.away_penalties})`;
  }

  return regularScore;
}

function formatDate(value) {
  if (!value) return "Termin naknadno";

  const date = new Date(value);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year}. u ${hours}:${minutes}`;
}

function formatDay(value) {
  if (!value) return "";

  const date = new Date(value);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  return `${day}.${month}.${year}.`;
}

function formatTime(value) {
  if (!value) return "Termin naknadno";

  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localDateKey(value) {
  if (!value) return "";

  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function statusLabel(status) {
  if (status === "live") return "UŽIVO";
  if (status === "finished") return "ZAVRŠENO";
  if (status === "postponed") return "ODGOĐENO";
  return "ZAKAZANO";
}

function teamInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function shortPlayerName(name) {
  const parts = String(name || "Nepoznat igrač")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) return parts[0] || "Nepoznat igrač";

  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(" ")}`;
}

function matchTeamId(match, side) {
  return side === "home"
    ? (match.home_team_id ?? match.home_team?.id)
    : (match.away_team_id ?? match.away_team?.id);
}

function finishedMatchOutcome(match) {
  if (
    match?.status !== "finished" ||
    match.home_score === null ||
    match.away_score === null
  ) {
    return null;
  }

  const homeScore = Number(match.home_score);
  const awayScore = Number(match.away_score);

  let homeWon;

  if (homeScore === awayScore) {
    if (
      !match.decided_on_penalties ||
      match.home_penalties === null ||
      match.away_penalties === null ||
      Number(match.home_penalties) === Number(match.away_penalties)
    ) {
      return null;
    }

    homeWon = Number(match.home_penalties) > Number(match.away_penalties);
  } else {
    homeWon = homeScore > awayScore;
  }

  const winnerSide = homeWon ? "home" : "away";
  const loserSide = homeWon ? "away" : "home";

  const winnerGoals = Number(homeWon ? match.home_score : match.away_score);
  const loserGoals = Number(homeWon ? match.away_score : match.home_score);

  return {
    winner: {
      id: matchTeamId(match, winnerSide),
      name: matchName(match, winnerSide)
    },
    loser: {
      id: matchTeamId(match, loserSide),
      name: matchName(match, loserSide)
    },
    winnerGoals,
    loserGoals,
    loserGoalDifference: loserGoals - winnerGoals,
    decidedOnPenalties: Boolean(match.decided_on_penalties)
  };
}

function getMatchScorers(goals, matchId, teamId) {
  const grouped = new Map();

  for (const goal of goals) {
    const goalMatchId = goal.match_id ?? goal.match?.id;
    const goalTeamId = goal.team_id ?? goal.team?.id;

    if (String(goalMatchId) !== String(matchId)) continue;
    if (String(goalTeamId) !== String(teamId)) continue;

    const playerName =
      goal.player?.name ||
      goal.player_name_override ||
      "Nepoznat igrač";

    grouped.set(
      playerName,
      (grouped.get(playerName) || 0) + Number(goal.quantity || 1)
    );
  }

  return [...grouped.entries()]
    .map(([name, goalsCount]) => ({
      name: shortPlayerName(name),
      goals: goalsCount
    }))
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

export default function App() {
  const [tab, setTab] = useState("pregled");
  const [matches, setMatches] = useState(fallbackMatches);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [goals, setGoals] = useState([]);
  const [session, setSession] = useState(null);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [visitCount, setVisitCount] = useState(null);
  const [notice, setNotice] = useState(
    supabase ? "" : "Dodaj Supabase varijable u Vercelu za povezivanje s bazom."
  );

  async function loadData() {
    if (!supabase) return;

    const [matchesResult, teamsResult, playersResult, goalsResult] = await Promise.all([
      supabase
        .from("matches")
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(id,name),
          away_team:teams!matches_away_team_id_fkey(id,name),
          evening:evenings(id,title,event_date)
        `)
        .order("round_order")
        .order("match_number"),
      supabase.from("teams").select("*").order("name"),
      supabase.from("players").select("*, team:teams(id,name)").order("name"),
      supabase.from("goals").select("*, player:players(id,name), team:teams(id,name)")
    ]);

    const firstError = [matchesResult, teamsResult, playersResult, goalsResult]
      .find((result) => result.error)?.error;

    if (firstError) {
      setNotice(`Greška baze: ${firstError.message}`);
      return;
    }

    if (matchesResult.data?.length) setMatches(matchesResult.data);
    setTeams(teamsResult.data || []);
    setPlayers(playersResult.data || []);
    setGoals(goalsResult.data || []);
    setNotice("");
  }

  useEffect(() => {
    loadData();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    const channel = supabase
      .channel("turnir-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadData)
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    async function loadVisitCount() {
      if (!supabase) return;

      const storageKey = "sd-dubravka-last-visit";
      const now = Date.now();
      const lastVisit = Number(localStorage.getItem(storageKey) || 0);
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (now - lastVisit >= twentyFourHours) {
        localStorage.setItem(storageKey, String(now));

        const { data, error } = await supabase.rpc("increment_site_visits");

        if (!error) {
          setVisitCount(Number(data || 0));
          return;
        }

        localStorage.removeItem(storageKey);
      }

      const { data } = await supabase
        .from("site_stats")
        .select("value")
        .eq("id", "visits")
        .maybeSingle();

      if (data) {
        setVisitCount(Number(data.value || 0));
      }
    }

    loadVisitCount();
  }, []);

  useEffect(() => {
    async function checkAdmin() {
      if (!supabase || !session?.user?.email) {
        setAdminAllowed(false);
        return;
      }

      const { data } = await supabase
        .from("admins")
        .select("email")
        .eq("email", session.user.email.toLowerCase())
        .maybeSingle();

      setAdminAllowed(Boolean(data));
    }

    checkAdmin();
  }, [session]);

  const scorers = useMemo(() => {
    const map = new Map();

    for (const goal of goals) {
      const name = goal.player?.name || goal.player_name_override || "Nepoznat igrač";
      const team = goal.team?.name || "";
      const key = `${name}|${team}`;
      const item = map.get(key) || { name, team, goals: 0 };
      item.goals += Number(goal.quantity || 1);
      map.set(key, item);
    }

    return [...map.values()].sort(
      (a, b) => b.goals - a.goals || a.name.localeCompare(b.name)
    );
  }, [goals]);

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status !== "finished")
        .sort((a, b) => {
          if (!a.scheduled_at && !b.scheduled_at) return (a.match_number || 0) - (b.match_number || 0);
          if (!a.scheduled_at) return 1;
          if (!b.scheduled_at) return -1;
          return new Date(a.scheduled_at) - new Date(b.scheduled_at);
        }),
    [matches]
  );

  const finishedMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === "finished")
        .slice()
        .sort((a, b) => {
          if (a.scheduled_at && b.scheduled_at) {
            return new Date(b.scheduled_at) - new Date(a.scheduled_at);
          }

          if (a.scheduled_at) return -1;
          if (b.scheduled_at) return 1;

          return (b.match_number || 0) - (a.match_number || 0);
        }),
    [matches]
  );

  const liveMatch = matches.find((match) => match.status === "live");
  const featuredMatch = liveMatch || upcomingMatches[0] || matches[0];
  const latestResult = finishedMatches[0];

  const featuredDay = useMemo(() => {
    const todayKey = localDateKey(new Date());

    const todayMatches = matches
      .filter(
        (match) =>
          match.scheduled_at &&
          localDateKey(match.scheduled_at) === todayKey
      )
      .slice()
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    return {
      title: "Današnje utakmice",
      date: todayMatches.length ? formatDay(todayMatches[0].scheduled_at) : "",
      matches: todayMatches
    };
  }, [matches]);

  const finishedMatchesCount = useMemo(
    () => matches.filter((match) => match.status === "finished").length,
    [matches]
  );

  const totalGoalsCount = useMemo(
    () => goals.reduce((sum, goal) => sum + Number(goal.quantity || 1), 0),
    [goals]
  );

  return (
    <div className="app">
      <header className="siteHeader">
        <div className="topBar">
          <button className="brandButton" onClick={() => setTab("pregled")}>
            <span className="brandLogoShell">
              <img src="/logo.png" alt="Logo SD Dubravka" />
            </span>
            <span className="brandCopy">
              <strong>Turnir SD Dubravka</strong>
              <small>Sportsko društvo Dubravka</small>
            </span>
          </button>

          <button className="adminTopButton" onClick={() => setTab("admin")}>
            🔒 Admin
          </button>
        </div>

        <div className="hero">
          <div className="heroShade" />
          <div className="heroPattern" aria-hidden="true" />

          <div className="heroContent">
            <h1 className="heroTitle">
              <span>TRADICIONALNI MALONOGOMETNI TURNIR</span>
              <strong>DUBRAVKA</strong>
              <em>2026</em>
            </h1>

            <p className="heroSubtitle">
              Raspored <i>•</i> Rezultati <i>•</i> Strijelci
            </p>

            <div className="heroActions">
              <button
                className={tab === "utakmice" ? "heroAction active" : "heroAction"}
                onClick={() => setTab("utakmice")}
              >
                Pogledaj utakmice
              </button>
              <button
                className={tab === "rezultati" ? "heroAction active" : "heroAction"}
                onClick={() => setTab("rezultati")}
              >
                Rezultati
              </button>
              <button
                className={tab === "strijelci" ? "heroAction active" : "heroAction"}
                onClick={() => setTab("strijelci")}
              >
                Strijelci
              </button>
            </div>

            <div className="heroStats">
              <div>
                <strong>{teams.filter((team) => !team.is_placeholder).length || 22}</strong>
                <span>Ekipe</span>
              </div>
              <div>
                <strong>{finishedMatchesCount}</strong>
                <span>Odigrano</span>
              </div>
              <div>
                <strong>{totalGoalsCount}</strong>
                <span>Golova</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="desktopNav">
        {NAV_ITEMS.map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <main className="mainContent">
        {notice && <div className="notice">{notice}</div>}

        {tab === "pregled" && (
          <HomeDashboard
            featuredDay={featuredDay}
            latestResult={latestResult}
            scorers={scorers}
            goals={goals}
            setTab={setTab}
          />
        )}

        {tab === "utakmice" && (
          <MatchesPage
            title="Raspored utakmica"
            subtitle="Sve zakazane i predstojeće utakmice"
            matches={matches.filter((match) => match.status !== "finished")}
          />
        )}

        {tab === "rezultati" && (
          <MatchesPage
            title="Rezultati"
            subtitle="Završene utakmice i konačni rezultati"
            matches={finishedMatches}
            empty="Nema završenih utakmica."
          />
        )}

        {tab === "sema" && <TournamentBracket matches={matches} />}

        {tab === "strijelci" && <ScorersPage scorers={scorers} />}

        {tab === "ekipe" && <TeamsPage teams={teams} players={players} goals={goals} />}

        {tab === "admin" && (
          <AdminPanel
            session={session}
            adminAllowed={adminAllowed}
            matches={matches}
            teams={teams}
            players={players}
            goals={goals}
            reload={loadData}
            setNotice={setNotice}
          />
        )}
      </main>

      <footer>
        <div className="footerBrand">
          <img src="/logo.png" alt="Logo SD Dubravka" />
          <div>
            <strong>Sportsko društvo Dubravka</strong>
            <small>Malonogometni turnir • Tradicija • Sport • Zajedništvo</small>
          </div>
        </div>

        <div className="footerMeta">
          <div className="footerVisits">
            <span aria-hidden="true">👥</span>
            <span>Posjeta: <strong>{visitCount === null ? "—" : visitCount.toLocaleString("bs-BA")}</strong></span>
          </div>

          <div className="footerLegal">
            <span>© 2026 Sportsko društvo Dubravka</span>
            <span>Built by: <strong>Void.dev</strong></span>
          </div>
        </div>

        <div className="footerQr">
          <span>Skeniraj za rezultate</span>
          <QRCodeSVG
            value={window.location.origin}
            size={76}
            bgColor="#ffffff"
            fgColor="#02070d"
            includeMargin
          />
        </div>
      </footer>

      <nav className="mobileNav">
        {NAV_ITEMS.map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function HomeDashboard({ featuredDay, latestResult, scorers, goals, setTab }) {
  return (
    <>
      <section className="dashboardGrid">
        <DayMatchesCard
          featuredDay={featuredDay}
          onAction={() => setTab("utakmice")}
        />

        <FeatureMatchCard
          title="Posljednji rezultat"
          icon="🏆"
          match={latestResult}
          goals={goals}
          showScorers
          action="Svi rezultati"
          onAction={() => setTab("rezultati")}
          empty="Rezultati još nisu uneseni."
        />

        <section className="sportCard scorersCard">
          <CardTitle icon="◎" title="Najbolji strijelci" />
          {scorers.length ? (
            <div className="topScorers">
              {scorers.slice(0, 5).map((scorer, index) => (
                <div className="scorerRow" key={`${scorer.name}-${scorer.team}`}>
                  <span className="rankNumber">{index + 1}</span>
                  <span className="scorerIdentity">
                    <strong>{scorer.name}</strong>
                    <small>{scorer.team}</small>
                  </span>
                  <b>{scorer.goals}</b>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>Strijelci još nisu uneseni.</EmptyText>
          )}
          <CardButton onClick={() => setTab("strijelci")}>Lista strijelaca</CardButton>
        </section>
      </section>

      <section className="locationCard">
        <div className="locationCardHeader">
          <span aria-hidden="true">🗺️</span>
          <h2>Lokacija turnira</h2>
        </div>

        <div className="locationActions">
          <a
            href="https://maps.app.goo.gl/XrQSRoZeoVpgBqfk7"
            target="_blank"
            rel="noopener noreferrer"
            className="locationButton"
          >
            <span aria-hidden="true">🧭</span>
            Navigacija do turnira
          </a>

          <a
            href="https://www.facebook.com/share/v/1EKWirY7sH/?mibextid=wwXIfr"
            target="_blank"
            rel="noopener noreferrer"
            className="locationButton locationButtonSecondary"
          >
            <span aria-hidden="true">🎥</span>
            Video upute
          </a>
        </div>
      </section>

      <section className="aboutPanel">
        <span className="aboutSymbol">i</span>
        <div>
          <h2>O turniru</h2>
          <p>
            Dobrodošli na zvaničnu stranicu malonogometnog turnira Sportskog
            društva Dubravka.
          </p>
          <p>
            Ovdje možete pratiti raspored utakmica, rezultate i listu strijelaca.
          </p>
        </div>
      </section>
    </>
  );
}

function DayMatchesCard({ featuredDay, onAction }) {
  return (
    <section className="sportCard dayMatchesCard">
      <CardTitle icon="▣" title={featuredDay.title} />

      {featuredDay.date && (
        <div className="dayMatchesDate">{featuredDay.date}</div>
      )}

      {featuredDay.matches.length ? (
        <div className="dayMatchesList">
          {featuredDay.matches.map((match) => (
            <article className="dayMatchRow" key={match.id}>
              <div className="dayMatchMeta">
                <small>{match.round_name || "Turnir"}</small>
                <time><span aria-hidden="true">◷</span>{formatTime(match.scheduled_at)}</time>
              </div>

              <div className="dayMatchTeams">
                <strong>{matchName(match, "home")}</strong>
                <span>{score(match)}</span>
                <strong>{matchName(match, "away")}</strong>
              </div>

              <small className={`dayMatchStatus ${match.status || "scheduled"}`}>
                <span className="dayMatchStatusDot" />
                {statusLabel(match.status)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <EmptyText>Danas nema zakazanih utakmica.</EmptyText>
      )}

      <CardButton onClick={onAction}>Cijeli raspored</CardButton>
    </section>
  );
}

function FeatureMatchCard({
  title,
  icon,
  match,
  goals = [],
  showScorers = false,
  action,
  onAction,
  empty
}) {
  const homeTeamId = match?.home_team_id ?? match?.home_team?.id;
  const awayTeamId = match?.away_team_id ?? match?.away_team?.id;

  const homeScorers =
    match && showScorers
      ? getMatchScorers(goals, match.id, homeTeamId)
      : [];

  const awayScorers =
    match && showScorers
      ? getMatchScorers(goals, match.id, awayTeamId)
      : [];

  return (
    <section className="sportCard featureCard">
      <CardTitle icon={icon} title={title} />

      {match ? (
        <>
          <div className={`matchStatus ${match.status || "scheduled"}`}>
            {statusLabel(match.status)}
          </div>

          <div className="matchNumber">Utakmica {match.match_number || "–"}</div>

          <div className="featuredTeams">
            <TeamBadge name={matchName(match, "home")} />

            <div className="featuredScore">
              <strong>{score(match)}</strong>
              <small>{formatDate(match.scheduled_at)}</small>
            </div>

            <TeamBadge name={matchName(match, "away")} />
          </div>

          {showScorers && (
            <div className="resultScorersGrid">
              <MatchScorerList
                teamName={matchName(match, "home")}
                scorers={homeScorers}
              />
              <MatchScorerList
                teamName={matchName(match, "away")}
                scorers={awayScorers}
              />
            </div>
          )}
        </>
      ) : (
        <EmptyText>{empty}</EmptyText>
      )}

      <CardButton onClick={onAction}>{action}</CardButton>
    </section>
  );
}

function MatchScorerList({ teamName, scorers }) {
  return (
    <div className="resultScorerColumn">
      <small>{teamName}</small>

      {scorers.length ? (
        scorers.map((scorer) => (
          <div className="resultScorerRow" key={`${teamName}-${scorer.name}`}>
            <span>{scorer.name}</span>
            <span
              className="resultGoalBalls"
              aria-label={`${scorer.goals} ${scorer.goals === 1 ? "gol" : "golova"}`}
            >
              {Array.from({ length: scorer.goals }, (_, index) => (
                <span aria-hidden="true" key={index}>⚽</span>
              ))}
            </span>
          </div>
        ))
      ) : (
        <span className="resultNoScorer">Strijelci nisu uneseni</span>
      )}
    </div>
  );
}

function TeamBadge({ name }) {
  return (
    <div className="teamBadge">
      <div className="teamShield">{teamInitials(name)}</div>
      <strong>{name}</strong>
    </div>
  );
}

function CardTitle({ icon, title }) {
  return (
    <div className="cardTitle">
      <span>{icon}</span>
      <h2>{title}</h2>
    </div>
  );
}

function CardButton({ children, onClick }) {
  return (
    <button className="cardButton" onClick={onClick}>
      {children}
      <span>›</span>
    </button>
  );
}

function EmptyText({ children }) {
  return <p className="emptyText">{children}</p>;
}

function MatchesPage({ title, subtitle, matches, empty = "Nema utakmica." }) {
  return (
    <section>
      <PageHeading eyebrow="Turnir SD Dubravka" title={title} subtitle={subtitle} />

      <div className="matchesList">
        {matches.length ? (
          matches.map((match) => <MatchListCard key={match.id} match={match} />)
        ) : (
          <section className="sportCard">
            <EmptyText>{empty}</EmptyText>
          </section>
        )}
      </div>
    </section>
  );
}

function MatchListCard({ match }) {
  return (
    <article className="matchListCard">
      <div className="matchListMeta">
        <span className={`statusDot ${match.status || "scheduled"}`}>
          {statusLabel(match.status)}
        </span>
        <span>Utakmica {match.match_number || "–"}</span>
        <span>{match.evening?.title || formatDate(match.scheduled_at)}</span>
      </div>

      <div className="matchListTeams">
        <div>
          <span className="smallShield">{teamInitials(matchName(match, "home"))}</span>
          <strong>{matchName(match, "home")}</strong>
        </div>

        <b>{score(match)}</b>

        <div>
          <span className="smallShield">{teamInitials(matchName(match, "away"))}</span>
          <strong>{matchName(match, "away")}</strong>
        </div>
      </div>
    </article>
  );
}

function normalizeTeamName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMatchByTeams(matches, teamA, teamB) {
  const a = normalizeTeamName(teamA);
  const b = normalizeTeamName(teamB);

  return matches.find((match) => {
    const home = normalizeTeamName(matchName(match, "home"));
    const away = normalizeTeamName(matchName(match, "away"));

    return (
      (home === a && away === b) ||
      (home === b && away === a)
    );
  });
}

function TournamentBracket({ matches }) {
  const firstRound = matches
    .filter((match) => Number(match.match_number) >= 1 && Number(match.match_number) <= 11)
    .slice()
    .sort((a, b) => Number(a.match_number) - Number(b.match_number));

  const firstRoundWinners = firstRound
    .map((match) => ({
      matchNumber: Number(match.match_number),
      outcome: finishedMatchOutcome(match)
    }))
    .filter((item) => item.outcome)
    .map((item) => ({
      source: `Pobjednik utakmice ${item.matchNumber}`,
      id: item.outcome.winner.id,
      name: item.outcome.winner.name
    }));

  const repechagePairs = [
    { code: "R1", home: "Kairo", away: "Dubrave" },
    { code: "R2", home: "KMF Moderna", away: "Hercegovina Kup" },
    { code: "R3", home: "Za Almina, Enisa i Dalilu", away: "Bingo Pumpa" },
    { code: "R4", home: "Barber Shop Sema", away: "Bijelo Polje" }
  ];

  const repechageMatches = repechagePairs.map((pair) => {
    const actualMatch = findMatchByTeams(matches, pair.home, pair.away);
    const outcome = actualMatch ? finishedMatchOutcome(actualMatch) : null;

    return {
      ...pair,
      actualMatch,
      winner: outcome?.winner || null
    };
  });

  const repechageWinners = repechageMatches
    .filter((item) => item.winner)
    .map((item) => ({
      source: `Pobjednik ${item.code}`,
      id: item.winner.id,
      name: item.winner.name
    }));

  const directPassTeam = {
    source: "Direktan prolaz iz repasaža",
    id: "direct-kmf-nevesinje",
    name: "KMF Nevesinje"
  };

  const qualifiedTeams = [
    ...firstRoundWinners,
    directPassTeam,
    ...repechageWinners
  ];

  const firstRoundCompleted = firstRoundWinners.length;
  const repechageCompleted = repechageWinners.length;
  const allQualifiedKnown = firstRoundCompleted === 11 && repechageCompleted === 4;

  const tournamentStatus = allQualifiedKnown
    ? "Repasaž završen • Čeka se žrijeb"
    : firstRoundCompleted === 11
      ? "Prvo kolo završeno • U toku je repasaž"
      : "Prvo kolo u toku";

  return (
    <section>
      <PageHeading
        eyebrow="Nastavak turnira"
        title="Turnir 2026"
        subtitle={tournamentStatus}
      />

      <section className="bracketProgress">
        <div>
          <strong>{firstRoundCompleted}/11</strong>
          <span>završenih utakmica prvog kola</span>
        </div>
        <div className="bracketProgressBar">
          <span style={{ width: `${Math.min(100, (firstRoundCompleted / 11) * 100)}%` }} />
        </div>
      </section>

      <section className="directPassCard">
        <span className="directPassIcon" aria-hidden="true">★</span>
        <div>
          <small>Direktan prolaz</small>
          <h2>KMF Nevesinje</h2>
          <p>✓ Plasman među 16 najboljih</p>
        </div>
      </section>

      <section className="repechageCard">
        <div className="repechageHeader">
          <div>
            <span className="kicker">Repasaž</span>
            <h2>Utakmice repasaža</h2>
          </div>
          <small>4 utakmice • 4 pobjednika idu dalje</small>
        </div>

        <div className="repechageMatchGrid">
          {repechageMatches.map((item) => (
            <article className="repechageMatchCard" key={item.code}>
              <span className="repechageMatchCode">{item.code}</span>

              <div className="repechageTeams">
                <strong>{item.home}</strong>
                <div className="repechageScore">
                  {item.actualMatch ? score(item.actualMatch) : "VS"}
                </div>
                <strong>{item.away}</strong>
              </div>

              <div className="repechageMatchFooter">
                {item.actualMatch ? (
                  <span className={`dayMatchStatus ${item.actualMatch.status || "scheduled"}`}>
                    <span className="dayMatchStatusDot" />
                    {statusLabel(item.actualMatch.status)}
                  </span>
                ) : (
                  <span className="repechageWaiting">Čeka unos utakmice</span>
                )}

                {item.winner && (
                  <span className="repechageWinner">
                    Prošao dalje: <strong>{item.winner.name}</strong>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="qualifiedCard">
        <div className="repechageHeader">
          <div>
            <span className="kicker">Završnica</span>
            <h2>Plasirani u završnicu</h2>
          </div>
          <small>
            {allQualifiedKnown
              ? "✓ Poznato svih 16 ekipa"
              : `${qualifiedTeams.length} od 16 ekipa osiguralo plasman`}
          </small>
        </div>

        <div className="qualifiedGroups">
          <section className="qualifiedGroup">
            <h3>Pobjednici prvog kola</h3>
            <div className="qualifiedTeamsGrid">
              {firstRoundWinners.map((team, index) => (
                <div className="qualifiedTeam" key={`${team.source}-${team.name}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{team.name}</strong>
                    <small>{team.source}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="qualifiedGroup">
            <h3>Iz repasaža</h3>
            <div className="qualifiedTeamsGrid">
              <div className="qualifiedTeam">
                <span>★</span>
                <div>
                  <strong>{directPassTeam.name}</strong>
                  <small>Direktan prolaz</small>
                </div>
              </div>

              {repechageWinners.map((team) => (
                <div className="qualifiedTeam" key={`${team.source}-${team.name}`}>
                  <span>✓</span>
                  <div>
                    <strong>{team.name}</strong>
                    <small>{team.source}</small>
                  </div>
                </div>
              ))}

              {Array.from({ length: Math.max(0, 4 - repechageWinners.length) }, (_, index) => (
                <div className="qualifiedTeam pending" key={`repechage-pending-${index}`}>
                  <span>–</span>
                  <div>
                    <strong>Čeka se pobjednik repasaža</strong>
                    <small>Mjesto još nije popunjeno</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={`drawNotice ${allQualifiedKnown ? "ready" : ""}`}>
          <strong>
            {allQualifiedKnown
              ? "Čeka se zvanični žrijeb osmine finala."
              : "Nakon završetka repasaža prikazat će se svih 16 ekipa."}
          </strong>
          <span>
            Parovi naredne faze neće se automatski određivati; unijet ćemo ih nakon zvaničnog žrijeba.
          </span>
        </div>
      </section>
    </section>
  );
}

function ScorersPage({ scorers }) {
  return (
    <section>
      <PageHeading
        eyebrow="Statistika"
        title="Lista strijelaca"
        subtitle="Poredak igrača prema broju postignutih golova"
      />

      <section className="sportCard scorersTableCard">
        {scorers.length ? (
          scorers.map((scorer, index) => (
            <div className="fullScorerRow" key={`${scorer.name}-${scorer.team}`}>
              <span className={`medal medal-${index + 1}`}>{index + 1}</span>
              <div>
                <strong>{scorer.name}</strong>
                <small>{scorer.team}</small>
              </div>
              <b>{scorer.goals} {scorer.goals === 1 ? "gol" : "golova"}</b>
            </div>
          ))
        ) : (
          <EmptyText>Nema unesenih strijelaca.</EmptyText>
        )}
      </section>
    </section>
  );
}

function TeamsPage({ teams, players, goals }) {
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const publicTeams = teams.filter((team) => !team.is_placeholder);

  const playerGoals = useMemo(() => {
    const totals = new Map();

    for (const goal of goals) {
      if (!goal.player_id) continue;
      totals.set(
        goal.player_id,
        (totals.get(goal.player_id) || 0) + Number(goal.quantity || 1)
      );
    }

    return totals;
  }, [goals]);

  function toggleTeam(teamId) {
    setSelectedTeamId((current) => current === teamId ? null : teamId);
  }

  return (
    <section>
      <PageHeading
        eyebrow="Učesnici"
        title="Ekipe"
        subtitle="Kliknite na ekipu za pregled igrača i njihovih golova"
      />

      <div className="teamsGrid">
        {publicTeams.map((team) => {
          const roster = players
            .filter((player) => player.team_id === team.id)
            .slice()
            .sort((a, b) => {
              const goalDifference =
                (playerGoals.get(b.id) || 0) - (playerGoals.get(a.id) || 0);

              return goalDifference || a.name.localeCompare(b.name);
            });

          const teamGoals = goals
            .filter((goal) => goal.team_id === team.id)
            .reduce((sum, goal) => sum + Number(goal.quantity || 1), 0);

          const isOpen = selectedTeamId === team.id;

          return (
            <article
              className={`teamCard ${isOpen ? "open" : ""}`}
              key={team.id}
            >
              <button
                type="button"
                className="teamCardButton"
                onClick={() => toggleTeam(team.id)}
                aria-expanded={isOpen}
              >
                <div className="largeShield">{teamInitials(team.name)}</div>

                <span className="teamCardCopy">
                  <strong>{team.name}</strong>
                  <small>
                    {roster.length
                      ? `${roster.length} igrača • ${teamGoals} ${teamGoals === 1 ? "gol" : "golova"}`
                      : "Igrači se unose naknadno."}
                  </small>
                </span>

                <span className="teamCardChevron" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && (
                <div className="teamRoster">
                  {roster.length ? (
                    roster.map((player, index) => {
                      const goalsCount = playerGoals.get(player.id) || 0;

                      return (
                        <div className="teamPlayerRow" key={player.id}>
                          <span className="teamPlayerNumber">{index + 1}</span>

                          <span className="teamPlayerName">
                            <strong>{player.name}</strong>
                            <small>{goalsCount === 1 ? "1 gol" : `${goalsCount} golova`}</small>
                          </span>

                          <b>{goalsCount}</b>
                        </div>
                      );
                    })
                  ) : (
                    <p className="teamRosterEmpty">
                      Za ovu ekipu još nisu uneseni igrači.
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PageHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="pageHeading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function AdminPanel({
  session,
  adminAllowed,
  matches,
  teams,
  players,
  goals,
  reload,
  setNotice
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [matchId, setMatchId] = useState(matches[0]?.id || "");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [decidedOnPenalties, setDecidedOnPenalties] = useState(false);
  const [homePenalties, setHomePenalties] = useState("");
  const [awayPenalties, setAwayPenalties] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [scheduledAt, setScheduledAt] = useState("");
  const [playerTeam, setPlayerTeam] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [editPlayerId, setEditPlayerId] = useState("");
  const [editPlayerName, setEditPlayerName] = useState("");
  const [goalMatch, setGoalMatch] = useState("");
  const [goalTeam, setGoalTeam] = useState("");
  const [goalPlayer, setGoalPlayer] = useState("");
  const [goalName, setGoalName] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [newHomeTeam, setNewHomeTeam] = useState("");
  const [newAwayTeam, setNewAwayTeam] = useState("");
  const [newRoundName, setNewRoundName] = useState("Osmina finala");
  const [newScheduledAt, setNewScheduledAt] = useState("");

  const [editGoalId, setEditGoalId] = useState("");
  const [editGoalQuantity, setEditGoalQuantity] = useState("");

  const [actionConfirmation, setActionConfirmation] = useState("");

  useEffect(() => {
    const selectedGoal = goals.find((goal) => String(goal.id) === String(editGoalId));
    setEditGoalQuantity(selectedGoal?.quantity ?? "");
  }, [editGoalId, goals]);

  useEffect(() => {
    const selectedPlayer = players.find((player) => String(player.id) === String(editPlayerId));
    setEditPlayerName(selectedPlayer?.name || "");
  }, [editPlayerId, players]);

  useEffect(() => {
    const match = matches.find((item) => item.id === matchId);
    if (!match) return;

    setHomeScore(match.home_score ?? "");
    setAwayScore(match.away_score ?? "");
    setDecidedOnPenalties(Boolean(match.decided_on_penalties));
    setHomePenalties(match.home_penalties ?? "");
    setAwayPenalties(match.away_penalties ?? "");
    setStatus(match.status || "scheduled");
    setScheduledAt(match.scheduled_at ? match.scheduled_at.slice(0, 16) : "");
  }, [matchId, matches]);

  if (!supabase) {
    return (
      <section className="adminShell">
        <EmptyText>Supabase nije povezan.</EmptyText>
      </section>
    );
  }

  function showConfirmation(message) {
    setActionConfirmation(message);
    window.setTimeout(() => {
      setActionConfirmation((current) => current === message ? "" : current);
    }, 3200);
  }

  async function login(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!password) {
      setNotice("Unesi lozinku.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      setNotice(`Prijava nije uspjela: ${error.message}`);
      return;
    }

    setNotice("Uspješno ste prijavljeni.");
    setPassword("");
  }

  async function saveMatch(event) {
    event.preventDefault();

    const numericHomeScore = homeScore === "" ? null : Number(homeScore);
    const numericAwayScore = awayScore === "" ? null : Number(awayScore);
    const numericHomePenalties = homePenalties === "" ? null : Number(homePenalties);
    const numericAwayPenalties = awayPenalties === "" ? null : Number(awayPenalties);

    if (
      decidedOnPenalties &&
      numericHomeScore !== null &&
      numericAwayScore !== null &&
      numericHomeScore !== numericAwayScore
    ) {
      setNotice("Penali se mogu evidentirati samo kada je rezultat utakmice neriješen.");
      return;
    }

    if (
      status === "finished" &&
      numericHomeScore !== null &&
      numericAwayScore !== null &&
      numericHomeScore === numericAwayScore
    ) {
      if (
        !decidedOnPenalties ||
        numericHomePenalties === null ||
        numericAwayPenalties === null ||
        numericHomePenalties === numericAwayPenalties
      ) {
        setNotice("Kod neriješenog završnog rezultata unesi pobjednika nakon penala.");
        return;
      }
    }

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: numericHomeScore,
        away_score: numericAwayScore,
        decided_on_penalties: decidedOnPenalties,
        home_penalties: decidedOnPenalties ? numericHomePenalties : null,
        away_penalties: decidedOnPenalties ? numericAwayPenalties : null,
        status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
      })
      .eq("id", matchId);

    setNotice(error ? error.message : "");

    if (!error) {
      showConfirmation("✅ Rezultat i podaci utakmice su uspješno sačuvani.");
      reload();
    }
  }

  async function addPlayer(event) {
    event.preventDefault();
    const seasonId = teams.find((team) => team.id === playerTeam)?.season_id;

    const { error } = await supabase.from("players").insert({
      season_id: seasonId,
      team_id: playerTeam,
      name: playerName
    });

    setNotice(error ? error.message : "");

    if (!error) {
      showConfirmation(`✅ Igrač ${playerName.trim()} je uspješno dodan.`);
      setPlayerName("");
      reload();
    }
  }

  async function updatePlayer(event) {
    event.preventDefault();

    if (!editPlayerId || !editPlayerName.trim()) {
      setNotice("Izaberi igrača i upiši ispravno ime.");
      return;
    }

    const { error } = await supabase
      .from("players")
      .update({ name: editPlayerName.trim() })
      .eq("id", editPlayerId);

    setNotice(error ? error.message : "");

    if (!error) {
      showConfirmation("✅ Ime igrača je uspješno izmijenjeno.");
      setEditPlayerId("");
      setEditPlayerName("");
      reload();
    }
  }

  async function addGoal(event) {
    event.preventDefault();
    const team = teams.find((item) => item.id === goalTeam);

    if (!goalPlayer && !goalName.trim()) {
      setNotice("Izaberi igrača ili upiši ime strijelca.");
      return;
    }

    const { error } = await supabase.from("goals").insert({
      season_id: team?.season_id,
      match_id: goalMatch,
      team_id: goalTeam,
      player_id: goalPlayer || null,
      player_name_override: goalPlayer ? null : goalName.trim(),
      quantity: Number(quantity || 1)
    });

    setNotice(error ? error.message : "");

    if (!error) {
      const scorerName =
        players.find((player) => String(player.id) === String(goalPlayer))?.name ||
        goalName.trim() ||
        "Strijelac";

      showConfirmation(`✅ ${scorerName}: evidentirano ${Number(quantity || 1)} ${Number(quantity || 1) === 1 ? "gol" : "golova"}.`);
      setGoalName("");
      setQuantity(1);
      reload();
    }
  }

  async function addMatch(event) {
    event.preventDefault();

    if (!newHomeTeam || !newAwayTeam) {
      setNotice("Izaberi obje ekipe.");
      return;
    }

    if (String(newHomeTeam) === String(newAwayTeam)) {
      setNotice("Ekipa ne može igrati sama protiv sebe.");
      return;
    }

    const homeTeam = teams.find((team) => String(team.id) === String(newHomeTeam));
    const awayTeam = teams.find((team) => String(team.id) === String(newAwayTeam));

    if (!homeTeam || !awayTeam) {
      setNotice("Nije moguće pronaći izabrane ekipe.");
      return;
    }

    const roundOrderMap = {
      "Prvo kolo": 1,
      "Repasaž": 2,
      "Osmina finala": 3,
      "Četvrtfinale": 4,
      "Polufinale": 5,
      "Finale": 6
    };

    const nextMatchNumber =
      Math.max(0, ...matches.map((match) => Number(match.match_number) || 0)) + 1;

    const { error } = await supabase.from("matches").insert({
      season_id: homeTeam.season_id,
      match_number: nextMatchNumber,
      round_name: newRoundName,
      round_order: roundOrderMap[newRoundName] || 3,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      status: "scheduled",
      scheduled_at: newScheduledAt
        ? new Date(newScheduledAt).toISOString()
        : null
    });

    setNotice(error ? error.message : "");

    if (!error) {
      showConfirmation(
        `✅ Dodana utakmica ${nextMatchNumber}: ${homeTeam.name} – ${awayTeam.name} (${newRoundName}).`
      );
      setNewHomeTeam("");
      setNewAwayTeam("");
      setNewScheduledAt("");
      reload();
    }
  }

  async function updateGoal(event) {
    event.preventDefault();

    if (!editGoalId || editGoalQuantity === "" || Number(editGoalQuantity) < 1) {
      setNotice("Izaberi evidentiranog strijelca i upiši ispravan broj golova.");
      return;
    }

    const selectedGoal = goals.find(
      (goal) => String(goal.id) === String(editGoalId)
    );

    const { error } = await supabase
      .from("goals")
      .update({ quantity: Number(editGoalQuantity) })
      .eq("id", editGoalId);

    setNotice(error ? error.message : "");

    if (!error) {
      const scorerName =
        selectedGoal?.player?.name ||
        selectedGoal?.player_name_override ||
        "Strijelac";

      showConfirmation(
        `✅ Ispravljen broj golova: ${scorerName} sada ima ${Number(editGoalQuantity)} ${Number(editGoalQuantity) === 1 ? "gol" : "golova"} u toj utakmici.`
      );
      setEditGoalId("");
      setEditGoalQuantity("");
      reload();
    }
  }

  if (!session) {
    return (
      <section className="adminLoginLayout">
        <div className="adminIntro">
          <span className="adminLock">🔒</span>
          <p className="kicker">Zaštićeni pristup</p>
          <h1>Admin panel</h1>
          <p>
            Prijaviti se mogu samo e-mail adrese koje su dodane u Supabase tabelu
            administratora.
          </p>
        </div>

        <form className="adminLoginCard" onSubmit={login}>
          <span className="mailIcon">✉</span>
          <h2>Prijava administratora</h2>
          <label>E-mail administratora</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label>Lozinka</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit">Prijavi se</button>
          <small>Nakon prijave, administratorska prava provjeravaju se u Supabase tabeli admins.</small>
        </form>
      </section>
    );
  }

  if (!adminAllowed) {
    return (
      <section className="adminShell">
        <h1>Nema administratorskog pristupa</h1>
        <p>Prijavljeni e-mail nije na listi administratora.</p>
        <button className="secondaryButton" onClick={() => supabase.auth.signOut()}>
          Odjava
        </button>
      </section>
    );
  }

  const goalPlayers = players.filter((player) => player.team_id === goalTeam);

  return (
    <section className="adminArea">
      {actionConfirmation && (
        <div className="adminToast" role="status">
          {actionConfirmation}
        </div>
      )}

      <div className="adminHeader">
        <div>
          <p className="kicker">Administracija</p>
          <h1>Upravljanje turnirom</h1>
          <p>Prijavljen: {session.user.email}</p>
        </div>
        <button className="secondaryButton" onClick={() => supabase.auth.signOut()}>
          Odjava
        </button>
      </div>

      <div className="adminDashboardGrid">
        <form className="adminCard adminCardFeatured" onSubmit={addMatch}>
          <h2>➕ Nova utakmica</h2>

          <label>Faza turnira</label>
          <select
            value={newRoundName}
            onChange={(event) => setNewRoundName(event.target.value)}
          >
            <option value="Repasaž">Repasaž</option>
            <option value="Osmina finala">Osmina finala</option>
            <option value="Četvrtfinale">Četvrtfinale</option>
            <option value="Polufinale">Polufinale</option>
            <option value="Finale">Finale</option>
          </select>

          <div className="scoreInputs">
            <div>
              <label>Domaćin</label>
              <select
                value={newHomeTeam}
                onChange={(event) => setNewHomeTeam(event.target.value)}
                required
              >
                <option value="">Izaberi ekipu</option>
                {teams
                  .filter((team) => !team.is_placeholder)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label>Gost</label>
              <select
                value={newAwayTeam}
                onChange={(event) => setNewAwayTeam(event.target.value)}
                required
              >
                <option value="">Izaberi ekipu</option>
                {teams
                  .filter((team) => !team.is_placeholder)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <label>Datum i vrijeme (opcionalno)</label>
          <input
            type="datetime-local"
            value={newScheduledAt}
            onChange={(event) => setNewScheduledAt(event.target.value)}
          />

          <small className="adminHint">
            Broj utakmice dodjeljuje se automatski. Nakon žrijeba samo izaberi ekipe i fazu.
          </small>

          <button type="submit">Dodaj utakmicu</button>
        </form>

        <form className="adminCard" onSubmit={saveMatch}>
          <h2>🏆 Rezultat i termin</h2>

          <label>Utakmica</label>
          <select value={matchId} onChange={(event) => setMatchId(event.target.value)}>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.match_number}. {matchName(match, "home")} – {matchName(match, "away")}
              </option>
            ))}
          </select>

          <div className="scoreInputs">
            <div>
              <label>Domaćin</label>
              <input
                type="number"
                min="0"
                value={homeScore}
                onChange={(event) => setHomeScore(event.target.value)}
              />
            </div>
            <div>
              <label>Gost</label>
              <input
                type="number"
                min="0"
                value={awayScore}
                onChange={(event) => setAwayScore(event.target.value)}
              />
            </div>
          </div>

          <label className="penaltyToggle">
            <input
              type="checkbox"
              checked={decidedOnPenalties}
              onChange={(event) => {
                const checked = event.target.checked;
                setDecidedOnPenalties(checked);

                if (!checked) {
                  setHomePenalties("");
                  setAwayPenalties("");
                }
              }}
            />
            <span>Utakmica je odlučena izvođenjem penala</span>
          </label>

          {decidedOnPenalties && (
            <div className="penaltyPanel">
              <div className="penaltyPanelTitle">
                <span aria-hidden="true">⚽</span>
                Rezultat penala
              </div>

              <div className="scoreInputs">
                <div>
                  <label>Penali — domaćin</label>
                  <input
                    type="number"
                    min="0"
                    value={homePenalties}
                    onChange={(event) => setHomePenalties(event.target.value)}
                    required={decidedOnPenalties}
                  />
                </div>

                <div>
                  <label>Penali — gost</label>
                  <input
                    type="number"
                    min="0"
                    value={awayPenalties}
                    onChange={(event) => setAwayPenalties(event.target.value)}
                    required={decidedOnPenalties}
                  />
                </div>
              </div>

              <small>
                Primjer: regularni rezultat 2:2, penali 4:3.
              </small>
            </div>
          )}

          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="scheduled">Zakazana</option>
            <option value="live">U toku</option>
            <option value="finished">Završena</option>
            <option value="postponed">Odgođena</option>
          </select>

          <label>Datum i vrijeme (opcionalno)</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
          />

          <button type="submit">Sačuvaj utakmicu</button>
        </form>

        <form className="adminCard" onSubmit={addPlayer}>
          <h2>👤 Dodaj igrača</h2>

          <label>Ekipa</label>
          <select
            value={playerTeam}
            onChange={(event) => setPlayerTeam(event.target.value)}
            required
          >
            <option value="">Izaberi ekipu</option>
            {teams
              .filter((team) => !team.is_placeholder)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
          </select>

          <label>Ime i prezime</label>
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            required
          />

          <button type="submit">Dodaj igrača</button>
        </form>

        <form className="adminCard" onSubmit={updatePlayer}>
          <h2>✏️ Uredi ime igrača</h2>

          <label>Igrač</label>
          <select
            value={editPlayerId}
            onChange={(event) => setEditPlayerId(event.target.value)}
            required
          >
            <option value="">Izaberi igrača</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name} — {player.team?.name || "Bez ekipe"}
              </option>
            ))}
          </select>

          <label>Ispravljeno ime i prezime</label>
          <input
            value={editPlayerName}
            onChange={(event) => setEditPlayerName(event.target.value)}
            placeholder="Ime i prezime"
            required
          />

          <button type="submit">Sačuvaj izmjenu</button>
        </form>

        <form className="adminCard" onSubmit={addGoal}>
          <h2>⚽ Evidentiraj strijelca</h2>

          <label>Utakmica</label>
          <select
            value={goalMatch}
            onChange={(event) => setGoalMatch(event.target.value)}
            required
          >
            <option value="">Izaberi utakmicu</option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.match_number}. {matchName(match, "home")} – {matchName(match, "away")}
              </option>
            ))}
          </select>

          <label>Ekipa</label>
          <select
            value={goalTeam}
            onChange={(event) => {
              setGoalTeam(event.target.value);
              setGoalPlayer("");
            }}
            required
          >
            <option value="">Izaberi ekipu</option>
            {teams
              .filter((team) => !team.is_placeholder)
              .map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
          </select>

          <label>Igrač sa spiska</label>
          <select
            value={goalPlayer}
            onChange={(event) => setGoalPlayer(event.target.value)}
          >
            <option value="">Upiši ručno</option>
            {goalPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>

          <label>Ime strijelca ako nije na spisku</label>
          <input
            value={goalName}
            onChange={(event) => setGoalName(event.target.value)}
            disabled={Boolean(goalPlayer)}
          />

          <label>Broj golova</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />

          <button type="submit">Dodaj golove</button>
        </form>

        <form className="adminCard" onSubmit={updateGoal}>
          <h2>✏️ Ispravi broj golova</h2>

          <label>Evidentirani strijelac</label>
          <select
            value={editGoalId}
            onChange={(event) => setEditGoalId(event.target.value)}
            required
          >
            <option value="">Izaberi unos</option>
            {goals
              .slice()
              .sort((a, b) => {
                const matchA = matches.find((match) => String(match.id) === String(a.match_id));
                const matchB = matches.find((match) => String(match.id) === String(b.match_id));
                return (Number(matchB?.match_number) || 0) - (Number(matchA?.match_number) || 0);
              })
              .map((goal) => {
                const goalMatchData = matches.find(
                  (match) => String(match.id) === String(goal.match_id)
                );
                const scorerName =
                  goal.player?.name ||
                  goal.player_name_override ||
                  "Nepoznat igrač";

                return (
                  <option key={goal.id} value={goal.id}>
                    {scorerName} — {goal.team?.name || "Ekipa"} — utakmica {goalMatchData?.match_number || "?"} — {goal.quantity} {Number(goal.quantity) === 1 ? "gol" : "golova"}
                  </option>
                );
              })}
          </select>

          <label>Ispravan broj golova</label>
          <input
            type="number"
            min="1"
            value={editGoalQuantity}
            onChange={(event) => setEditGoalQuantity(event.target.value)}
            required
          />

          <small className="adminHint">
            Ovim mijenjaš samo postojeći unos strijelca; ukupna lista strijelaca se automatski preračuna.
          </small>

          <button type="submit">Sačuvaj broj golova</button>
        </form>
      </div>
    </section>
  );
}