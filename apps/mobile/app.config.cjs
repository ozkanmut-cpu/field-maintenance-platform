const app = require('./app.json');

const evidenceMode = process.env.EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE === '1';

module.exports = () => ({
  ...app,
  expo: {
    ...app.expo,
    android: {
      ...app.expo.android,
      ...(evidenceMode ? { usesCleartextTraffic: true } : {}),
    },
  },
});
