# Terracraft estimator

A prospect opens one page, enters measurements for a paver patio, a retaining wall, or both, and sees an installed price. The rate steps down as the job gets larger. The short form saves their contact details, the measurements, and the price they were shown.

## Run

```bash
npm start
```

Open http://localhost:3000

```bash
npm test
```

Leads are written to `data/leads.json` on this machine.

## Lead list

The public page has no admin link. To review saved leads locally:

```bash
SHOW_ADMIN=1 npm start
```

Then open http://localhost:3000/admin
