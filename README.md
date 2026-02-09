# Line of Sight

A mobile-first compass web app that:
- requests GPS and motion permissions,
- geocodes an address you type in,
- points a stylized compass toward that destination,
- and re-orients as your heading or position changes.

## Run

Open `index.html` in a modern browser, or serve the folder with any static file server.

Example:

```bash
npx serve .
```

## Use

1. Tap **Enable GPS + Motion** and allow both permissions.
2. Enter an address and tap **Point Compass**.
3. Follow the guidance readout while the compass updates live.

## Notes

- Host over HTTPS for motion/location APIs (GitHub Pages works).
- Address geocoding uses OpenStreetMap Nominatim.
- If motion sensors are unavailable, the app falls back to GPS heading while moving, or manual heading.
