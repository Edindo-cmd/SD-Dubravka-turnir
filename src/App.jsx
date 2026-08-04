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
  status: "scheduled",
  scheduled_at: null,
  evening: null
}));

const NAV_ITEMS = [
  ["pregled", "⌂", "Početna"],
  ["utakmice", "▣", "Raspored"],
  ["rezultati", "🏆", "Rezultati"],
  ["strijelci", "◎", "Strijelci"],
  ["admin", "♙", "Admin"]
];

function matchName(match, side) {
  const team = side === "home" ? match.home_team : match.away_team;
  const label = side === "home" ? match.home_label : match.away_label;
  return team?.name || label || "TBD";
}

function score(match) {
  if (match.home_score === null || match.away_score === null) return "VS";
  return `${match.home_score} : ${match.away_score}`;
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
        <button
          className={tab === "ekipe" ? "active" : ""}
          onClick={() => setTab("ekipe")}
        >
          <span>👥</span>
          Ekipe
        </button>
      </nav>

      <main className="mainContent">
        {notice && <div className="notice">{notice}</div>}

        {tab === "pregled" && (
          <HomeDashboard
            featuredDay={featuredDay}
            latestResult={latestResult}
            scorers={scorers}
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

        {tab === "strijelci" && <ScorersPage scorers={scorers} />}

        {tab === "ekipe" && <TeamsPage teams={teams} players={players} />}

        {tab === "admin" && (
          <AdminPanel
            session={session}
            adminAllowed={adminAllowed}
            matches={matches}
            teams={teams}
            players={players}
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

function HomeDashboard({ featuredDay, latestResult, scorers, setTab }) {
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
              <time><span aria-hidden="true">◷</span>{formatTime(match.scheduled_at)}</time>

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

function FeatureMatchCard({ title, icon, match, action, onAction, empty }) {
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
        </>
      ) : (
        <EmptyText>{empty}</EmptyText>
      )}

      <CardButton onClick={onAction}>{action}</CardButton>
    </section>
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

function TeamsPage({ teams, players }) {
  const publicTeams = teams.filter((team) => !team.is_placeholder);

  return (
    <section>
      <PageHeading
        eyebrow="Učesnici"
        title="Ekipe"
        subtitle="Prijavljene ekipe i spiskovi igrača"
      />

      <div className="teamsGrid">
        {publicTeams.map((team) => {
          const roster = players.filter((player) => player.team_id === team.id);

          return (
            <article className="teamCard" key={team.id}>
              <div className="largeShield">{teamInitials(team.name)}</div>
              <h2>{team.name}</h2>
              <p>{roster.length ? `${roster.length} igrača` : "Igrači se unose naknadno."}</p>
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
  reload,
  setNotice
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [matchId, setMatchId] = useState(matches[0]?.id || "");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [scheduledAt, setScheduledAt] = useState("");
  const [playerTeam, setPlayerTeam] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [goalMatch, setGoalMatch] = useState("");
  const [goalTeam, setGoalTeam] = useState("");
  const [goalPlayer, setGoalPlayer] = useState("");
  const [goalName, setGoalName] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const match = matches.find((item) => item.id === matchId);
    if (!match) return;

    setHomeScore(match.home_score ?? "");
    setAwayScore(match.away_score ?? "");
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

    const { error } = await supabase
      .from("matches")
      .update({
        home_score: homeScore === "" ? null : Number(homeScore),
        away_score: awayScore === "" ? null : Number(awayScore),
        status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
      })
      .eq("id", matchId);

    setNotice(error ? error.message : "Utakmica je sačuvana.");
    if (!error) reload();
  }

  async function addPlayer(event) {
    event.preventDefault();
    const seasonId = teams.find((team) => team.id === playerTeam)?.season_id;

    const { error } = await supabase.from("players").insert({
      season_id: seasonId,
      team_id: playerTeam,
      name: playerName
    });

    setNotice(error ? error.message : "Igrač je dodan.");
    if (!error) {
      setPlayerName("");
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

    setNotice(error ? error.message : "Strijelac je evidentiran.");
    if (!error) {
      setGoalName("");
      setQuantity(1);
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
      </div>
    </section>
  );
}