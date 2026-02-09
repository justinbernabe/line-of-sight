# Line of Sight

A browser app that:
- tracks your live GPS position,
- geocodes an address you type in,
- points a stylized compass toward that destination,
- and keeps re-orienting as your location/heading changes.

## Run

Open `index.html` in a modern browser, or serve the folder with any static file server.

Example:

```bash
npx serve .
```

## Use

1. Click **Start Location Tracking** and allow location permission.
2. Click **Enable Compass Sensor** and allow orientation permission (required on iOS Safari).
3. Enter an address and click **Set Target**.
4. The needle points to the destination relative to your current facing direction.

## Notes

- Address geocoding uses OpenStreetMap Nominatim.
- If device orientation is unavailable, the app falls back to GPS movement heading or the manual slider.
- For best results, test on a phone outdoors where GPS and orientation sensors are stable.
