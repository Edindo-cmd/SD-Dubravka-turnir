import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import QRCode from 'https://esm.sh/qrcode@1.5.4'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const fallbackMatches = [
  ['Kafadar Gnojnice', 'Barber shop Sema'],
  ['Bobanovo', 'Barber shop Šule'],
  ['Hercegovina Kup', 'Turnir Stolac'],
  ['Dubrave', 'Turnir Dračevice'],
  ['KMF Moderna', 'Vukovi sa Zeca'],
  ['Caffe Pink Caffe Label G&L Company', 'Kairo'],
  ['Bijelo Polje', 'Narentas'],
  ['KMF Akademac', 'KMF Nevesinje'],
  ['Alumina', 'Za Almina, Enisa i Dalilu'],
  ['Bingo Pumpa', 'Caja Prom'],
  ['F.K Blagaj', 'SD Dubravka'],
].map(([home_name, away_name], index) => ({
  id: `demo-${index + 1}`,
  match_number: index + 1,
  home_name, away_name,
  home_score: null, away_score: null,
  status: 'scheduled', scheduled_at: null, evening_title: null,
}))

let matches = fallbackMatches
let currentSession = null
let currentIsAdmin = false

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function notify(text, type = 'info') {
  $('#message').innerHTML = text ? `<div class="notice ${type}">${escapeHtml(text)}</div>` : ''
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
}

function formatTime(value) {
  if (!value) return 'Termin naknadno'
  return new Intl.DateTimeFormat('bs-BA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function renderMatches() {
  const root = $('#matches')
  root.innerHTML = matches.map((m) => {
    const score = m.home_score == null || m.away_score == null ? 'VS' : `${m.home_score} : ${m.away_score}`
    return `<article class="match-card">
      <div class="match-head"><span>Utakmica ${m.match_number}</span><small>${escapeHtml(m.evening_title || formatTime(m.scheduled_at))}</small></div>
      <div class="match-line"><strong>${escapeHtml(m.home_name)}</strong><b>${score}</b><strong>${escapeHtml(m.away_name)}</strong></div>
      ${m.evening_title ? `<div class="match-time">${escapeHtml(formatTime(m.scheduled_at))}</div>` : ''}
    </article>`
  }).join('')
  $('#progress').textContent = `${matches.filter(m => m.status === 'finished').length}/${matches.length} završeno`
  fillMatchSelects()
}

function fillMatchSelects() {
  const options = matches.map(m => `<option value="${m.id}">${m.match_number}. ${escapeHtml(m.home_name)} – ${escapeHtml(m.away_name)}</option>`).join('')
  $('#match-select').innerHTML = options
  $('#goal-match').innerHTML = options
  loadSelectedMatch()
}

function loadSelectedMatch() {
  const m = matches.find(x => x.id === $('#match-select').value)
  if (!m) return
  $('#home-score').value = m.home_score ?? ''
  $('#away-score').value = m.away_score ?? ''
  $('#match-status').value = m.status || 'scheduled'
  $('#evening-title').value = m.evening_title || ''
  $('#scheduled-at').value = m.scheduled_at ? new Date(m.scheduled_at).toISOString().slice(0,16) : ''
}

async function loadData() {
  const [{ data: matchRows, error: matchError }, { data: scorerRows, error: scorerError }] = await Promise.all([
    supabase.from('matches_public').select('*').order('match_number'),
    supabase.from('scorers_public').select('*').order('goals', { ascending: false }).order('player_name'),
  ])

  if (matchError) {
    notify(`Supabase baza još nije spremna: ${matchError.message}`, 'warn')
    matches = fallbackMatches
  } else {
    matches = matchRows?.length ? matchRows : fallbackMatches
  }
  renderMatches()

  const body = $('#scorers-body')
  if (scorerError || !scorerRows?.length) {
    body.innerHTML = ''
    $('#no-scorers').classList.remove('hidden')
  } else {
    $('#no-scorers').classList.add('hidden')
    body.innerHTML = scorerRows.map((s, i) => `<tr><td>${i+1}</td><td>${escapeHtml(s.player_name)}</td><td>${escapeHtml(s.team_name)}</td><td><b>${s.goals}</b></td></tr>`).join('')
  }
}

async function refreshAuthUI() {
  if (!currentSession) {
    $('#login-panel').classList.remove('hidden')
    $('#no-access').classList.add('hidden')
    $('#admin-panel').classList.add('hidden')
    return
  }
  const email = currentSession.user?.email?.toLowerCase()
  const { data } = await supabase.from('admins').select('email').eq('email', email).maybeSingle()
  currentIsAdmin = Boolean(data)
  $('#login-panel').classList.add('hidden')
  $('#no-access').classList.toggle('hidden', currentIsAdmin)
  $('#admin-panel').classList.toggle('hidden', !currentIsAdmin)
}

$$('.nav button').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav button').forEach(b => b.classList.remove('active'))
  $$('.tab').forEach(t => t.classList.remove('active'))
  btn.classList.add('active')
  $(`#tab-${btn.dataset.tab}`).classList.add('active')
}))

$('#match-select').addEventListener('change', loadSelectedMatch)

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = $('#login-email').value.trim()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  notify(error ? error.message : 'Magic Link je poslan na e-mail.', error ? 'error' : 'success')
})

$('#match-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const id = $('#match-select').value
  const { error } = await supabase.from('matches').update({
    home_score: $('#home-score').value === '' ? null : Number($('#home-score').value),
    away_score: $('#away-score').value === '' ? null : Number($('#away-score').value),
    status: $('#match-status').value,
    evening_title: $('#evening-title').value.trim() || null,
    scheduled_at: $('#scheduled-at').value ? new Date($('#scheduled-at').value).toISOString() : null,
  }).eq('id', id)
  notify(error ? error.message : 'Utakmica je sačuvana.', error ? 'error' : 'success')
  if (!error) loadData()
})

$('#goal-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const { error } = await supabase.from('goals').insert({
    match_id: $('#goal-match').value,
    team_name: $('#goal-team').value.trim(),
    player_name: $('#goal-player').value.trim(),
    quantity: Number($('#goal-quantity').value),
  })
  notify(error ? error.message : 'Strijelac je dodat.', error ? 'error' : 'success')
  if (!error) {
    $('#goal-player').value = ''
    $('#goal-quantity').value = '1'
    loadData()
  }
})

$('#logout').addEventListener('click', () => supabase.auth.signOut())
$('#logout-no-access').addEventListener('click', () => supabase.auth.signOut())

const { data: initialAuth } = await supabase.auth.getSession()
currentSession = initialAuth.session
await refreshAuthUI()
await loadData()

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentSession = session
  await refreshAuthUI()
})

try {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, window.location.origin, { width: 76, margin: 0, color: { dark: '#ffffff', light: '#00000000' } })
  $('#qr').appendChild(canvas)
} catch (_) {}
