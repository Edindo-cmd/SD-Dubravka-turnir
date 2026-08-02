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
  scheduled_at: null
}));

function matchName(match, side) {
  const team = side === "home" ? match.home_team : match.away_team;
  const label = side === "home" ? match.home_label : match.away_label;
  return team?.name || label || "TBD";
}

function score(match) {
  if (match.home_score === null || match.away_score === null) return "vs";
  return `${match.home_score} : ${match.away_score}`;
}

function timeText(value) {
  if (!value) return "Termin naknadno";
  return new Intl.DateTimeFormat("bs-BA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function App() {
  const [tab, setTab] = useState("pregled");
  const [matches, setMatches] = useState(fallbackMatches);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [goals, setGoals] = useState([]);
  const [session, setSession] = useState(null);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [notice, setNotice] = useState(
    supabase ? "" : "Aplikacija je spremna. Dodaj Supabase varijable u Vercelu za rad sa bazom."
  );

  async function loadData() {
    if (!supabase) return;
    const [m, t, p, g] = await Promise.all([
      supabase.from("matches").select(`
        *,
        home_team:teams!matches_home_team_id_fkey(id,name),
        away_team:teams!matches_away_team_id_fkey(id,name),
        evening:evenings(id,title,event_date)
      `).order("round_order").order("match_number"),
      supabase.from("teams").select("*").order("name"),
      supabase.from("players").select("*, team:teams(id,name)").order("name"),
      supabase.from("goals").select("*, player:players(id,name), team:teams(id,name)")
    ]);

    const firstError = [m, t, p, g].find((r) => r.error)?.error;
    if (firstError) {
      setNotice(`Baza još nije spremna: ${firstError.message}`);
      return;
    }

    if (m.data?.length) setMatches(m.data);
    setTeams(t.data || []);
    setPlayers(p.data || []);
    setGoals(g.data || []);
  }

  useEffect(() => {
    loadData();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    const channel = supabase
      .channel("turnir-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, loadData)
      .subscribe();

    return () => {
      data.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
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
    return [...map.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  }, [goals]);

  return (
    <div className="app">
      <header className="hero">
        <div className="heroGlow heroGlowOne" />
        <div className="heroGlow heroGlowTwo" />
        <div className="heroShade" />
        <div className="heroInner">
          <div className="heroBrand">
            <div className="logoFrame">
              <img src="/logo-sd-dubravka.png" alt="Grb Sportskog društva Dubravka" />
            </div>

            <div className="heroCopy">
              <p className="kicker">Sportsko društvo Dubravka</p>
              <h1>Turnir SD Dubravka</h1>
              <p className="lead">Raspored, rezultati i strijelci — brzo, pregledno i uživo.</p>

              <div className="heroActions">
                <button className="heroPrimary" onClick={() => setTab("utakmice")}>
                  Pogledaj utakmice
                </button>
                <button className="heroSecondary" onClick={() => setTab("strijelci")}>
                  Lista strijelaca
                </button>
              </div>

              <div className="heroStats">
                <div><strong>{matches.length}</strong><span>utakmica</span></div>
                <div><strong>{teams.filter((team) => !team.is_placeholder).length || 22}</strong><span>ekipe</span></div>
                <div><strong>{scorers.length}</strong><span>strijelaca</span></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <nav className="nav">
        {[
          ["pregled", "Pregled"],
          ["utakmice", "Utakmice"],
          ["strijelci", "Strijelci"],
          ["ekipe", "Ekipe"],
          ["admin", "Admin"]
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main className="wrap">
        {notice && <div className="notice">{notice}</div>}

        {tab === "pregled" && (
          <section>
            <div className="sectionTitle">
              <div><span>Aktuelno</span><h2>Turnirski pregled</h2></div>
              <b>LIVE</b>
            </div>
            <div className="grid three">
              <div className="card">
                <h3>Sljedeće utakmice</h3>
                {matches.slice(0, 4).map((m) => <Match key={m.id} match={m} />)}
              </div>
              <div className="card">
                <h3>Posljednji rezultati</h3>
                {matches.filter((m) => m.status === "finished").slice(-4).reverse().map((m) => (
                  <Match key={m.id} match={m} />
                ))}
                {!matches.some((m) => m.status === "finished") && <p className="muted">Rezultati još nisu uneseni.</p>}
              </div>
              <div className="card">
                <h3>Najbolji strijelci</h3>
                {scorers.slice(0, 5).map((s, i) => (
                  <div className="rank" key={`${s.name}-${s.team}`}>
                    <span>{i + 1}. <strong>{s.name}</strong><small>{s.team}</small></span>
                    <b>{s.goals}</b>
                  </div>
                ))}
                {!scorers.length && <p className="muted">Strijelci još nisu uneseni.</p>}
              </div>
            </div>
          </section>
        )}

        {tab === "utakmice" && (
          <section>
            <div className="sectionTitle"><div><span>Eliminacijski sistem</span><h2>Utakmice</h2></div></div>
            <div className="card">
              {matches.map((m) => <Match key={m.id} match={m} />)}
            </div>
          </section>
        )}

        {tab === "strijelci" && (
          <section>
            <div className="sectionTitle"><div><span>Statistika</span><h2>Lista strijelaca</h2></div></div>
            <div className="card tableWrap">
              <table>
                <thead><tr><th>#</th><th>Igrač</th><th>Ekipa</th><th>Golovi</th></tr></thead>
                <tbody>
                  {scorers.map((s, i) => <tr key={`${s.name}-${s.team}`}><td>{i + 1}</td><td>{s.name}</td><td>{s.team}</td><td><strong>{s.goals}</strong></td></tr>)}
                </tbody>
              </table>
              {!scorers.length && <p className="muted">Nema unesenih strijelaca.</p>}
            </div>
          </section>
        )}

        {tab === "ekipe" && (
          <section>
            <div className="sectionTitle"><div><span>Učesnici</span><h2>Ekipe</h2></div></div>
            <div className="grid teams">
              {(teams.length ? teams : [...new Set(fallbackMatches.flatMap((m) => [m.home_label, m.away_label]))].map((name) => ({ id: name, name }))).map((team) => (
                <article className="card" key={team.id}>
                  <h3>{team.name}</h3>
                  <p className="muted">
                    {players.filter((p) => p.team_id === team.id).length
                      ? players.filter((p) => p.team_id === team.id).map((p) => p.name).join(", ")
                      : "Igrači se unose naknadno."}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

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
          <img src="/logo-sd-dubravka.png" alt="" />
          <div><strong>Turnir SD Dubravka</strong><small>Javni prikaz rasporeda, rezultata i statistike</small></div>
        </div>
        <div className="qr"><QRCodeSVG value={window.location.origin} size={72} bgColor="transparent" fgColor="#ffffff" /><span>Skeniraj za rezultate</span></div>
      </footer>
    </div>
  );
}

function Match({ match }) {
  return (
    <article className="match">
      <div className="meta"><span>Utakmica {match.match_number || "–"}</span><small>{timeText(match.scheduled_at)}</small></div>
      <div className="teamsLine">
        <span>{matchName(match, "home")}</span>
        <strong>{score(match)}</strong>
        <span>{matchName(match, "away")}</span>
      </div>
    </article>
  );
}

function AdminPanel({ session, adminAllowed, matches, teams, players, reload, setNotice }) {
  const [email, setEmail] = useState("elizde89@gmail.com");
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
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
    setHomeScore(match.home_score ?? "");
    setAwayScore(match.away_score ?? "");
    setStatus(match.status || "scheduled");
    setScheduledAt(match.scheduled_at ? match.scheduled_at.slice(0, 16) : "");
  }, [matchId, matches]);

  if (!supabase) {
    return <section className="card"><h2>Admin panel</h2><p>Prvo dodaj Supabase environment varijable u Vercelu.</p></section>;
  }

  async function login(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });
    setNotice(error ? error.message : "Magic Link je poslan na e-mail.");
  }

  async function saveMatch(e) {
    e.preventDefault();
    const { error } = await supabase.from("matches").update({
      home_score: homeScore === "" ? null : Number(homeScore),
      away_score: awayScore === "" ? null : Number(awayScore),
      status,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
    }).eq("id", matchId);
    setNotice(error ? error.message : "Utakmica je sačuvana.");
    if (!error) reload();
  }

  async function addPlayer(e) {
    e.preventDefault();
    const seasonId = teams.find((t) => t.id === playerTeam)?.season_id;
    const { error } = await supabase.from("players").insert({
      season_id: seasonId,
      team_id: playerTeam,
      name: playerName
    });
    setNotice(error ? error.message : "Igrač je dodan.");
    if (!error) { setPlayerName(""); reload(); }
  }

  async function addGoal(e) {
    e.preventDefault();
    const team = teams.find((t) => t.id === goalTeam);
    const { error } = await supabase.from("goals").insert({
      season_id: team?.season_id,
      match_id: goalMatch,
      team_id: goalTeam,
      player_id: goalPlayer || null,
      player_name_override: goalPlayer ? null : goalName,
      quantity: Number(quantity || 1)
    });
    setNotice(error ? error.message : "Strijelac je evidentiran.");
    if (!error) reload();
  }

  if (!session) {
    return (
      <section className="card login">
        <span className="kicker">Administracija</span>
        <h2>Prijava administratora</h2>
        <form onSubmit={login}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button>Pošalji Magic Link</button>
        </form>
      </section>
    );
  }

  if (!adminAllowed) {
    return <section className="card"><h2>Nema pristupa</h2><button onClick={() => supabase.auth.signOut()}>Odjava</button></section>;
  }

  const goalPlayers = players.filter((p) => p.team_id === goalTeam);

  return (
    <section>
      <div className="sectionTitle"><div><span>Administrator</span><h2>Upravljanje turnirom</h2></div><button className="secondary" onClick={() => supabase.auth.signOut()}>Odjava</button></div>
      <div className="grid two">
        <form className="card" onSubmit={saveMatch}>
          <h3>Rezultat i termin</h3>
          <label>Utakmica</label>
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            {matches.map((m) => <option key={m.id} value={m.id}>{m.match_number}. {matchName(m, "home")} – {matchName(m, "away")}</option>)}
          </select>
          <div className="formRow">
            <div><label>Domaćin</label><input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} /></div>
            <div><label>Gost</label><input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} /></div>
          </div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="scheduled">Zakazana</option>
            <option value="live">U toku</option>
            <option value="finished">Završena</option>
            <option value="postponed">Odgođena</option>
          </select>
          <label>Datum i vrijeme (opcionalno)</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <button>Sačuvaj</button>
        </form>

        <form className="card" onSubmit={addPlayer}>
          <h3>Dodaj igrača</h3>
          <label>Ekipa</label>
          <select value={playerTeam} onChange={(e) => setPlayerTeam(e.target.value)} required>
            <option value="">Izaberi ekipu</option>
            {teams.filter((t) => !t.is_placeholder).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label>Ime i prezime</label>
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} required />
          <button>Dodaj igrača</button>
        </form>

        <form className="card" onSubmit={addGoal}>
          <h3>Evidentiraj strijelca</h3>
          <label>Utakmica</label>
          <select value={goalMatch} onChange={(e) => setGoalMatch(e.target.value)} required>
            <option value="">Izaberi utakmicu</option>
            {matches.map((m) => <option key={m.id} value={m.id}>{m.match_number}. {matchName(m, "home")} – {matchName(m, "away")}</option>)}
          </select>
          <label>Ekipa</label>
          <select value={goalTeam} onChange={(e) => { setGoalTeam(e.target.value); setGoalPlayer(""); }} required>
            <option value="">Izaberi ekipu</option>
            {teams.filter((t) => !t.is_placeholder).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <label>Igrač</label>
          <select value={goalPlayer} onChange={(e) => setGoalPlayer(e.target.value)}>
            <option value="">Upiši ručno</option>
            {goalPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label>Ime strijelca ako nije na spisku</label>
          <input value={goalName} onChange={(e) => setGoalName(e.target.value)} disabled={Boolean(goalPlayer)} />
          <label>Broj golova</label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <button>Dodaj golove</button>
        </form>
      </div>
    </section>
  );
}
