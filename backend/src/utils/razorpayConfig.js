// EMI checkout is switched off while only one payment gateway is in use, so every course uses the standard
// configuration. When RAZORPAY_CONFIG_STANDARD is unset the order is created without a configuration id and
// Razorpay shows its default checkout.
const getCheckoutConfigurationId = (_emiEnabled, env = process.env) => {
  const configurationId = env.RAZORPAY_CONFIG_STANDARD;
  return typeof configurationId === 'string' ? configurationId.trim() || null : null;
};

module.exports = { getCheckoutConfigurationId };
