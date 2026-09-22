const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withMockupEvidenceCleartext(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = androidConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Android manifest application node is required');
    }

    application.$ = {
      ...application.$,
      'android:usesCleartextTraffic': 'true',
    };
    return androidConfig;
  });
};
