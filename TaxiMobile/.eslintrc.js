module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Enforced explicitly (the @react-native preset also enables it) so the
    // "Rendered more hooks than during the previous render" crash can never
    // slip back in — this is what bit SubscriptionStatusBanner.
    'react-hooks/rules-of-hooks': 'error',
  },
};
