// Root exports stay unchanged. GitHub Pages supplies a subpath for its separate build.
module.exports = ({ config }) => {
  const basePath = (process.env.SERGEANT_WEB_BASE_PATH ?? '').replace(/\/$/, '');
  if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) {
    throw new Error('SERGEANT_WEB_BASE_PATH must be an absolute URL path without a trailing slash.');
  }
  return { ...config, experiments: { ...config.experiments, baseUrl: basePath } };
};
