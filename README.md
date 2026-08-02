# Turnir SD Dubravka — statička verzija bez builda

Ova verzija nema npm, React build niti Vite. Vercel je objavljuje kao običnu statičku stranicu, pa nema greške `main.jsx` ili `npm run build`.

## GitHub

U novi ili očišćeni repository prenesi direktno:

- `index.html`
- `app.js`
- `config.js`
- `styles.css`
- `vercel.json`
- `public/`
- `supabase/`

## Vercel

- Framework Preset: **Other**
- Build Command: ostavi prazno / Override isključen
- Output Directory: ostavi prazno
- Root Directory: prazno

Nisu potrebne environment varijable jer su Supabase URL i publishable key u `config.js`. Publishable key je namijenjen klijentskoj aplikaciji; zaštita izmjena je u RLS pravilima.

## Supabase

U SQL Editoru pokreni cijeli sadržaj `supabase/schema.sql`.

Nakon deploya u Authentication → URL Configuration:

- Site URL: Vercel adresa
- Redirect URLs: `https://tvoj-projekat.vercel.app/**`
