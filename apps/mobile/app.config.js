const appJson = require('./app.json');

const evidenceMode = process.env.EXPO_PUBLIC_MOCKUP_EVIDENCE_MODE === '1';

module.exports = () => {
  const config = appJson.expo;

  return {
    ...config,
    plugins: evidenceMode
      ? [...(config.plugins ?? []), './plugins/withMockupEvidenceCleartext']
      : config.plugins,
  };
};
