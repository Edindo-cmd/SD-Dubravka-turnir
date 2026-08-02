# Turnir SD Dubravka — testirana V1

Ovaj projekt je lokalno testiran komandama:

```bash
npm install
npm run build
```

## GitHub

Raspakuj ZIP i prenesi sadržaj direktno u root repozitorija. `package.json`, `index.html` i folder `src` moraju biti na prvoj razini.

## Vercel

- Framework Preset: Vite
- Root Directory: prazno
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

Environment variables:

```text
VITE_SUPABASE_URL=https://buvxjvkbvgkqqjocabkr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<tvoj publishable ključ>
```

## Supabase

U SQL Editoru pokreni `supabase/schema.sql`.

Nakon deploya u:

Authentication → URL Configuration

postavi Vercel adresu kao Site URL i dodaj:

```text
https://tvoj-projekt.vercel.app/**
```

u Redirect URLs.


## Redizajn

Nova verzija sadrži:

- izdvojen grb SD Dubravka u zaglavlju i podnožju
- diskretnu stadion pozadinu bez čitljivog rasporeda u pozadini
- bolje kartice i tipografiju
- mobilnu donju navigaciju
- optimizovan prikaz utakmica za manje ekrane

Za objavu zamijeni postojeće datoteke sadržajem ovog projekta i uradi commit/push. Vercel će automatski redeployati isti javni URL.
